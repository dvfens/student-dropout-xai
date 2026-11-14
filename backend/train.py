"""Train and save everything the API needs into ./artifacts.

Run from the repository root (any cwd works, paths are resolved from this file):

    backend/.venv/Scripts/python backend/train.py

The modelling logic replicates ``student_dropout_xai.ipynb``:
  * cleaning                    -> notebook cell 3
  * out-of-fold predictions     -> cell 38 (``oof_predict``: StratifiedKFold(5, shuffle=True, random_state=42))
  * stage feature sets          -> cell 55
  * top-30% flagging            -> cell 56 (``flag_top``)
  * group metrics + bootstrap   -> cell 58 (``stage_group_table``, B=300, RandomState(0))
  * SHAP shares by category     -> cell 65 (``category``)
  * blind variants              -> cell 67

The served models are fit on the stratified 80% training split
(train_test_split(test_size=0.2, stratify=y, random_state=42)), so the hold-out
metrics in model_metrics.json are honest. The out-of-fold P(Dropout)
distributions (used for percentiles and the at-risk flag) come from 5-fold CV
over all 4,424 students, exactly as in the notebook.
"""

from __future__ import annotations

import json
import pickle
import re
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parent.parent
DATA_CSV = ROOT / "data.csv"
ARTIFACTS = ROOT / "artifacts"
MODELS_DIR = ARTIFACTS / "models"
UCI_DOC = Path(__file__).resolve().parent / "data" / "uci_variables.json"

RANDOM_STATE = 42
CAP = 0.30  # flag the top 30% highest-risk students at every stage
SENSITIVE = ["Age at enrollment", "Gender", "Nationality", "International"]
STAGES: list[dict[str, Any]] = [
    {"id": 0, "key": "enrollment", "label": "At enrollment", "short": "S0 enrollment"},
    {"id": 1, "key": "after_sem1", "label": "After semester 1", "short": "S1 after sem 1"},
    {"id": 2, "key": "after_sem2", "label": "After semester 2", "short": "S2 after sem 2"},
]
LATER_FINANCE = ["Debtor", "Tuition fees up to date"]

# Notebook reference values (docs/CONTRACT.md) used for the verification table.
REF_OOF = {
    ("aware", 0): (0.772, 0.560), ("aware", 1): (0.906, 0.742), ("aware", 2): (0.926, 0.766),
    ("blind", 0): (0.763, 0.552), ("blind", 1): (0.906, 0.740), ("blind", 2): (0.925, 0.764),
}
REF_TPR = {
    "Female": (0.428, 0.699, 0.738), "Male": (0.696, 0.787, 0.796),
    "<=20": (0.240, 0.594, 0.642), "21-24": (0.504, 0.710, 0.746),
    "25-29": (0.882, 0.886, 0.866), "30+": (0.842, 0.881, 0.891),
    "Portuguese": (0.562, 0.742, 0.766), "Non-Portuguese": (0.500, 0.781, 0.781),
}
REF_ALL_SENSITIVE = (0.297, 0.112, 0.089)

CATEGORICAL = [
    "Marital status", "Application mode", "Course", "Previous qualification", "Nationality",
    "Mother's qualification", "Father's qualification", "Mother's occupation", "Father's occupation",
]
BINARY_LABELS: dict[str, dict[int, str]] = {
    "Gender": {0: "Female", 1: "Male"},
    "Daytime/evening attendance": {1: "Daytime", 0: "Evening"},
    "Debtor": {0: "No", 1: "Yes"},
    "Tuition fees up to date": {0: "No", 1: "Yes"},
    "Scholarship holder": {0: "No", 1: "Yes"},
    "Displaced": {0: "No", 1: "Yes"},
    "International": {0: "No", 1: "Yes"},
    "Educational special needs": {0: "No", 1: "Yes"},
}
# In the UCI documentation the nationality column is spelled "Nacionality".
UCI_NAME = {"Nationality": "Nacionality"}

SECTIONS = {
    "Personal": ["Marital status", "Gender", "Age at enrollment", "Nationality", "International",
                 "Displaced", "Educational special needs"],
    "Family": ["Mother's qualification", "Father's qualification", "Mother's occupation", "Father's occupation"],
    "Application and prior education": ["Application mode", "Application order", "Course",
                                        "Daytime/evening attendance", "Previous qualification",
                                        "Previous qualification (grade)", "Admission grade"],
    "Finance": ["Debtor", "Tuition fees up to date", "Scholarship holder"],
    "Economy": ["Unemployment rate", "Inflation rate", "GDP"],
}

# Plain-language labels and help texts (written for this app; not code labels).
FEATURE_TEXT: dict[str, tuple[str, str]] = {
    "Marital status": ("Marital status", "The student's marital status when they enrolled."),
    "Application mode": ("Application route", "How the student applied, for example the general national access phase, a special quota, a transfer or the over-23 route."),
    "Application order": ("Application preference", "Where this course was in the student's list of choices: 0 = first choice, 9 = last choice."),
    "Course": ("Course (degree programme)", "The degree programme the student enrolled in."),
    "Daytime/evening attendance": ("Daytime or evening classes", "Whether the student attends daytime or evening classes."),
    "Previous qualification": ("Previous qualification", "The highest level of education the student had before starting this course."),
    "Previous qualification (grade)": ("Grade of previous qualification", "Final grade of the previous qualification, on a 0-200 scale."),
    "Nationality": ("Nationality", "The student's nationality."),
    "Mother's qualification": ("Mother's education", "The highest level of education the student's mother completed."),
    "Father's qualification": ("Father's education", "The highest level of education the student's father completed."),
    "Mother's occupation": ("Mother's occupation", "The occupation group of the student's mother."),
    "Father's occupation": ("Father's occupation", "The occupation group of the student's father."),
    "Admission grade": ("Admission grade", "The grade the student was admitted with, on a 0-200 scale."),
    "Displaced": ("Studies away from home", "Whether the student moved away from their home area to study."),
    "Educational special needs": ("Special educational needs", "Whether the student has special educational needs."),
    "Debtor": ("Owes money to the university", "Whether the student has unpaid debts to the institution."),
    "Tuition fees up to date": ("Tuition fees paid on time", "Whether the student's tuition fee payments are up to date."),
    "Gender": ("Gender", "The student's gender as recorded in the dataset."),
    "Scholarship holder": ("Has a scholarship", "Whether the student receives a scholarship."),
    "Age at enrollment": ("Age at enrollment", "The student's age in years when they enrolled."),
    "International": ("International student", "Whether the student is an international student."),
    "Unemployment rate": ("Unemployment rate (%)", "Unemployment rate (%), as provided in the dataset (an economic indicator, not about the student)."),
    "Inflation rate": ("Inflation rate (%)", "Inflation rate (%), as provided in the dataset (an economic indicator, not about the student)."),
    "GDP": ("GDP indicator", "GDP indicator as provided in the dataset (the official description just says 'GDP'; the values, -4.06 to 3.51, look like annual growth in %)."),
}
_SEM_TEXT = {
    "credited": ("Subjects credited", "Number of subjects (curricular units) credited from earlier studies, so the student did not have to take them"),
    "enrolled": ("Subjects enrolled", "Number of subjects (curricular units) the student signed up for"),
    "evaluations": ("Exams/assessments taken", "Number of assessments (exams, projects) the student sat"),
    "approved": ("Subjects passed", "Number of subjects (curricular units) the student passed"),
    "grade": ("Average grade", "The student's average grade on a 0-20 scale (0 if nothing was graded)"),
    "without evaluations": ("Subjects without assessment", "Number of subjects the student was enrolled in but never sat an assessment for"),
}
for _sem, _word in (("1st", "1"), ("2nd", "2")):
    for _key, (_lab, _help) in _SEM_TEXT.items():
        FEATURE_TEXT[f"Curricular units {_sem} sem ({_key})"] = (
            f"{_lab} (semester {_word})", f"{_help} in semester {_word}.")


# --------------------------------------------------------------------------- data
def load_data() -> tuple[pd.DataFrame, pd.Series, list[str]]:
    """Notebook cell 3."""
    df = pd.read_csv(DATA_CSV, sep=";")
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={"Nacionality": "Nationality"})
    assert df.columns[0] == "Marital status", df.columns[0]
    assert df.shape == (4424, 37), df.shape
    le = LabelEncoder()
    y = pd.Series(le.fit_transform(df["Target"]), name="Target")
    class_names = [str(c) for c in le.classes_]
    assert class_names == ["Dropout", "Enrolled", "Graduate"]
    return df.drop(columns="Target"), y, class_names


def stage_features(columns: list[str]) -> dict[int, list[str]]:
    """Notebook cell 55. Order = column order in data.csv."""
    sem1 = [c for c in columns if "1st sem" in c]
    sem2 = [c for c in columns if "2nd sem" in c]
    return {
        0: [c for c in columns if c not in sem1 + sem2 + LATER_FINANCE],
        1: [c for c in columns if c not in sem2],
        2: list(columns),
    }


def make_xgb() -> XGBClassifier:
    return XGBClassifier(n_estimators=150, max_depth=4, learning_rate=0.1, subsample=0.8,
                         colsample_bytree=0.8, eval_metric="mlogloss", random_state=RANDOM_STATE)


def shap_3d(values: Any) -> np.ndarray:
    """Normalise SHAP output to (n_samples, n_features, n_classes)."""
    return np.stack(values, axis=-1) if isinstance(values, list) else np.asarray(values)


def oof_predict(X: pd.DataFrame, y: pd.Series, feats: list[str], with_shap: bool = False
                ) -> tuple[np.ndarray, np.ndarray | None]:
    """Notebook cell 38."""
    skf = StratifiedKFold(5, shuffle=True, random_state=RANDOM_STATE)
    P = np.zeros((len(X), 3))
    SV = np.zeros((len(X), len(feats), 3)) if with_shap else None
    for tr, te in skf.split(X, y):
        m = make_xgb().fit(X.iloc[tr][feats], y.iloc[tr])
        P[te] = m.predict_proba(X.iloc[te][feats])
        if with_shap:
            SV[te] = shap_3d(shap.TreeExplainer(m).shap_values(X.iloc[te][feats]))
    return P, SV


def flag_top(p_drop: np.ndarray, share: float = CAP) -> np.ndarray:
    """Notebook cell 56."""
    return (p_drop >= np.quantile(p_drop, 1 - share)).astype(int)


def mval(metric: str, yt: np.ndarray, fl: np.ndarray) -> float:
    """Notebook cell 40."""
    if len(yt) == 0:
        return float("nan")
    if metric == "flag_rate":
        return float(fl.mean())
    if metric == "TPR":
        return float(fl[yt == 1].mean())
    if metric == "FPR":
        return float(fl[yt == 0].mean())
    raise ValueError(metric)


# --------------------------------------------------------------------------- groups (cell 37)
AGE_ORDER = ["<=20", "21-24", "25-29", "30+"]
GROUP_ORDER = {"Gender": ["Female", "Male"], "Age group": AGE_ORDER, "Nationality": ["Portuguese", "Non-Portuguese"]}


def group_codes(X: pd.DataFrame) -> dict[str, np.ndarray]:
    sens = pd.DataFrame({
        "Gender": X["Gender"].map({0: "Female", 1: "Male"}),
        "Age group": pd.cut(X["Age at enrollment"], [0, 20, 24, 29, 100], labels=AGE_ORDER).astype(str),
        "Nationality": np.where(X["Nationality"] == 1, "Portuguese", "Non-Portuguese"),
    })
    return {a: sens[a].map({g: i for i, g in enumerate(GROUP_ORDER[a])}).to_numpy() for a in GROUP_ORDER}


def stage_group_table(p_drop: np.ndarray, fl: np.ndarray, is_drop: np.ndarray,
                      codes: dict[str, np.ndarray], B: int = 300) -> list[dict[str, Any]]:
    """Notebook cell 58 (bootstrap B=300 with a fresh RandomState(0) per group)."""
    rows = []
    for attr, groups in GROUP_ORDER.items():
        for i, g in enumerate(groups):
            idx = np.where(codes[attr] == i)[0]
            r: dict[str, Any] = {
                "attribute": attr, "group": g, "n": int(len(idx)),
                "TPR": mval("TPR", is_drop[idx], fl[idx]), "FPR": mval("FPR", is_drop[idx], fl[idx]),
                "flag_rate": float(fl[idx].mean()), "AUC": float(roc_auc_score(is_drop[idx], p_drop[idx])),
                "true_dropout_rate": float(is_drop[idx].mean()),
            }
            rng = np.random.RandomState(0)
            bs = []
            for _ in range(B):
                b = rng.choice(idx, len(idx))
                bs.append([mval("TPR", is_drop[b], fl[b]), mval("FPR", is_drop[b], fl[b]),
                           roc_auc_score(is_drop[b], p_drop[b])])
            arr = np.array(bs)
            for k, m in enumerate(["TPR", "FPR", "AUC"]):
                r[f"{m}_lo"] = float(np.nanpercentile(arr[:, k], 2.5))
                r[f"{m}_hi"] = float(np.nanpercentile(arr[:, k], 97.5))
            rows.append(r)
    return rows


# --------------------------------------------------------------------------- SHAP shares (cell 65)
CAT_ORDER = ["Personal", "Family background", "Application & prior education", "Economy", "Finance",
             "Semester 1 results", "Semester 2 results"]


def category(f: str) -> str:
    if "1st sem" in f:
        return "Semester 1 results"
    if "2nd sem" in f:
        return "Semester 2 results"
    if f in ["Debtor", "Tuition fees up to date", "Scholarship holder"]:
        return "Finance"
    if f in ["Age at enrollment", "Gender", "Nationality", "International", "Marital status", "Displaced",
             "Educational special needs"]:
        return "Personal"
    if "Mother's" in f or "Father's" in f:
        return "Family background"
    if f in ["Unemployment rate", "Inflation rate", "GDP"]:
        return "Economy"
    return "Application & prior education"


def shap_shares(sv: np.ndarray, feats: list[str], c_drop: int) -> dict[str, Any]:
    m = pd.Series(np.abs(sv[:, :, c_drop]).mean(0), index=feats)
    m = m / m.sum()
    cat_share = m.groupby(lambda f: category(f)).sum().reindex(CAT_ORDER).fillna(0)
    ranked = m.sort_values(ascending=False)
    return {
        "category_shares": {c: float(v) for c, v in cat_share.items()},
        "sensitive_shares": {f: float(m.get(f, 0.0)) for f in SENSITIVE},
        "all_sensitive": float(m.reindex(SENSITIVE).fillna(0).sum()),
        "top_features": [{"feature": f, "share": float(v)} for f, v in ranked.head(5).items()],
        "feature_shares": [{"feature": f, "share": float(v)} for f, v in ranked.items()],
    }


# --------------------------------------------------------------------------- metadata
_CODE_RE = re.compile(r"(?:^|(?<=\s)|(?<=;))(\d+)\s+-\s+")


def parse_codes(description: str) -> dict[int, str]:
    """Parse 'N - label N - label ...' (UCI variables table) into {code: label}.

    The labels are taken verbatim from the documentation; only the first letter is
    capitalised and trailing separators are stripped.
    """
    matches = list(_CODE_RE.finditer(description))
    out: dict[int, str] = {}
    for k, m in enumerate(matches):
        end = matches[k + 1].start() if k + 1 < len(matches) else len(description)
        label = description[m.end():end].strip().rstrip(";").strip()
        if label:
            out[int(m.group(1))] = label[0].upper() + label[1:]
    return out


def _step(values: pd.Series) -> float:
    decimals = 0
    for v in values.unique():
        s = repr(float(v)).rstrip("0").rstrip(".")
        if "." in s:
            decimals = max(decimals, len(s.split(".")[1]))
    return [1, 0.1, 0.01][min(decimals, 2)]


def build_metadata(X: pd.DataFrame, feats_by_stage: dict[int, list[str]], class_names: list[str]
                   ) -> dict[str, Any]:
    doc = json.loads(UCI_DOC.read_text(encoding="utf-8"))
    uci_vars: dict[str, str] = doc["variables"]
    section_of = {f: s for s, fs in SECTIONS.items() for f in fs}
    label_todo: list[str] = []
    features = []
    for col in X.columns:
        stage = 2 if col in feats_by_stage[2] and col not in feats_by_stage[1] else (
            1 if col not in feats_by_stage[0] else 0)
        if "1st sem" in col:
            section = "Semester 1"
        elif "2nd sem" in col:
            section = "Semester 2"
        else:
            section = section_of[col]
        label, help_text = FEATURE_TEXT[col]
        entry: dict[str, Any] = {"name": col, "label": label, "help": help_text, "stage": stage,
                                 "section": section, "sensitive": col in SENSITIVE}
        values = sorted(int(v) for v in X[col].unique()) if col in CATEGORICAL or col in BINARY_LABELS else []
        if col in BINARY_LABELS:
            entry["type"] = "binary"
            entry["options"] = [{"value": v, "label": BINARY_LABELS[col][v], "verified": True} for v in values]
        elif col in CATEGORICAL:
            entry["type"] = "categorical"
            codes = parse_codes(uci_vars[UCI_NAME.get(col, col)])
            opts = []
            for v in values:
                if v in codes:
                    opts.append({"value": v, "label": codes[v], "verified": True})
                else:
                    opts.append({"value": v, "label": f"Code {v}", "verified": False})
                    label_todo.append(f"{col}: code {v} label unverified")
            entry["options"] = opts
        else:
            s = X[col]
            is_int = bool(pd.api.types.is_integer_dtype(s))
            entry.update({"type": "numeric", "min": float(s.min()), "max": float(s.max()),
                          "median": float(s.median()), "integer": is_int,
                          "step": 1 if is_int else _step(s)})
            if is_int:
                entry["min"], entry["max"] = int(s.min()), int(s.max())
        features.append(entry)
    stages = [{"id": st["id"], "key": st["key"], "label": st["label"], "features": feats_by_stage[st["id"]],
               "blind_features": [f for f in feats_by_stage[st["id"]] if f not in SENSITIVE]} for st in STAGES]
    return {
        "features": features,
        "stages": stages,
        "classes": class_names,
        "sensitive_features": SENSITIVE,
        "label_source": doc["source_url"],
        "label_source_retrieved": doc["retrieved"],
        "label_todo": label_todo,
    }


# --------------------------------------------------------------------------- helpers
def picklable(obj: Any) -> bool:
    try:
        pickle.dumps(obj)
        return True
    except Exception:  # noqa: BLE001 - any pickling failure means "rebuild at startup"
        return False


def write_json(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")


def typical_rows(X: pd.DataFrame, y: pd.Series, P: np.ndarray, class_names: list[str]) -> dict[str, int]:
    """Typical row of each class: among students of that class whose stage-2 aware OOF
    prediction is also that class, the one whose OOF P(class) is the median of that subset
    (ties broken by the lowest row index)."""
    out = {}
    for c, name in enumerate(class_names):
        idx = np.where((y.to_numpy() == c) & (P.argmax(1) == c))[0]
        p = P[idx, c]
        med = np.median(p)
        order = np.lexsort((idx, np.abs(p - med)))
        out[name] = int(idx[order[0]])
    return out


# --------------------------------------------------------------------------- main
def main() -> None:
    from lime.lime_tabular import LimeTabularExplainer

    t0 = time.time()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    X, y, class_names = load_data()
    c_drop = class_names.index("Dropout")
    is_drop = (y.to_numpy() == c_drop).astype(int)
    codes = group_codes(X)
    feats_by_stage = stage_features(list(X.columns))
    assert [len(feats_by_stage[s]) for s in (0, 1, 2)] == [22, 30, 36]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE)

    metrics: dict[str, Any] = {"stages": {}, "notes": {
        "holdout": "Served model fit on the stratified 80% training split, evaluated on the 20% hold-out (885 students).",
        "oof": "5-fold StratifiedKFold(shuffle=True, random_state=42) out-of-fold predictions for all 4,424 students (as in the notebook).",
        "recall_top30": "Share of real dropouts among the 30% of students with the highest out-of-fold P(Dropout) ('dropouts caught').",
    }}
    group_out: dict[str, Any] = {"stages": [], "flag_rule": "top 30% out-of-fold P(Dropout) per stage (aware model)"}
    share_out: dict[str, Any] = {"categories": CAT_ORDER, "sensitive_features": SENSITIVE, "stages": []}
    oof_cache: dict[tuple[str, int], np.ndarray] = {}
    verification: list[tuple[str, str, float, float]] = []

    for st in STAGES:
        s = st["id"]
        metrics["stages"][str(s)] = {}
        for variant in ("aware", "blind"):
            feats = feats_by_stage[s] if variant == "aware" else [f for f in feats_by_stage[s] if f not in SENSITIVE]
            with_shap = variant == "aware"
            P, SV = oof_predict(X, y, feats, with_shap=with_shap)
            oof_cache[(variant, s)] = P
            p_drop = P[:, c_drop]
            fl = flag_top(p_drop)
            oof_metrics = {
                "accuracy": float((P.argmax(1) == y.to_numpy()).mean()),
                "macro_f1": float(f1_score(y, P.argmax(1), average="macro")),
                "dropout_auc": float(roc_auc_score(is_drop, p_drop)),
                "recall_top30": mval("TPR", is_drop, fl),
                "precision_top30": float(is_drop[fl == 1].mean()),
            }
            # Final served model on the 80% training split.
            model = make_xgb().fit(X_train[feats], y_train)
            pt = model.predict_proba(X_test[feats])
            holdout = {
                "accuracy": float(accuracy_score(y_test, pt.argmax(1))),
                "macro_f1": float(f1_score(y_test, pt.argmax(1), average="macro")),
                "dropout_auc": float(roc_auc_score((y_test.to_numpy() == c_drop).astype(int), pt[:, c_drop])),
            }
            flag_threshold = float(np.quantile(p_drop, 1 - CAP))
            metrics["stages"][str(s)][variant] = {"holdout": holdout, "oof": oof_metrics,
                                                  "flag_threshold": flag_threshold, "n_features": len(feats)}

            tree_explainer = shap.TreeExplainer(model)
            lime_explainer = LimeTabularExplainer(
                training_data=X_train[feats].to_numpy(), feature_names=feats, class_names=class_names,
                mode="classification", discretize_continuous=True, random_state=RANDOM_STATE)
            bundle = {
                "model": model, "features": feats, "classes": class_names,
                "shap_explainer": tree_explainer if picklable(tree_explainer) else None,
                "lime_explainer": lime_explainer if picklable(lime_explainer) else None,
                "X_train": X_train[feats].reset_index(drop=True),  # used to rebuild explainers if needed
                "oof_dropout": p_drop.astype(float),
                "flag_threshold": flag_threshold,
                "stage": s, "variant": variant,
            }
            joblib.dump(bundle, MODELS_DIR / f"stage{s}_{variant}.joblib", compress=3)
            print(f"[{time.time() - t0:6.1f}s] stage {s} {variant:5s}: {len(feats)} feats | "
                  f"OOF AUC {oof_metrics['dropout_auc']:.3f} recall@30 {oof_metrics['recall_top30']:.3f} | "
                  f"hold-out acc {holdout['accuracy']:.3f} AUC {holdout['dropout_auc']:.3f} | "
                  f"shap pickled={bundle['shap_explainer'] is not None} lime pickled={bundle['lime_explainer'] is not None}")
            ref_auc, ref_rec = REF_OOF[(variant, s)]
            verification.append((f"S{s} {variant} OOF AUC", "", ref_auc, oof_metrics["dropout_auc"]))
            verification.append((f"S{s} {variant} recall_top30", "", ref_rec, oof_metrics["recall_top30"]))

            if variant == "aware":
                assert SV is not None
                groups = stage_group_table(p_drop, fl, is_drop, codes)
                group_out["stages"].append({
                    "stage": s, "key": st["key"], "label": st["short"],
                    "overall": {"AUC": oof_metrics["dropout_auc"], "TPR": oof_metrics["recall_top30"],
                                "precision": oof_metrics["precision_top30"]},
                    "groups": groups,
                })
                for g in groups:
                    verification.append((f"S{s} TPR {g['group']}", "", REF_TPR[g["group"]][s], g["TPR"]))
                shares = shap_shares(SV, feats, c_drop)
                share_out["stages"].append({"stage": s, "key": st["key"], "label": st["short"], **shares})
                verification.append((f"S{s} all_sensitive SHAP share", "", REF_ALL_SENSITIVE[s],
                                     shares["all_sensitive"]))

    write_json(ARTIFACTS / "model_metrics.json", metrics)
    write_json(ARTIFACTS / "stage_group_metrics.json", group_out)
    write_json(ARTIFACTS / "stage_shap_shares.json", share_out)

    metadata = build_metadata(X, feats_by_stage, class_names)
    write_json(ARTIFACTS / "feature_metadata.json", metadata)

    typical = typical_rows(X, y, oof_cache[("aware", 2)], class_names)
    write_json(ARTIFACTS / "examples.json", {
        "rule": "Among students of the class whose stage-2 aware out-of-fold prediction is also that class, "
                "the row whose out-of-fold P(class) is the median of that subset (ties: lowest row index).",
        "typical": {name: {"row_index": i, "actual_target": class_names[int(y.iloc[i])],
                           "oof_probability": float(oof_cache[("aware", 2)][i, class_names.index(name)]),
                           "features": {c: X.iloc[i][c].item() for c in X.columns}}
                    for name, i in typical.items()},
    })

    # ----------------------------------------------------------------- verification table
    print("\nVerification against notebook reference values")
    print(f"{'quantity':38s} {'notebook':>9s} {'reproduced':>11s} {'diff':>8s}")
    worst = 0.0
    for name, _, ref, got in verification:
        diff = got - ref
        worst = max(worst, abs(diff))
        print(f"{name:38s} {ref:9.3f} {got:11.3f} {diff:+8.3f}")
    print(f"max |diff| = {worst:.4f}")
    n_unverified = len(metadata["label_todo"])
    print(f"\nfeature_metadata.json: {len(metadata['features'])} features, {n_unverified} unverified labels")
    print(f"typical example rows: {typical}")
    print(f"done in {time.time() - t0:.1f}s; artifacts in {ARTIFACTS}")


if __name__ == "__main__":
    main()
