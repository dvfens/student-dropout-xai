# Build contract (shared by backend + frontend)

Root: `C:\Users\Lenovo\Desktop\ml`. Layout: `/backend`, `/frontend`, `/artifacts`, `/figures`, result CSVs and `data.csv` at root, `README.md` at root.
Source of truth for modelling: `student_dropout_xai.ipynb` (a readable text dump with all outputs is in `notebook_dump.txt`).

Python: **3.13** (3.11 is not installed on this machine; all deps support 3.13). Venv: `backend/.venv` (already created, packages installed:
fastapi, uvicorn[standard], pandas, scikit-learn, xgboost, shap, lime, joblib, pydantic v2, scipy, matplotlib).
Run python as `backend/.venv/Scripts/python` (Windows, Git Bash). Node 22 / npm 10 available.

## Data cleaning (identical to notebook cell 3)
`pd.read_csv('data.csv', sep=';')`, strip column names (one has a stray tab; file also has a UTF-8 BOM which pandas strips — verify first column is exactly `Marital status`), rename `Nacionality` -> `Nationality`. `LabelEncoder` on Target -> classes `['Dropout','Enrolled','Graduate']` (0,1,2). 4,424 rows, 36 features.

## Stages
- stage 0 `enrollment` (label "At enrollment"): all features except those containing `1st sem` / `2nd sem`, and except `Debtor`, `Tuition fees up to date` -> 22 features
- stage 1 `after_sem1` ("After semester 1"): all except `2nd sem` -> 30
- stage 2 `after_sem2` ("After semester 2"): all 36
Feature order inside a stage = order of columns in data.csv.
Sensitive (removed for blind variants): `Age at enrollment`, `Gender`, `Nationality`, `International`.
XGB params: `XGBClassifier(n_estimators=150, max_depth=4, learning_rate=0.1, subsample=0.8, colsample_bytree=0.8, eval_metric="mlogloss", random_state=42)`.

## Artifacts (written by `backend/train.py`, run with `backend/.venv/Scripts/python backend/train.py` from repo root)
- `artifacts/models/stage{0,1,2}_{aware,blind}.joblib` — dict with `model`, `features`, `classes`, `shap_explainer` (TreeExplainer), `lime_explainer` (LimeTabularExplainer built on that model's *training* split X_train[features], discretize_continuous=True, random_state=42, class_names), `oof_dropout` (np.array of out-of-fold P(Dropout) for all 4424 students, 5-fold StratifiedKFold shuffle=True random_state=42 — same as notebook `oof_predict`), `flag_threshold` (70th percentile of oof_dropout).
  - Final served model: fit on the **80% training split** (train_test_split test_size=0.2, stratify=y, random_state=42) so hold-out metrics are honest. (State this in README.)
  - If pickling the explainers fails, the API rebuilds them at startup from saved training data; document whichever path is used.
- `artifacts/model_metrics.json`:
  `{ "stages": { "0": { "aware": {...}, "blind": {...} }, "1": ..., "2": ... } }` where each `{...}` =
  `{ "holdout": {"accuracy","macro_f1","dropout_auc"}, "oof": {"accuracy","macro_f1","dropout_auc","recall_top30","precision_top30"}, "flag_threshold": float, "n_features": int }`.
  `recall_top30` = "dropouts caught" (share of real dropouts in the top 30% out-of-fold risk). Notebook reference values (aware OOF): S0 AUC .772 recall .560; S1 .906/.742; S2 .926/.766. Blind: S0 .763/.552, S1 .906/.740, S2 .925/.764. Reproduce these (tiny drift from library versions is acceptable; report it).
- `artifacts/stage_group_metrics.json`: per stage (aware, top-30% OOF flags), per attribute (Gender, Age group, Nationality — groups exactly as notebook cell 37: Female/Male; `<=20`,`21-24`,`25-29`,`30+`; Portuguese (Nationality==1)/Non-Portuguese), per group: `n, TPR, FPR, flag_rate, AUC` plus 95% bootstrap CIs (`TPR_lo, TPR_hi, FPR_lo, FPR_hi, AUC_lo, AUC_hi`, B=300, RandomState(0) as in notebook cell 58). Shape:
  `{ "stages": [ {"stage":0,"label":"S0 enrollment","groups":[{"attribute":"Gender","group":"Female","n":2868,"TPR":..., ...}, ...]}, ... ] }`.
  Notebook reference TPRs: Female .428/.699/.738, Male .696/.787/.796, <=20 .240/.594/.642, 21-24 .504/.710/.746, 25-29 .882/.886/.866, 30+ .842/.881/.891, Portuguese .562/.742/.766, Non-Portuguese .500/.781/.781.
- `artifacts/stage_shap_shares.json`: per stage, share of total mean|SHAP| (Dropout class, OOF) by category (category() in notebook cell 65; order Personal, Family background, Application & prior education, Economy, Finance, Semester 1 results, Semester 2 results), plus per-sensitive-feature share and top-5 features. Reference: all_sensitive 29.7% / 11.2% / 8.9%.
- `artifacts/feature_metadata.json` — see below.
- `artifacts/examples.json` (optional cache) — typical Graduate / Dropout rows (choose the real row whose stage-2 aware OOF probability for that class is highest, or median-like; document choice).

## feature_metadata.json
```json
{
  "features": [
    {
      "name": "Marital status",            // exact column name
      "label": "Marital status",           // human-readable
      "help": "short help text",
      "type": "categorical" | "numeric" | "binary",
      "stage": 0,                           // stage at which it becomes available (0,1,2)
      "section": "Personal" | "Family" | "Application and prior education" | "Finance" | "Semester 1" | "Semester 2" | "Economy",
      "sensitive": false,
      // numeric:
      "min": 0, "max": 20, "median": 12.3, "step": 1 | 0.1, "integer": true,
      // categorical/binary:
      "options": [ {"value": 1, "label": "Single", "verified": true}, {"value": 7, "label": "Code 7", "verified": false} ]
    }
  ],
  "stages": [ {"id":0,"key":"enrollment","label":"At enrollment","features":[...22 names]}, ... ],
  "classes": ["Dropout","Enrolled","Graduate"],
  "sensitive_features": ["Age at enrollment","Gender","Nationality","International"],
  "label_todo": [ "Course: code 33 label unverified", ... ]
}
```
- Categorical options = the distinct values that actually occur in data.csv for that column (sorted). Labels from the official UCI documentation (https://archive.ics.uci.edu/dataset/697/predict+students+dropout+and+academic+success — fetch it; the variables table lists the codes). If a label cannot be confirmed: `"Code N"`, `verified:false`, and add to `label_todo`. NEVER invent labels.
- Binary (type `binary`): Gender (0 Female, 1 Male), Debtor, Tuition fees up to date, Scholarship holder, Displaced, International, Educational special needs (0 No / 1 Yes), Daytime/evening attendance (1 Daytime, 0 Evening).
- Sections: Personal = Marital status, Gender, Age at enrollment, Nationality, International, Displaced, Educational special needs; Family = Mother's/Father's qualification/occupation; Application and prior education = Application mode, Application order, Course, Daytime/evening attendance, Previous qualification, Previous qualification (grade), Admission grade; Finance = Debtor, Tuition fees up to date, Scholarship holder; Semester 1 / Semester 2 = curricular unit columns; Economy = Unemployment rate, Inflation rate, GDP.
- Stage: sem-1 columns, Debtor, Tuition fees up to date -> 1; sem-2 columns -> 2; everything else 0.

## API (`backend/main.py`, run from repo root: `backend/.venv/Scripts/python -m uvicorn backend.main:app --reload --port 8000`, or `cd backend && uvicorn main:app` — pick one, document it). CORS for http://localhost and http://127.0.0.1 on any port (regex), so the Vite dev server (5173) and `vite preview` (4173) both work. Invalid JSON body -> 422 `{"feature":"body","msg":"Request body is not valid JSON."}`.
All under `/api`:
- `GET /api/health` -> `{"status":"ok","models_loaded":true}`
- `GET /api/metadata` -> feature_metadata.json content (incl. `stages`) + `"metrics"`: model_metrics.json content.
- `POST /api/predict` body `{ "stage": 0|1|2, "blind": bool, "features": { name: value } }`.
  Required = stage feature list (minus sensitive when blind). Extra keys allowed and ignored (frontend may send all). Missing / out-of-range / not-allowed value -> HTTP 422 with `{"detail":[{"feature": name, "msg": "..."}]}` (clear human messages, list every problem).
  Response:
  ```json
  {
    "stage": 0, "blind": false,
    "probabilities": {"Dropout":0.1,"Enrolled":0.2,"Graduate":0.7},
    "predicted_class": "Graduate",
    "dropout_probability": 0.1,
    "dropout_percentile": 42.3,          // 0-100: % of historical students (OOF, this stage+variant) with LOWER P(Dropout)
    "flagged_at_risk": false,            // dropout_probability >= flag_threshold (= notebook flag_top; implies percentile >= 70)
    "flag_threshold": 0.31,              // the P(Dropout) cutoff
    "shap": { "base_value": -0.4, "output_space": "log-odds (margin) of the Dropout class",
              "contributions": [ {"feature":"...", "label":"...", "value": 3, "value_label":"Yes", "shap": 0.42, "direction":"increases"|"decreases"} ] },   // top 8 by |shap|, Dropout class
    "reliability": { "auc": 0.772, "dropouts_caught": 0.56, "level": "weak"|"moderate"|"strong", "message": "..." }   // from OOF metrics; S0 => weak warning
  }
  ```
- `POST /api/explain/lime` same body -> `{ "predicted_class": "...", "class_explained": "...", "weights": [ {"rule":"Curricular units 2nd sem (approved) <= 3.00","feature":"...","weight":0.12} ], "intercept": .., "local_prediction": .., "num_samples": 5000 }` top 10 for predicted class.
- `GET /api/example?cls=Dropout|Graduate|Enrolled|random` -> `{ "cls": "...", "row_index": 123, "actual_target": "Dropout", "features": {all 36 name: value} }`. `cls=Graduate|Dropout` + `typical=true` (default true) -> deterministic "typical" row; `cls=random` or `typical=false` -> random real row (of that class if given).
- `GET /api/results/tables` -> list of table names. `GET /api/results/tables/{name}` for name in `statistical_tests, fairness_gaps, shap_group_differences, stage_fairness_gaps, stage_gap_changes, stage_blind_comparison` -> `{ "name":..., "columns":[...], "rows":[{...}] }` (NaN -> null). Also serve `stage_group_metrics` and `stage_shap_shares` from artifacts via `GET /api/results/stage_group_metrics` and `GET /api/results/stage_shap_shares`. 404 for unknown.
- `GET /api/results/figures` -> `[ {"file":"09_shap_bar.png","url":"/static/figures/09_shap_bar.png","title":"Global feature importance (SHAP), by class","section":"explainability","kind":"image"|"lime_html"} ]` for every file in /figures.
  Sections: overview(01? no) -> use: `statistics` (01,02,03), `feature_selection` (04), `model_comparison` (05,06,07,08), `explainability` (09-15, lime_*.html), `fairness` (16-20), `staged` (21-25).
- Static: `/static/figures/*` from `/figures`.

## Frontend (`/frontend`, Vite + React + TS, Tailwind, Recharts, React Router, TanStack Query). Dev server port 5173. API base from `VITE_API_URL` default `http://localhost:8000`. Pages/routes:
`/` Overview, `/statistics`, `/feature-selection`, `/models`, `/explainability`, `/fairness`, `/staged`, `/predict`. Dark/light toggle (class strategy, persisted in localStorage with try/catch). Responsive nav (collapsible on mobile).
