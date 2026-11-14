# How to run (backend)

All commands are run from the repository root (`C:\Users\Lenovo\Desktop\ml`) in Git Bash.
On PowerShell/cmd use `backend\.venv\Scripts\python` instead of `backend/.venv/Scripts/python`.

## 1. One-time setup

```bash
python -m venv backend/.venv                      # Python 3.13
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
```

## 2. Train (writes everything into /artifacts, about 70 s)

```bash
backend/.venv/Scripts/python backend/train.py
```

Prints a verification table comparing the reproduced out-of-fold AUC / recall@30%,
group recalls and sensitive SHAP shares with the notebook values.

## 3. Run the API (port 8000)

```bash
backend/.venv/Scripts/python -m uvicorn backend.main:app --reload --port 8000
```

- Health check: http://localhost:8000/api/health
- Interactive docs: http://localhost:8000/docs
- CORS allows any port on http://localhost and http://127.0.0.1 (Vite dev server 5173, `vite preview` 4173).
- Paths are resolved from `backend/main.py`, so the API finds `artifacts/`, `figures/`, `data.csv`
  and the result CSVs regardless of the working directory (but the `backend.main:app` import path
  needs the repo root as the working directory).

## 4. Tests

```bash
backend/.venv/Scripts/python -m pytest backend/tests -q
```

## Notes for the README

- **Served models** are XGBoost models fit on the stratified 80% training split
  (`train_test_split(test_size=0.2, stratify=y, random_state=42)`); `artifacts/model_metrics.json`
  holds their hold-out accuracy / macro-F1 / Dropout AUC on the remaining 20% (885 students).
- **Percentile and at-risk flag** use the 5-fold out-of-fold P(Dropout) of all 4,424 students for that
  stage and variant (same procedure as the notebook). Flagged = P(Dropout) >= flag_threshold, the 70th percentile of those scores (the notebook's
  "top 30%" rule). The "reliability" block in /api/predict uses the out-of-fold AUC and recall@30%.
- **Explainers:** the SHAP `TreeExplainer` is pickled inside each `artifacts/models/*.joblib` bundle.
  The LIME `LimeTabularExplainer` cannot be pickled (it holds a local function), so each bundle stores its
  training split (`X_train`) and the API rebuilds the LIME explainer at startup with the same settings
  (`discretize_continuous=True, random_state=42`). Each LIME request uses a private copy of the explainer,
  so the same input always gives the same explanation.
- **Typical examples** (`/api/example?cls=...`, stored in `artifacts/examples.json`): among students of the
  class whose stage-2 out-of-fold prediction is also that class, the row whose out-of-fold P(class) is the
  median of that group. `cls=random` or `typical=false` returns a random real row (optional `seed`).
- **Code labels** in `artifacts/feature_metadata.json` come from the official UCI variables table
  (https://archive.ics.uci.edu/dataset/697/predict+students+dropout+and+academic+success, saved verbatim in
  `backend/data/uci_variables.json`). Every code that occurs in data.csv is documented there, so
  `label_todo` is currently empty (no "Code N" placeholders).
