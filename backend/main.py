"""FastAPI backend for the student-dropout XAI app.

Run from the repository root:

    backend/.venv/Scripts/python -m uvicorn backend.main:app --reload --port 8000

All paths are resolved relative to the repository root, so the working directory
does not matter. Artifacts are produced by ``backend/train.py``.
"""

from __future__ import annotations

import copy
import json
import math
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator, Literal

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from lime.lime_tabular import LimeTabularExplainer
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
MODELS_DIR = ARTIFACTS / "models"
FIGURES = ROOT / "figures"
DATA_CSV = ROOT / "data.csv"

TOP_SHAP = 8
LIME_FEATURES = 10
LIME_SAMPLES = 5000
RESULT_TABLES = ["statistical_tests", "fairness_gaps", "shap_group_differences", "stage_fairness_gaps",
                 "stage_gap_changes", "stage_blind_comparison"]
ARTIFACT_RESULTS = ["stage_group_metrics", "stage_shap_shares"]


# --------------------------------------------------------------------------- figure catalogue
# Titles follow the plot titles used in student_dropout_xai.ipynb.
FIGURE_TITLES: dict[str, str] = {
    "01_effect_sizes.png": "Association of each feature with the outcome (effect sizes)",
    "02_top_feature_boxplot.png": "Curricular units 2nd sem (approved) by outcome",
    "03_dropout_rates.png": "Dropout rate by tuition status, scholarship, debtor status and gender",
    "04_feature_selection_votes.png": "Which method selected which feature (1 = selected)",
    "05_friedman_nemenyi.png": "Model scores across CV folds and Nemenyi post-hoc p-values",
    "06_critical_difference.png": "Critical-difference diagram (models joined by a bar are not significantly different)",
    "07_feature_selection_friedman.png": "Feature-selection strategies (XGBoost, 10 folds)",
    "08_confusion_matrix.png": "Confusion matrix of the final model on the test set",
    "09_shap_bar.png": "Global feature importance (SHAP), by class",
    "10_shap_beeswarm_dropout.png": "SHAP beeswarm - class: Dropout",
    "11_shap_beeswarm_graduate.png": "SHAP beeswarm - class: Graduate",
    "12_shap_dependence.png": "SHAP dependence plots for the two most important features (Dropout class)",
    "13_shap_waterfall_Dropout.png": "SHAP waterfall - a student predicted Dropout",
    "13_shap_waterfall_Enrolled.png": "SHAP waterfall - a student predicted Enrolled",
    "13_shap_waterfall_Graduate.png": "SHAP waterfall - a student predicted Graduate",
    "14_lime_Dropout.png": "LIME - a student explained for class Dropout",
    "14_lime_Enrolled.png": "LIME - a student explained for class Enrolled",
    "14_lime_Graduate.png": "LIME - a student explained for class Graduate",
    "15_shap_vs_lime.png": "SHAP vs LIME agreement: top-10 overlap (Jaccard) and Spearman rank correlation",
    "16_group_error_rates.png": "Group-wise performance of the screening model (95% bootstrap CI)",
    "17_shap_by_group_heatmap.png": "Mean |SHAP| (Dropout class) per feature and group",
    "18_shap_group_effects.png": "Largest group differences in feature reliance",
    "19_age_reliance_matched.png": "Age reliance: same age band, different gender, and the direct effect of Gender",
    "20_mitigation.png": "Mitigation: single threshold vs group-specific thresholds",
    "21_stage_tpr_by_group.png": "Recall (TPR) by group as more information becomes available",
    "22_stage_auc_by_group.png": "AUC by group as more information becomes available",
    "23_stage_gaps.png": "Largest gaps between groups in recall and false-positive rate, by stage",
    "24_stage_shap_shares.png": "What the model bases its decisions on, by stage (share of |SHAP|)",
    "25_stage_blind_gaps.png": "Recall gaps with and without sensitive attributes, by stage",
    "lime_Dropout.html": "Interactive LIME explanation - student predicted Dropout",
    "lime_Enrolled.html": "Interactive LIME explanation - student predicted Enrolled",
    "lime_Graduate.html": "Interactive LIME explanation - student predicted Graduate",
}


def figure_section(file: str) -> str:
    if file.startswith("lime_"):
        return "explainability"
    num = int(file[:2])
    if num <= 3:
        return "statistics"
    if num == 4:
        return "feature_selection"
    if num <= 8:
        return "model_comparison"
    if num <= 15:
        return "explainability"
    if num <= 20:
        return "fairness"
    return "staged"


def figure_title(file: str) -> str:
    if file in FIGURE_TITLES:
        return FIGURE_TITLES[file]
    stem = Path(file).stem
    return stem.split("_", 1)[-1].replace("_", " ").capitalize()


# --------------------------------------------------------------------------- state
@dataclass
class ModelBundle:
    stage: int
    blind: bool
    model: Any
    features: list[str]
    classes: list[str]
    dtypes: dict[str, Any]
    shap_explainer: shap.TreeExplainer
    lime_explainer: LimeTabularExplainer
    oof_dropout: np.ndarray
    flag_threshold: float


@dataclass
class AppState:
    bundles: dict[tuple[int, bool], ModelBundle]
    metadata: dict[str, Any]
    metrics: dict[str, Any]
    feature_meta: dict[str, dict[str, Any]]
    examples: dict[str, Any]
    data: pd.DataFrame  # cleaned data.csv including Target


def load_bundle(path: Path) -> ModelBundle:
    raw = joblib.load(path)
    X_train: pd.DataFrame = raw["X_train"]
    shap_explainer = raw.get("shap_explainer") or shap.TreeExplainer(raw["model"])
    lime_explainer = raw.get("lime_explainer") or LimeTabularExplainer(
        training_data=X_train.to_numpy(), feature_names=raw["features"], class_names=raw["classes"],
        mode="classification", discretize_continuous=True, random_state=42)
    return ModelBundle(
        stage=int(raw["stage"]), blind=raw["variant"] == "blind", model=raw["model"],
        features=list(raw["features"]), classes=list(raw["classes"]),
        dtypes={c: X_train[c].dtype for c in X_train.columns},
        shap_explainer=shap_explainer, lime_explainer=lime_explainer,
        oof_dropout=np.asarray(raw["oof_dropout"], dtype=float), flag_threshold=float(raw["flag_threshold"]),
    )


def load_data() -> pd.DataFrame:
    df = pd.read_csv(DATA_CSV, sep=";")
    df.columns = [c.strip() for c in df.columns]
    return df.rename(columns={"Nacionality": "Nationality"})


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_state() -> AppState:
    missing = [p for p in (ARTIFACTS / "feature_metadata.json", ARTIFACTS / "model_metrics.json") if not p.exists()]
    if missing:
        raise RuntimeError(f"Artifacts missing ({', '.join(map(str, missing))}). Run backend/train.py first.")
    bundles = {}
    for stage in (0, 1, 2):
        for variant in ("aware", "blind"):
            b = load_bundle(MODELS_DIR / f"stage{stage}_{variant}.joblib")
            bundles[(stage, b.blind)] = b
    metadata = read_json(ARTIFACTS / "feature_metadata.json")
    examples_path = ARTIFACTS / "examples.json"
    return AppState(
        bundles=bundles, metadata=metadata, metrics=read_json(ARTIFACTS / "model_metrics.json"),
        feature_meta={f["name"]: f for f in metadata["features"]},
        examples=read_json(examples_path) if examples_path.exists() else {"typical": {}},
        data=load_data(),
    )


STATE: AppState | None = None


def state() -> AppState:
    if STATE is None:  # pragma: no cover - only if startup failed
        raise HTTPException(503, "Models are not loaded.")
    return STATE


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    global STATE
    STATE = load_state()
    yield


app = FastAPI(title="Student dropout XAI API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # Any localhost port, so a Vite dev server that moved off 5173 (or `vite preview` on 4173) still works.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
if FIGURES.is_dir():
    app.mount("/static/figures", StaticFiles(directory=FIGURES), name="figures")


@app.exception_handler(RequestValidationError)
async def request_validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Render body/query validation errors in the same {feature, msg} shape as feature errors."""
    detail = []
    for err in exc.errors():
        if err.get("type") == "json_invalid":
            detail.append({"feature": "body", "msg": "Request body is not valid JSON."})
            continue
        loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query")]
        if len(loc) >= 2 and loc[0] == "features":
            name = loc[1]
        else:
            name = ".".join(loc) or "body"
        detail.append({"feature": name, "msg": err.get("msg", "Invalid value.")})
    return JSONResponse(status_code=422, content={"detail": detail})


# --------------------------------------------------------------------------- schemas
class PredictRequest(BaseModel):
    stage: Literal[0, 1, 2]
    blind: bool = False
    features: dict[str, Any] = Field(default_factory=dict)


class ShapContribution(BaseModel):
    feature: str
    label: str
    value: float
    value_label: str
    shap: float
    direction: Literal["increases", "decreases"]


class ShapBlock(BaseModel):
    base_value: float
    output_space: str
    contributions: list[ShapContribution]


class Reliability(BaseModel):
    auc: float
    dropouts_caught: float
    level: Literal["weak", "moderate", "strong"]
    message: str


class PredictResponse(BaseModel):
    stage: int
    blind: bool
    probabilities: dict[str, float]
    predicted_class: str
    dropout_probability: float
    dropout_percentile: float
    flagged_at_risk: bool
    flag_threshold: float
    shap: ShapBlock
    reliability: Reliability


class LimeWeight(BaseModel):
    rule: str
    feature: str
    label: str
    value: float
    value_label: str
    weight: float


class LimeResponse(BaseModel):
    stage: int
    blind: bool
    predicted_class: str
    class_explained: str
    weights: list[LimeWeight]
    intercept: float
    local_prediction: float
    score: float
    num_samples: int


# --------------------------------------------------------------------------- validation
def _fmt(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def _to_number(raw: Any) -> float | None:
    if isinstance(raw, bool):
        return float(raw)
    if isinstance(raw, (int, float)):
        try:
            value = float(raw)
        except OverflowError:  # e.g. a JSON integer literal with hundreds of digits
            return None
    elif isinstance(raw, str) and raw.strip():
        try:
            value = float(raw.strip())
        except (ValueError, OverflowError):
            return None
    else:
        return None
    return value if math.isfinite(value) else None


def validate_features(st: AppState, bundle: ModelBundle, features: dict[str, Any]) -> dict[str, float]:
    """Return {feature: number} for the bundle's features or raise a 422 listing every problem."""
    errors: list[dict[str, str]] = []
    row: dict[str, float] = {}
    for name in bundle.features:
        meta = st.feature_meta[name]
        label = meta["label"]
        if name not in features or features[name] is None or features[name] == "":
            errors.append({"feature": name, "msg": f"'{label}' is required at this stage."})
            continue
        raw = features[name]
        if isinstance(raw, bool) and meta["type"] != "binary":
            errors.append({"feature": name, "msg": f"'{label}' must be a number, not true/false."})
            continue
        value = _to_number(raw)
        if value is None:
            shown = repr(raw) if len(repr(raw)) <= 40 else repr(raw)[:37] + "..."
            errors.append({"feature": name, "msg": f"'{label}' must be a number (got {shown})."})
            continue
        if meta["type"] in ("categorical", "binary"):
            allowed = {float(o["value"]): o["label"] for o in meta["options"]}
            if value not in allowed:
                shown = ", ".join(f"{_fmt(v)} ({lab})" for v, lab in list(allowed.items())[:12])
                more = "" if len(allowed) <= 12 else f", ... ({len(allowed)} codes in total)"
                errors.append({"feature": name,
                               "msg": f"'{label}': {_fmt(value)} is not an allowed code. Allowed: {shown}{more}."})
                continue
        else:
            if meta.get("integer") and not value.is_integer():
                errors.append({"feature": name, "msg": f"'{label}' must be a whole number (got {_fmt(value)})."})
                continue
            lo, hi = float(meta["min"]), float(meta["max"])
            if not lo <= value <= hi:
                errors.append({"feature": name,
                               "msg": f"'{label}' must be between {_fmt(lo)} and {_fmt(hi)} (got {_fmt(value)})."})
                continue
        row[name] = value
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    return row


def to_frame(bundle: ModelBundle, row: dict[str, float]) -> pd.DataFrame:
    df = pd.DataFrame([[row[f] for f in bundle.features]], columns=bundle.features)
    return df.astype(bundle.dtypes)


def value_label(meta: dict[str, Any], value: float) -> str:
    """Option label for coded features; the formatted number for numeric ones."""
    for opt in meta.get("options", []):
        if float(opt["value"]) == value:
            return str(opt["label"])
    return _fmt(round(value, 2))


def reliability(st: AppState, stage: int, blind: bool) -> Reliability:
    oof = st.metrics["stages"][str(stage)]["blind" if blind else "aware"]["oof"]
    auc, caught = float(oof["dropout_auc"]), float(oof["recall_top30"])
    pct = round(caught * 100)
    if auc < 0.8:
        level: Literal["weak", "moderate", "strong"] = "weak"
        leaning = ("sensitive attributes are hidden, but other background features (such as course or "
                   "application route) can still act as proxies for them" if blind
                   else "it leans heavily on age and gender")
        message = (f"Weak: at enrollment the model only has background information (AUC {auc:.2f}). "
                   f"Flagging the riskiest 30% would catch only about {pct}% of real dropouts, and {leaning}. "
                   "Treat this as a rough signal, never as a decision about a student.")
    elif auc < 0.9:
        level = "moderate"
        message = (f"Moderate: the model ranks students reasonably well (AUC {auc:.2f}) and would catch about "
                   f"{pct}% of real dropouts when flagging the riskiest 30%. Use it alongside human judgement.")
    else:
        level = "strong"
        message = (f"Strong: with academic results available the model ranks students well (AUC {auc:.2f}) and "
                   f"would catch about {pct}% of real dropouts when flagging the riskiest 30%. "
                   "It can still be wrong for individual students.")
    return Reliability(auc=auc, dropouts_caught=caught, level=level, message=message)


def get_bundle(st: AppState, req: PredictRequest) -> ModelBundle:
    return st.bundles[(req.stage, req.blind)]


# --------------------------------------------------------------------------- endpoints
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "models_loaded": STATE is not None and len(STATE.bundles) == 6}


@app.get("/api/metadata")
def metadata() -> dict[str, Any]:
    st = state()
    return {**st.metadata, "metrics": st.metrics}


@app.post("/api/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    st = state()
    bundle = get_bundle(st, req)
    row = validate_features(st, bundle, req.features)
    X = to_frame(bundle, row)
    proba = bundle.model.predict_proba(X)[0]
    c_drop = bundle.classes.index("Dropout")
    p_drop = float(proba[c_drop])
    percentile = float(100.0 * np.mean(bundle.oof_dropout < p_drop))

    sv = bundle.shap_explainer.shap_values(X)
    sv = np.stack(sv, axis=-1) if isinstance(sv, list) else np.asarray(sv)  # (1, n_features, n_classes)
    drop_sv = sv[0, :, c_drop]
    base = float(np.atleast_1d(bundle.shap_explainer.expected_value)[c_drop])
    order = np.argsort(-np.abs(drop_sv))[:TOP_SHAP]
    contributions = []
    for i in order:
        name = bundle.features[i]
        meta = st.feature_meta[name]
        contributions.append(ShapContribution(
            feature=name, label=meta["label"], value=row[name], value_label=value_label(meta, row[name]),
            shap=float(drop_sv[i]), direction="increases" if drop_sv[i] > 0 else "decreases"))

    return PredictResponse(
        stage=req.stage, blind=req.blind,
        probabilities={c: float(p) for c, p in zip(bundle.classes, proba)},
        predicted_class=bundle.classes[int(np.argmax(proba))],
        dropout_probability=p_drop,
        dropout_percentile=percentile,
        # Same rule as the notebook's flag_top: P(Dropout) >= 70th percentile of the OOF scores.
        # The percentile is for display only (it can read 70.0 just below the interpolated cutoff).
        flagged_at_risk=p_drop >= bundle.flag_threshold,
        flag_threshold=bundle.flag_threshold,
        shap=ShapBlock(base_value=base, output_space="log-odds (margin) of the Dropout class",
                       contributions=contributions),
        reliability=reliability(st, req.stage, req.blind),
    )


@app.post("/api/explain/lime", response_model=LimeResponse)
def explain_lime(req: PredictRequest) -> LimeResponse:
    """LIME is slow (a few seconds); this is a sync endpoint so FastAPI runs it in a threadpool."""
    st = state()
    bundle = get_bundle(st, req)
    row = validate_features(st, bundle, req.features)
    X = to_frame(bundle, row)
    proba = bundle.model.predict_proba(X)[0]
    pred = int(np.argmax(proba))

    def predict_fn(arr: np.ndarray) -> np.ndarray:
        return bundle.model.predict_proba(pd.DataFrame(arr, columns=bundle.features).astype(bundle.dtypes))

    # A private copy keeps the explainer's random state per request: same input -> same explanation,
    # and concurrent requests do not share a RandomState.
    explainer = copy.deepcopy(bundle.lime_explainer)
    exp = explainer.explain_instance(X.iloc[0].to_numpy(dtype=float), predict_fn, num_features=LIME_FEATURES,
                                     labels=(pred,), num_samples=LIME_SAMPLES)
    weights = []
    for (rule, w), (idx, _) in zip(exp.as_list(label=pred), exp.as_map()[pred]):
        name = bundle.features[idx]
        meta = st.feature_meta[name]
        weights.append(LimeWeight(rule=rule, feature=name, label=meta["label"], value=row[name],
                                  value_label=value_label(meta, row[name]), weight=float(w)))
    return LimeResponse(
        stage=req.stage, blind=req.blind,
        predicted_class=bundle.classes[pred], class_explained=bundle.classes[pred], weights=weights,
        intercept=float(exp.intercept[pred]), local_prediction=float(np.atleast_1d(exp.local_pred)[0]),
        score=float(exp.score), num_samples=LIME_SAMPLES,
    )


def _row_features(df: pd.DataFrame, i: int) -> dict[str, Any]:
    return {c: df.iloc[i][c].item() for c in df.columns if c != "Target"}


@app.get("/api/example")
def example(
    cls: str = Query("random", description="Dropout, Enrolled, Graduate or random"),
    typical: bool = Query(True, description="Deterministic typical row (ignored for cls=random)"),
    seed: int | None = Query(None, description="Optional seed for reproducible random rows"),
) -> dict[str, Any]:
    st = state()
    classes = st.metadata["classes"]
    match = next((c for c in classes if c.lower() == cls.lower()), None)
    if match is None and cls.lower() != "random":
        raise HTTPException(422, detail=[{"feature": "cls",
                                          "msg": f"cls must be one of {', '.join(classes)} or random."}])
    df = st.data
    if match is not None and typical and match in st.examples.get("typical", {}):
        i = int(st.examples["typical"][match]["row_index"])
    else:
        pool = np.arange(len(df)) if match is None else np.where(df["Target"].to_numpy() == match)[0]
        i = int(np.random.default_rng(seed).choice(pool))
    return {"cls": match or "random", "row_index": i, "actual_target": str(df.iloc[i]["Target"]),
            "typical": bool(match is not None and typical), "features": _row_features(df, i)}


@app.get("/api/results/tables")
def list_tables() -> list[str]:
    """Names of the result CSV tables (the two artifact results live under /api/results/{name})."""
    return [t for t in RESULT_TABLES if (ROOT / f"{t}.csv").exists()]


@app.get("/api/results/tables/{name}")
def get_table(name: str) -> dict[str, Any]:
    path = ROOT / f"{name}.csv"
    if name not in RESULT_TABLES or not path.exists():
        raise HTTPException(404, f"Unknown table '{name}'. Available: {', '.join(RESULT_TABLES)}.")
    df = pd.read_csv(path)
    return {"name": name, "columns": list(df.columns), "rows": json.loads(df.to_json(orient="records"))}


@app.get("/api/results/figures")
def list_figures() -> list[dict[str, str]]:
    if not FIGURES.is_dir():
        return []
    files = sorted(p.name for p in FIGURES.iterdir() if p.suffix.lower() in (".png", ".html"))
    return [{"file": f, "url": f"/static/figures/{f}", "title": figure_title(f), "section": figure_section(f),
             "kind": "lime_html" if f.endswith(".html") else "image"} for f in files]


@app.get("/api/results/{name}")
def get_artifact_result(name: str) -> Any:
    if name not in ARTIFACT_RESULTS:
        raise HTTPException(404, f"Unknown result '{name}'. Available: {', '.join(ARTIFACT_RESULTS)}.")
    return read_json(ARTIFACTS / f"{name}.json")
