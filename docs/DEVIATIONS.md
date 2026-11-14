# Deviations from CONTRACT.md

## Frontend shell (frontend agent)

- **`stage_shap_shares` response shape (contract clarification, not a change).** CONTRACT.md only describes this file loosely. The frontend types (`frontend/src/api/types.ts`, `StageShapSharesResponse`) expect:
  ```json
  {
    "categories": ["Personal", "Family background", "Application & prior education", "Economy", "Finance", "Semester 1 results", "Semester 2 results"],
    "sensitive_features": ["Age at enrollment", "Gender", "Nationality", "International"],
    "stages": [
      { "stage": 0, "label": "S0 enrollment",
        "category_shares": { "Personal": 0.35, "...": 0.0 },
        "sensitive_shares": { "Age at enrollment": 0.199, "Gender": 0.096, "Nationality": 0.002, "International": 0.001 },
        "all_sensitive": 0.297,
        "top_features": [ { "feature": "Age at enrollment", "share": 0.20 } ] }
    ]
  }
  ```
  All shares are 0-1 fractions. If the backend writes a different shape, update `StageShapSharesResponse` to match it (the backend output wins).
- **`GroupMetric.AUC` / `AUC_lo` / `AUC_hi` typed as `number | null`** in case a group has only one class in a bootstrap sample.
- **Tooling versions:** the frontend uses TypeScript 7.0 (native compiler), Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`), React 19, React Router 7, TanStack Query 5, Recharts 3. All pinned exactly in `frontend/package.json`.

## Backend (backend agent)

- **LIME explainer not pickled.** `LimeTabularExplainer` cannot be pickled (local kernel function), so
  `lime_explainer` is `None` in the joblib bundles; each bundle stores `X_train` and the API rebuilds the
  explainer at startup with identical settings (allowed by the contract). The SHAP TreeExplainer is pickled.
- **`stage_shap_shares.json` uses the frontend's shape** (see the frontend section above): top-level
  `categories`, `sensitive_features`, `stages[]` with `category_shares`, `sensitive_shares`, `all_sensitive`,
  `top_features`; plus an extra `feature_shares` (all features ranked) and `key`.
- **`GET /api/results/tables` returns a plain JSON array** of the six table names.
- **`value_label` is always a string**: the option label for coded/binary features, the formatted number
  for numeric ones (the frontend type requires a string).
- **Extra response fields (additive only):** predict/LIME echo `stage` and `blind`; LIME weights add `label`,
  `value`, `value_label` and the response adds `score` (LIME's local R^2); example adds `typical`; stage group
  metrics add `true_dropout_rate` per group and an `overall` block per stage; metadata adds
  `label_source_retrieved` and per-stage `blind_features`; `model_metrics.json` adds `notes`.
- **Numeric strings are accepted** in `features` (e.g. "12") and converted; booleans are accepted only for
  binary features. Integer columns must be whole numbers.
- **Python 3.13 and newer library versions** (pandas 3.1, scikit-learn 1.9, xgboost 3.4, shap 0.54) than the
  notebook used. CV folds are identical, but XGBoost's row/column subsampling differs between versions,
  so OOF numbers drift slightly: overall AUC/recall within 0.009 of the notebook; group TPRs within 0.031
  (largest in small groups: Non-Portuguese has only ~32 dropouts, so one student = 0.031).
- **SHAP-share drift (same cause).** The stage SHAP shares served from `artifacts/stage_shap_shares.json`
  differ slightly from notebook cell 65: `all_sensitive` S0 0.289 (notebook 0.297, -0.008), S1 0.113 (0.112),
  S2 0.088 (0.089). At S0 the top-5 order also changes: served = Age 19.6%, Scholarship 12.3%, **Course 10.2%,
  Gender 9.0%**, Application mode 7.5%; the notebook had Gender (10%) above Course (9%). The frontend reads these
  numbers from the artifact (the Staged takeaway quotes the served values and names the notebook values as such),
  so do not copy the notebook's "Gender is #3 at enrollment" narrative.

## Fixer pass

- **`flagged_at_risk = dropout_probability >= flag_threshold`** instead of the SPEC's literal
  "percentile >= 70". `flag_threshold` is `np.quantile(oof, 0.7)`, which interpolates between two OOF values, so
  with the percentile rule a student in a ~1e-5-wide band just below the cutoff was flagged although
  `dropout_probability < flag_threshold`. The threshold rule is the notebook's `flag_top` and keeps the two fields
  consistent; any flagged student still has percentile >= 70. `dropout_percentile` is for display only.
- **CORS uses `allow_origin_regex` for any port on localhost / 127.0.0.1** (CONTRACT said exactly :5173), so
  `vite preview` (4173) works. The dev server also uses `strictPort`, so a busy 5173 fails loudly.
- **Invalid JSON body** returns 422 `[{"feature": "body", "msg": "Request body is not valid JSON."}]`.
  Huge JSON integers (e.g. `10**400`) give the normal "must be a number" 422 rather than a 500.
- **Macroeconomic help texts softened** to match the UCI descriptions ("GDP", "Unemployment rate (%)",
  "Inflation rate (%)"). The GDP label is now "GDP indicator" instead of "GDP growth (%)", because the
  official table does not say growth.
