# Original user request (verbatim)

# TASK
Build a full-stack web app (FastAPI backend + React frontend) for my student-dropout XAI project. It must (1) display all analysis results from my notebook, and (2) let a user enter student values and get a live prediction with an explanation.

# PROJECT FILES (already in this folder)
- student_dropout_xai.ipynb  -> source of truth for the modelling logic (read it first)
- data.csv  -> UCI "Predict Students' Dropout and Academic Success" (semicolon-separated, 4,424 rows, 36 features + Target)
- figures/  -> PNG plots 01..25 and LIME HTML files produced by the notebook
- statistical_tests.csv, fairness_gaps.csv, shap_group_differences.csv, stage_fairness_gaps.csv, stage_gap_changes.csv, stage_blind_comparison.csv

Data cleaning to replicate: read with sep=';', strip column names (one has a stray tab), rename "Nacionality" -> "Nationality". Target classes: Dropout, Enrolled, Graduate (use sklearn LabelEncoder, so Dropout=0, Enrolled=1, Graduate=2).

# TECH STACK
- Backend: Python 3.11, FastAPI, uvicorn, pandas, scikit-learn, xgboost, shap, lime, joblib, pydantic v2
- Frontend: React + Vite + TypeScript, Tailwind CSS, Recharts, React Router, TanStack Query
- Layout: /backend, /frontend, /artifacts (saved models and JSON), README.md at the root
- Enable CORS for the Vite dev server. One command to run each side (document them in README).

# STEP 1: TRAINING SCRIPT (backend/train.py)
Write a script that trains and saves everything the API needs into /artifacts:

1. Three XGBoost models, one per stage, using these exact feature sets:
   - Stage 0 "enrollment": all features EXCEPT any column containing "1st sem" or "2nd sem", and EXCEPT "Debtor" and "Tuition fees up to date" (22 features)
   - Stage 1 "after semester 1": all features EXCEPT columns containing "2nd sem" (30 features)
   - Stage 2 "after semester 2": all 36 features
   Hyperparameters: XGBClassifier(n_estimators=150, max_depth=4, learning_rate=0.1, subsample=0.8, colsample_bytree=0.8, eval_metric="mlogloss", random_state=42).
2. Three "blind" variants of each stage model with these columns removed: "Age at enrollment", "Gender", "Nationality", "International".
3. Save the out-of-fold P(Dropout) distribution for each stage (5-fold StratifiedKFold, random_state=42). It is used to turn a single probability into a percentile and into a "flagged at risk" decision. The notebook flags the top 30% highest-risk students at each stage, so the flag threshold for a stage is the 70th percentile of its out-of-fold P(Dropout).
4. Save for each stage: feature order, the LabelEncoder classes, training-data statistics for LIME (a TabularExplainer built from the training set), and a SHAP TreeExplainer.
5. Write artifacts/feature_metadata.json: for every feature give name, type (numeric or categorical), min/max/median for numeric, the list of allowed values for categorical, a human-readable label, a short help text, and the stage at which it becomes available (0, 1, or 2).
   - Many categorical columns are numeric CODES (Marital status, Application mode, Course, Previous qualification, Nationality, Mother's/Father's qualification and occupation, etc.). Use the official UCI dataset documentation for the code-to-label mapping where you know it. If you are not certain of a label, show "Code N" and mark it in a TODO list in the README. NEVER invent labels.
   - Binary columns (Gender, Debtor, Tuition fees up to date, Scholarship holder, Displaced, International, Educational special needs, Daytime/evening attendance) should become toggles or radios with clear labels. Gender: 0 = Female, 1 = Male.
6. Save a hold-out evaluation (accuracy, macro-F1, Dropout AUC) per stage to artifacts/model_metrics.json, using the same stratified 80/20 split, random_state=42.

# STEP 2: API (backend/main.py)
Endpoints (all JSON):
- GET /api/metadata -> feature_metadata.json plus the stage definitions
- POST /api/predict body: { stage: 0|1|2, blind: bool, features: {name: value} }
  Validate that all required features for that stage are present and within range or allowed values (return clear 422 messages). Return:
  - probabilities for Dropout / Enrolled / Graduate
  - predicted class
  - dropout_percentile (share of historical students with lower out-of-fold P(Dropout) at this stage)
  - flagged_at_risk (true if the percentile >= 70)
  - top 8 SHAP contributions toward the Dropout class (feature, value entered, shap value, direction) and the base value
  - the stage's reliability: AUC and "dropouts caught" from model_metrics.json, so the UI can warn that stage 0 predictions are weak
- POST /api/explain/lime -> same input, returns LIME top-10 weights for the predicted class (compute on demand, can take a few seconds)
- GET /api/results/tables/{name} -> serves the result CSVs as JSON
- GET /api/results/figures -> list of figure files with titles and the section they belong to
- Static serving of /figures at /static/figures
- GET /api/health

# STEP 3: FRONTEND PAGES
Navigation with these pages. Use a clean, readable design, responsive, with a dark/light toggle.

1. *Overview*: what the dataset is, class balance chart (Graduate 50%, Dropout 32%, Enrolled 18%), project pipeline diagram, and a short plain-language glossary of: Friedman test, SHAP, LIME, feature selection, equal opportunity, TPR/FPR. Keep the wording simple.
2. *Statistics*: table from statistical_tests.csv (sortable, searchable) plus an effect-size bar chart (Recharts). Explain "effect size" and "p-value" in one sentence each.
3. *Feature selection*: show figure 04 (votes heatmap) and the 15 consensus features.
4. *Model comparison*: Friedman results (chi-square = 31.1, p < 0.001), mean ranks, Nemenyi heatmap and critical-difference diagram (figures 05, 06), plus the feature-set Friedman result (figure 07). Show a 2-line explanation of how to read them.
5. *Explainability*: SHAP images (09 bar, 10/11 beeswarm, 12 dependence, 13 waterfalls), LIME images (14) with a link to open each interactive LIME HTML in a modal or iframe, and the SHAP-vs-LIME agreement plot (15). Include a SHAP vs LIME comparison table in plain words.
6. *Fairness*: group error rates (figure 16), significance table from fairness_gaps.csv, SHAP-by-group heatmap (17), age-reliance plot (19), mitigation (20). Add a clearly visible "How to read this / limitations" box (small groups, correlation is not causation, ethical risks of group-specific thresholds).
7. *Staged early warning*: interactive Recharts line chart of recall by group at the three stages (data from stage_fairness_gaps.csv and stage_gap_changes.csv; derive any per-group numbers you need from the notebook outputs or recompute them in train.py and save as JSON), the gap-change table, the SHAP share-by-category chart (24), and the blind-vs-aware comparison (25) from stage_blind_comparison.csv. Add a stage selector tab.
8. *Predict* (the main interactive page), see below.

# STEP 4: PREDICT PAGE (most important)
- A stepper or tabs for the three stages: "At enrollment", "After semester 1", "After semester 2". Fields appear cumulatively: stage 1 shows stage 0 fields plus the new ones, and so on.
- The form is generated from /api/metadata (no hard-coded fields): numeric inputs with min/max validation and a slider where sensible, dropdowns for coded categories, toggles for binary fields. Group fields into sections (Personal, Family, Application and prior education, Finance, Semester 1, Semester 2, Economy).
- Provide "Fill with example student" buttons: a typical Graduate, a typical Dropout, and a random real row from data.csv (add a GET /api/example?cls=Dropout endpoint).
- A "Hide sensitive attributes (Age, Gender, Nationality, International)" switch that calls the blind model.
- Result panel: three probability bars (Dropout / Enrolled / Graduate), predicted class, the percentile ("riskier than X% of past students at this stage") with a gauge, and an "at risk / not flagged" badge.
- A waterfall-style horizontal bar chart of the top SHAP contributions (red pushes toward dropout, blue pushes away), with plain-language sentences such as "Fewer subjects approved in semester 2 raises the dropout risk."
- A button "Explain with LIME" that loads the LIME weights and shows them next to SHAP so the user can compare

(The request ends here; there is no further STEP in the original.)
