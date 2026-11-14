# Student dropout XAI

A full-stack web app for the student-dropout explainable-AI project (`student_dropout_xai.ipynb`).
It shows the notebook's analysis results (statistics, feature selection, model comparison, SHAP/LIME,
fairness, the staged early-warning study) and lets you enter a student's details to get a live
prediction with SHAP and LIME explanations.

- **Data:** UCI "Predict Students' Dropout and Academic Success" (`data.csv`, 4,424 students, 36 features).
- **Backend** (`/backend`): FastAPI + XGBoost + SHAP + LIME. `backend/train.py` writes everything the API
  needs into `/artifacts`.
- **Frontend** (`/frontend`): React + Vite + TypeScript, Tailwind CSS, Recharts, React Router, TanStack Query.

All commands below are run from the repository root in Git Bash. In PowerShell or cmd, write
`backend\.venv\Scripts\python` instead of `backend/.venv/Scripts/python`.

## Backend

One-time setup (Python 3.13 was used; the spec asks for 3.11, see the note below):

```bash
python -m venv backend/.venv
backend/.venv/Scripts/python -m pip install -r backend/requirements.txt
```

Train the models and write `/artifacts` (well under two minutes). This is only needed again if the training code changes;
the artifacts are already in the folder:

```bash
backend/.venv/Scripts/python backend/train.py
```

**Run the API (one command):**

```bash
backend/.venv/Scripts/python -m uvicorn backend.main:app --reload --port 8000
```

- Health check: http://localhost:8000/api/health. Interactive API docs: http://localhost:8000/docs
- Run it from the repository root (the import path is `backend.main:app`).
- CORS accepts any port on `http://localhost` and `http://127.0.0.1`, so the dev server (5173) and
  `npm run preview` (4173) both work.

Tests:

```bash
backend/.venv/Scripts/python -m pytest backend/tests -q
```

## Frontend

One-time setup:

```bash
cd frontend && npm install
```

**Run the dev server (one command):**

```bash
cd frontend && npm run dev
```

Then open http://localhost:5173. The port is strict: if 5173 is already in use, Vite stops with an error
instead of quietly moving to another port. Free the port, or start Vite on another one with
`npx vite --port 5174`. The backend accepts any localhost port.

- API address: `VITE_API_URL`, e.g. `VITE_API_URL=http://localhost:9000 npm run dev`. Without it, `npm run dev`
  uses `http://localhost:8000` and a production build calls the API on its own origin.
- Production build: `npm run build` (output in `frontend/dist`). Preview it with `npm run preview` (http://localhost:4173),
  which forwards `/api` and `/static` to the backend on port 8000. Once `frontend/dist` exists, the backend also
  serves the built app itself at http://localhost:8000, the same way the Vercel deployment does.
- Type check: `npm run typecheck`.

## Deploy on Vercel

One Vercel project serves both parts from one URL: the FastAPI app runs as a Python function and also serves the
built React app, so the frontend calls the API on its own origin (no CORS setup, no API URL to configure).

- `pyproject.toml` (repository root) lists the runtime packages Vercel installs (Python 3.13) and points Vercel at
  `backend.main:app`. On Linux it installs `xgboost-cpu`, the same `xgboost` package without the GPU libraries,
  which keeps the function at roughly 400 MB, under Vercel's 500 MB limit. Keep its versions in step with
  `backend/requirements.txt`.
- `vercel.json` builds the frontend (`npm ci && npm run build` in `frontend/`) and leaves tests, docs, the notebook
  and `node_modules` out of the function.

To deploy, import the GitHub repository at https://vercel.com/new with the **Root Directory left at the repository
root** (`./`); Vercel detects FastAPI. No environment variables are needed. Every push to `main` then redeploys.
Don't deploy `backend/` or `frontend/` as separate projects: the backend reads `artifacts/`, `figures/` and the CSV
files from the repository root, and a frontend deployed alone has no API.

## Modelling notes

- **Stages.** Stage 0 "At enrollment" (22 features: no semester results, no Debtor / Tuition fees), stage 1
  "After semester 1" (30), stage 2 "After semester 2" (36). Each stage also has a "blind" model without Age at
  enrollment, Gender, Nationality and International. All six are
  `XGBClassifier(n_estimators=150, max_depth=4, learning_rate=0.1, subsample=0.8, colsample_bytree=0.8, random_state=42)`.
- **Served models** are fit on the stratified 80% training split
  (`train_test_split(test_size=0.2, stratify=y, random_state=42)`). `artifacts/model_metrics.json` holds their
  hold-out accuracy, macro-F1 and Dropout AUC on the remaining 20% (885 students), plus out-of-fold metrics.
- **Percentile and at-risk flag.** These use the 5-fold out-of-fold P(Dropout) of all 4,424 students for that
  stage and variant (StratifiedKFold, shuffle, random_state=42, as in the notebook).
  `dropout_percentile` is the share of past students with a lower P(Dropout). A student is **flagged at risk**
  when P(Dropout) >= `flag_threshold`, the 70th percentile of those scores. This is the notebook's top-30% rule,
  and every flagged student has percentile >= 70.
- **Reliability.** `/api/predict` returns the stage's out-of-fold AUC and the share of dropouts caught when the
  riskiest 30% are flagged. At enrollment (AUC about 0.77) the app shows a "weak" warning.
- **Explainers.** The SHAP `TreeExplainer` is pickled inside each `artifacts/models/*.joblib` bundle. The LIME
  `LimeTabularExplainer` cannot be pickled, so each bundle stores its training split and the API rebuilds the
  explainer at startup with the same settings (`discretize_continuous=True, random_state=42`). Each LIME request
  uses a private copy, so the same input always gives the same explanation.
- **Example students** (`/api/example?cls=...`). The "typical" Graduate or Dropout is chosen from the students of
  that class whose stage-2 out-of-fold prediction is also that class: it is the one whose out-of-fold P(class) is
  the median of that group. `cls=random` (or `typical=false`) returns a random real row.
- **Python and library versions.** The project ran on Python 3.13 with newer pandas, scikit-learn, xgboost and shap
  than the notebook. CV folds are identical, but XGBoost's subsampling differs between versions, so numbers drift a
  little from the notebook:
  - overall AUC and recall: within 0.009;
  - group recalls: within 0.031 (one student in the small Non-Portuguese group);
  - sensitive SHAP share at enrollment: 28.9% vs the notebook's 29.7%; after semester 1, 11.3% (11.2%); after
    semester 2, 8.8% (8.9%);
  - at enrollment, Course (10.2%) now ranks above Gender (9.0%); the notebook had Gender (10%) above Course (9%).

  The app reads these numbers from the artifacts. See `docs/DEVIATIONS.md` for every deviation.

## Code labels (TODO list)

Coded columns (marital status, application mode, course, previous qualification, nationality, parents'
qualification and occupation, and so on) are labelled from the official UCI variables table
(https://archive.ics.uci.edu/dataset/697/predict+students+dropout+and+academic+success), saved verbatim in
`backend/data/uci_variables.json`. **Every code that occurs in `data.csv` was checked against that table, so
the TODO list of unverified labels is empty.** No "Code N" placeholders are shown.
`artifacts/feature_metadata.json` has a `label_todo` field, and `train.py` reports the count, so any future
unverified code will show up there and must be added to this section.

The economic features (GDP, unemployment rate, inflation rate) are described in the UCI table only as "GDP",
"Unemployment rate (%)" and "Inflation rate (%)". The help texts keep to those descriptions.

## Layout

```
backend/     FastAPI app (main.py), training script (train.py), tests, UCI label source
frontend/    React app
artifacts/   models (*.joblib), feature_metadata.json, model_metrics.json, examples, stage results
figures/     notebook PNGs and LIME HTML, served at /static/figures
docs/        SPEC.md (original request), CONTRACT.md (API contract), DEVIATIONS.md, RUN.md
*.csv        notebook result tables, served at /api/results/tables/{name}
pyproject.toml, vercel.json   Vercel deployment (see "Deploy on Vercel")
```
