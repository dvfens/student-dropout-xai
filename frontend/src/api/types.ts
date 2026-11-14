/**
 * TypeScript mirrors of every API response described in docs/CONTRACT.md.
 * Keep these in sync with backend/main.py.
 */

// ---------------------------------------------------------------- basics

export type ClassName = 'Dropout' | 'Enrolled' | 'Graduate';
export const CLASS_NAMES: readonly ClassName[] = ['Dropout', 'Enrolled', 'Graduate'];

export type StageId = 0 | 1 | 2;
export const STAGE_IDS: readonly StageId[] = [0, 1, 2];
export type StageKey = 'enrollment' | 'after_sem1' | 'after_sem2';

/** Feature values are always numeric codes or numbers on the wire. */
export type FeatureValue = number;
export type FeatureValues = Record<string, FeatureValue>;

// ---------------------------------------------------------------- metadata

export type FeatureType = 'categorical' | 'numeric' | 'binary';

export type FeatureSection =
  | 'Personal'
  | 'Family'
  | 'Application and prior education'
  | 'Finance'
  | 'Semester 1'
  | 'Semester 2'
  | 'Economy';

export const FEATURE_SECTIONS: readonly FeatureSection[] = [
  'Personal',
  'Family',
  'Application and prior education',
  'Finance',
  'Semester 1',
  'Semester 2',
  'Economy',
];

export interface FeatureOption {
  value: number;
  label: string;
  /** false when the label could not be confirmed from the UCI docs ("Code N"). */
  verified: boolean;
}

interface FeatureBase {
  /** Exact column name in data.csv; the key used in predict requests. */
  name: string;
  label: string;
  help: string;
  /** Stage at which the feature becomes available. */
  stage: StageId;
  section: FeatureSection;
  sensitive: boolean;
}

export interface NumericFeature extends FeatureBase {
  type: 'numeric';
  min: number;
  max: number;
  median: number;
  step: number;
  integer: boolean;
}

export interface CodedFeature extends FeatureBase {
  type: 'categorical' | 'binary';
  options: FeatureOption[];
}

export type Feature = NumericFeature | CodedFeature;

export interface StageDefinition {
  id: StageId;
  key: StageKey;
  label: string;
  /** Feature names in model order. */
  features: string[];
}

export interface FeatureMetadata {
  features: Feature[];
  stages: StageDefinition[];
  classes: ClassName[];
  sensitive_features: string[];
  label_todo: string[];
}

// ---------------------------------------------------------------- metrics

export interface HoldoutMetrics {
  accuracy: number;
  macro_f1: number;
  dropout_auc: number;
}

export interface OofMetrics extends HoldoutMetrics {
  /** "Dropouts caught": share of real dropouts within the top-30% OOF risk. */
  recall_top30: number;
  precision_top30: number;
}

export interface VariantMetrics {
  holdout: HoldoutMetrics;
  oof: OofMetrics;
  flag_threshold: number;
  n_features: number;
}

export type Variant = 'aware' | 'blind';

export interface StageMetrics {
  aware: VariantMetrics;
  blind: VariantMetrics;
}

export interface ModelMetrics {
  stages: Record<'0' | '1' | '2', StageMetrics>;
}

/** GET /api/metadata */
export interface MetadataResponse extends FeatureMetadata {
  metrics: ModelMetrics;
}

// ---------------------------------------------------------------- predict

/** Body of POST /api/predict and POST /api/explain/lime. */
export interface PredictRequest {
  stage: StageId;
  blind: boolean;
  /** Extra keys are allowed and ignored by the backend. */
  features: FeatureValues;
}

export type ShapDirection = 'increases' | 'decreases';

export interface ShapContribution {
  feature: string;
  label: string;
  value: FeatureValue;
  value_label: string;
  /** Contribution to the Dropout-class log-odds. */
  shap: number;
  direction: ShapDirection;
}

export interface ShapExplanation {
  base_value: number;
  output_space: string;
  /** Top 8 by |shap|, Dropout class. */
  contributions: ShapContribution[];
}

export type ReliabilityLevel = 'weak' | 'moderate' | 'strong';

export interface Reliability {
  auc: number;
  dropouts_caught: number;
  level: ReliabilityLevel;
  message: string;
}

/** POST /api/predict */
export interface PredictResponse {
  stage: StageId;
  blind: boolean;
  probabilities: Record<ClassName, number>;
  predicted_class: ClassName;
  dropout_probability: number;
  /** 0-100: % of historical students (OOF) with a lower P(Dropout). */
  dropout_percentile: number;
  /** dropout_probability >= flag_threshold (the notebook's top-30% rule). */
  flagged_at_risk: boolean;
  /** P(Dropout) cutoff for the top-30% flag. */
  flag_threshold: number;
  shap: ShapExplanation;
  reliability: Reliability;
}

/** One entry of the 422 `detail` array. */
export interface ValidationIssue {
  feature: string;
  msg: string;
}

export interface ValidationErrorBody {
  detail: ValidationIssue[];
}

// ---------------------------------------------------------------- LIME

export interface LimeWeight {
  rule: string;
  feature: string;
  weight: number;
}

/** POST /api/explain/lime */
export interface LimeResponse {
  predicted_class: ClassName;
  class_explained: ClassName;
  /** Top 10 for the predicted class. */
  weights: LimeWeight[];
  intercept: number;
  local_prediction: number;
  num_samples: number;
}

// ---------------------------------------------------------------- example

export type ExampleClass = ClassName | 'random';

export interface ExampleParams {
  cls: ExampleClass;
  /** Default true on the backend: deterministic "typical" row. */
  typical?: boolean;
}

/** GET /api/example */
export interface ExampleResponse {
  cls: ExampleClass;
  row_index: number;
  actual_target: ClassName;
  /** All 36 features. */
  features: FeatureValues;
}

// ---------------------------------------------------------------- tables

export const TABLE_NAMES = [
  'statistical_tests',
  'fairness_gaps',
  'shap_group_differences',
  'stage_fairness_gaps',
  'stage_gap_changes',
  'stage_blind_comparison',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export type CellValue = string | number | boolean | null;
export type TableRow = Record<string, CellValue>;

/** GET /api/results/tables/{name} (NaN arrives as null). */
export interface TableResponse<Row extends TableRow = TableRow> {
  name: TableName;
  columns: string[];
  rows: Row[];
}

/** GET /api/results/tables */
export type TableListResponse = TableName[];

// ---------------------------------------------------------------- figures

export type FigureSection =
  | 'statistics'
  | 'feature_selection'
  | 'model_comparison'
  | 'explainability'
  | 'fairness'
  | 'staged';

export type FigureKind = 'image' | 'lime_html';

export interface FigureInfo {
  file: string;
  /** Path relative to the API base, e.g. "/static/figures/09_shap_bar.png". */
  url: string;
  title: string;
  section: FigureSection;
  kind: FigureKind;
}

/** GET /api/results/figures */
export type FigureListResponse = FigureInfo[];

// ---------------------------------------------------------------- staged results

export type GroupAttribute = 'Gender' | 'Age group' | 'Nationality';

export interface GroupMetric {
  attribute: GroupAttribute;
  /** e.g. "Female", "<=20", "Portuguese". */
  group: string;
  n: number;
  TPR: number;
  FPR: number;
  flag_rate: number;
  /** null if undefined for the group (e.g. only one class present). */
  AUC: number | null;
  TPR_lo: number;
  TPR_hi: number;
  FPR_lo: number;
  FPR_hi: number;
  AUC_lo: number | null;
  AUC_hi: number | null;
}

export interface StageGroupMetricsEntry {
  stage: StageId;
  /** e.g. "S0 enrollment". */
  label: string;
  groups: GroupMetric[];
}

/** GET /api/results/stage_group_metrics */
export interface StageGroupMetricsResponse {
  stages: StageGroupMetricsEntry[];
}

export type ShapCategory =
  | 'Personal'
  | 'Family background'
  | 'Application & prior education'
  | 'Economy'
  | 'Finance'
  | 'Semester 1 results'
  | 'Semester 2 results';

export interface TopShapFeature {
  feature: string;
  /** Share of total mean |SHAP| (0-1). */
  share: number;
}

export interface StageShapSharesEntry {
  stage: StageId;
  label: string;
  /** Category -> share of total mean |SHAP| (0-1), Dropout class, OOF. */
  category_shares: Record<ShapCategory, number>;
  /** Sensitive feature -> share (0-1). */
  sensitive_shares: Record<string, number>;
  /** Sum of the sensitive shares (served artifact about 0.289 / 0.113 / 0.088; notebook 0.297 / 0.112 / 0.089). */
  all_sensitive: number;
  top_features: TopShapFeature[];
}

/**
 * GET /api/results/stage_shap_shares
 * The contract only describes this loosely; this is the shape the frontend expects
 * (see docs/DEVIATIONS.md). Verify against the real backend output.
 */
export interface StageShapSharesResponse {
  categories: ShapCategory[];
  sensitive_features: string[];
  stages: StageShapSharesEntry[];
}

// ---------------------------------------------------------------- health

export interface HealthResponse {
  status: 'ok';
  models_loaded: boolean;
}
