"""API tests. Run from the repository root:

    backend/.venv/Scripts/python -m pytest backend/tests -q

Requires the artifacts produced by backend/train.py.
"""

from __future__ import annotations

import warnings
from collections.abc import Iterator
from typing import Any

import numpy as np
import pytest

warnings.filterwarnings("ignore", message=".*httpx.*")  # starlette's TestClient deprecation notice
from fastapi.testclient import TestClient  # noqa: E402

from backend.main import ARTIFACT_RESULTS, FRONTEND_DIST, RESULT_TABLES, app  # noqa: E402

STAGE_SIZES = {0: 22, 1: 30, 2: 36}
SENSITIVE = {"Age at enrollment", "Gender", "Nationality", "International"}


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def examples(client: TestClient) -> dict[str, dict[str, Any]]:
    return {cls: client.get("/api/example", params={"cls": cls}).json() for cls in ("Dropout", "Graduate", "Enrolled")}


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok", "models_loaded": True}


def test_metadata(client: TestClient) -> None:
    m = client.get("/api/metadata").json()
    assert m["classes"] == ["Dropout", "Enrolled", "Graduate"]
    assert {s["id"]: len(s["features"]) for s in m["stages"]} == STAGE_SIZES
    assert len(m["features"]) == 36
    assert m["label_source"].startswith("https://archive.ics.uci.edu/")
    by_name = {f["name"]: f for f in m["features"]}
    assert by_name["Gender"]["options"] == [{"value": 0, "label": "Female", "verified": True},
                                            {"value": 1, "label": "Male", "verified": True}]
    assert by_name["Gender"]["type"] == "binary"
    assert by_name["Course"]["type"] == "categorical"
    assert by_name["Debtor"]["stage"] == 1 and by_name["Curricular units 2nd sem (grade)"]["stage"] == 2
    assert by_name["Admission grade"]["type"] == "numeric" and by_name["Admission grade"]["min"] == 95
    for f in m["features"]:
        for opt in f.get("options", []):
            assert opt["verified"] or opt["label"] == f"Code {opt['value']}"
    for stage in ("0", "1", "2"):
        for variant in ("aware", "blind"):
            entry = m["metrics"]["stages"][stage][variant]
            assert {"holdout", "oof", "flag_threshold", "n_features"} <= set(entry)


@pytest.mark.parametrize("stage", [0, 1, 2])
@pytest.mark.parametrize("blind", [False, True])
@pytest.mark.parametrize("cls", ["Dropout", "Graduate"])
def test_predict(client: TestClient, examples: dict[str, Any], stage: int, blind: bool, cls: str) -> None:
    r = client.post("/api/predict", json={"stage": stage, "blind": blind, "features": examples[cls]["features"]})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["stage"] == stage and j["blind"] is blind
    assert abs(sum(j["probabilities"].values()) - 1) < 1e-5
    assert j["predicted_class"] == max(j["probabilities"], key=j["probabilities"].get)
    assert 0 <= j["dropout_percentile"] <= 100
    assert j["flagged_at_risk"] == (j["dropout_probability"] >= j["flag_threshold"])
    contribs = j["shap"]["contributions"]
    assert len(contribs) == 8
    assert all(abs(a["shap"]) >= abs(b["shap"]) for a, b in zip(contribs, contribs[1:]))
    assert all(isinstance(c["value_label"], str) and c["value_label"] for c in contribs)
    if blind:
        assert not SENSITIVE & {c["feature"] for c in contribs}
    assert j["reliability"]["level"] == ("weak" if stage == 0 else "strong")
    if stage == 0:
        assert ("age and gender" in j["reliability"]["message"]) is not blind
    if stage == 2:  # the full model should get typical students right
        assert j["predicted_class"] == cls


def test_predict_ignores_extra_keys_and_accepts_numeric_strings(client: TestClient, examples: dict[str, Any]) -> None:
    feats = {k: str(v) for k, v in examples["Graduate"]["features"].items()} | {"Unknown column": 1}
    assert client.post("/api/predict", json={"stage": 0, "blind": False, "features": feats}).status_code == 200


def test_blind_does_not_require_sensitive(client: TestClient, examples: dict[str, Any]) -> None:
    feats = {k: v for k, v in examples["Dropout"]["features"].items() if k not in SENSITIVE}
    assert client.post("/api/predict", json={"stage": 1, "blind": True, "features": feats}).status_code == 200
    r = client.post("/api/predict", json={"stage": 1, "blind": False, "features": feats})
    assert r.status_code == 422
    assert {d["feature"] for d in r.json()["detail"]} == SENSITIVE


def _errors(client: TestClient, features: dict[str, Any], stage: int = 2) -> dict[str, str]:
    r = client.post("/api/predict", json={"stage": stage, "blind": False, "features": features})
    assert r.status_code == 422, r.text
    return {d["feature"]: d["msg"] for d in r.json()["detail"]}


def test_422_lists_every_problem(client: TestClient, examples: dict[str, Any]) -> None:
    bad = dict(examples["Dropout"]["features"])
    del bad["Course"]
    bad |= {"Age at enrollment": 200, "Gender": 3, "Admission grade": "abc",
            "Curricular units 1st sem (approved)": 2.5, "Marital status": 99}
    errs = _errors(client, bad)
    assert set(errs) == {"Course", "Age at enrollment", "Gender", "Admission grade",
                         "Curricular units 1st sem (approved)", "Marital status"}
    assert "required" in errs["Course"]
    assert "between 17 and 70" in errs["Age at enrollment"]
    assert "not an allowed code" in errs["Gender"]
    assert "must be a number" in errs["Admission grade"]
    assert "whole number" in errs["Curricular units 1st sem (approved)"]


def test_422_empty_features_lists_all_required(client: TestClient) -> None:
    assert len(_errors(client, {}, stage=0)) == 22


@pytest.mark.parametrize("body", [{"stage": 5, "features": {}}, {"stage": 0, "features": []}, {"blind": True}])
def test_422_bad_body(client: TestClient, body: dict[str, Any]) -> None:
    r = client.post("/api/predict", json=body)
    assert r.status_code == 422
    assert all({"feature", "msg"} <= set(d) for d in r.json()["detail"])


def test_lime(client: TestClient, examples: dict[str, Any]) -> None:
    body = {"stage": 2, "blind": False, "features": examples["Dropout"]["features"]}
    j = client.post("/api/explain/lime", json=body).json()
    assert j["predicted_class"] == j["class_explained"] == "Dropout"
    assert len(j["weights"]) == 10 and j["num_samples"] == 5000
    assert all(w["feature"] in w["rule"] for w in j["weights"])
    again = client.post("/api/explain/lime", json=body).json()
    assert again["weights"] == j["weights"]  # deterministic per input
    blind = client.post("/api/explain/lime", json=body | {"blind": True, "stage": 0}).json()
    assert not SENSITIVE & {w["feature"] for w in blind["weights"]}


def test_lime_validation(client: TestClient) -> None:
    assert client.post("/api/explain/lime", json={"stage": 0, "blind": False, "features": {}}).status_code == 422


@pytest.mark.parametrize("cls", ["Dropout", "Graduate", "Enrolled"])
def test_example_typical_is_deterministic(client: TestClient, cls: str) -> None:
    a = client.get("/api/example", params={"cls": cls}).json()
    b = client.get("/api/example", params={"cls": cls}).json()
    assert a == b and a["actual_target"] == cls and len(a["features"]) == 36


def test_example_random(client: TestClient) -> None:
    r = client.get("/api/example", params={"cls": "random", "seed": 1}).json()
    assert r["cls"] == "random" and len(r["features"]) == 36
    assert client.get("/api/example", params={"cls": "random", "seed": 1}).json() == r
    d = client.get("/api/example", params={"cls": "Dropout", "typical": "false"}).json()
    assert d["actual_target"] == "Dropout"
    assert client.get("/api/example", params={"cls": "Nope"}).status_code == 422


def test_tables(client: TestClient) -> None:
    assert client.get("/api/results/tables").json() == RESULT_TABLES
    for name in RESULT_TABLES:
        j = client.get(f"/api/results/tables/{name}").json()
        assert j["name"] == name and j["columns"] and j["rows"]
        assert set(j["rows"][0]) == set(j["columns"])
    stats = client.get("/api/results/tables/statistical_tests").json()["rows"]
    assert isinstance(stats[0]["significant (FDR<0.05)"], bool)
    assert client.get("/api/results/tables/nope").status_code == 404


def test_artifact_results(client: TestClient) -> None:
    for name in ARTIFACT_RESULTS:
        j = client.get(f"/api/results/{name}").json()
        assert [s["stage"] for s in j["stages"]] == [0, 1, 2]
    groups = client.get("/api/results/stage_group_metrics").json()["stages"][0]["groups"]
    assert len(groups) == 8 and {"TPR_lo", "TPR_hi", "AUC", "FPR"} <= set(groups[0])
    shares = client.get("/api/results/stage_shap_shares").json()
    assert len(shares["categories"]) == 7 and shares["sensitive_features"]
    s0 = shares["stages"][0]
    assert abs(sum(s0["category_shares"].values()) - 1) < 1e-6
    assert abs(s0["all_sensitive"] - sum(s0["sensitive_shares"].values())) < 1e-9
    assert len(s0["top_features"]) == 5
    assert client.get("/api/results/nope").status_code == 404


def test_figures_and_static(client: TestClient) -> None:
    figs = client.get("/api/results/figures").json()
    assert len(figs) == 32
    sections = {f["file"]: f["section"] for f in figs}
    assert sections["04_feature_selection_votes.png"] == "feature_selection"
    assert sections["lime_Dropout.html"] == "explainability"
    assert sections["25_stage_blind_gaps.png"] == "staged"
    assert all(f["title"] for f in figs)
    assert {f["kind"] for f in figs} == {"image", "lime_html"}
    r = client.get(figs[0]["url"])
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"


def test_cors(client: TestClient) -> None:
    r = client.options("/api/predict", headers={"Origin": "http://localhost:5173",
                                                "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_any_localhost_port(client: TestClient) -> None:
    for origin in ("http://localhost:5174", "http://127.0.0.1:4173"):
        r = client.options("/api/predict", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
        assert r.headers.get("access-control-allow-origin") == origin
    r = client.options("/api/predict", headers={"Origin": "http://evil.example",
                                                "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers


def test_huge_integer_is_422(client: TestClient, examples: dict[str, Any]) -> None:
    bad = dict(examples["Dropout"]["features"]) | {"Admission grade": 10**400}
    for path in ("/api/predict", "/api/explain/lime"):
        r = client.post(path, json={"stage": 0, "blind": True, "features": bad})
        assert r.status_code == 422, r.text
        assert "must be a number" in {d["feature"]: d["msg"] for d in r.json()["detail"]}["Admission grade"]


def test_invalid_json_body(client: TestClient) -> None:
    r = client.post("/api/predict", content=b"not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 422
    assert r.json()["detail"] == [{"feature": "body", "msg": "Request body is not valid JSON."}]


def test_flag_matches_threshold_near_cutoff(client: TestClient, examples: dict[str, Any],
                                           monkeypatch: pytest.MonkeyPatch) -> None:
    """Just below the interpolated cutoff the percentile already reads >= 70; the flag must still be off."""
    from backend import main

    assert main.STATE is not None
    bundle = main.STATE.bundles[(0, False)]
    below = np.sort(bundle.oof_dropout[bundle.oof_dropout < bundle.flag_threshold])
    p = float((below[-1] + bundle.flag_threshold) / 2)
    c_drop = bundle.classes.index("Dropout")

    class Stub:
        def predict_proba(self, X: Any) -> np.ndarray:
            proba = np.full((len(X), len(bundle.classes)), (1 - p) / (len(bundle.classes) - 1))
            proba[:, c_drop] = p
            return proba

    monkeypatch.setattr(bundle, "model", Stub())
    j = client.post("/api/predict", json={"stage": 0, "blind": False,
                                         "features": examples["Dropout"]["features"]}).json()
    assert j["dropout_percentile"] >= 70
    assert j["dropout_probability"] < j["flag_threshold"]
    assert j["flagged_at_risk"] is False


@pytest.mark.skipif(not FRONTEND_DIST.is_dir(), reason="frontend not built (cd frontend && npm run build)")
def test_frontend_served_behind_api_routes(client: TestClient) -> None:
    page = {"Accept": "text/html"}
    for path in ("/", "/predict", "/some/client/route"):  # client-side routes fall back to index.html
        r = client.get(path, headers=page)
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert client.get("/api/health", headers=page).json()["status"] == "ok"  # API routes win
    r = client.get("/api/unknown", headers={"Accept": "application/json"})  # API calls never get index.html
    assert r.status_code == 404 and "text/html" not in r.headers.get("content-type", "")
