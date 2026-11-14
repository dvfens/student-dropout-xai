/**
 * Pure helpers for the Predict form: which fields to show, default values,
 * client-side validation and building the request body. Everything is driven
 * by /api/metadata; no feature names are hard-coded here.
 */
import {
  FEATURE_SECTIONS,
  type CodedFeature,
  type Feature,
  type FeatureSection,
  type FeatureValues,
  type MetadataResponse,
  type NumericFeature,
  type StageId,
} from '../../api/types';

/** Raw form state: every field is kept as the string the user typed/selected. */
export type FormValues = Record<string, string>;
export type FieldErrors = Record<string, string>;

export interface FormSection {
  section: FeatureSection;
  features: Feature[];
}

export function isNumeric(feature: Feature): feature is NumericFeature {
  return feature.type === 'numeric';
}

export function isCoded(feature: Feature): feature is CodedFeature {
  return feature.type !== 'numeric';
}

/** Features available at `stage` (cumulative: stage k shows everything with stage <= k). */
export function featuresForStage(meta: MetadataResponse, stage: StageId): Feature[] {
  return meta.features.filter((f) => f.stage <= stage);
}

/** Features the model actually uses for this stage/variant. */
export function activeFeatures(meta: MetadataResponse, stage: StageId, blind: boolean): Feature[] {
  return featuresForStage(meta, stage).filter((f) => !(blind && f.sensitive));
}

/** Group the stage's fields into sections, in the fixed display order, skipping empty ones. */
export function sectionsForStage(meta: MetadataResponse, stage: StageId): FormSection[] {
  const visible = featuresForStage(meta, stage);
  return FEATURE_SECTIONS.map((section) => ({
    section,
    features: visible.filter((f) => f.section === section),
  })).filter((s) => s.features.length > 0);
}

/** Round to the feature's step so slider and number input agree, staying inside [min, max]. */
export function roundToStep(value: number, feature: NumericFeature): number {
  const rounded = feature.integer ? Math.round(value) : Number(value.toFixed(stepDecimals(feature.step)));
  return Math.min(feature.max, Math.max(feature.min, rounded));
}

export function stepDecimals(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** Fallback values (median / first option) used only if the example endpoint fails. */
export function fallbackValues(meta: MetadataResponse): FormValues {
  const values: FormValues = {};
  for (const f of meta.features) {
    values[f.name] = isNumeric(f) ? String(roundToStep(f.median, f)) : String(f.options[0]?.value ?? '');
  }
  return values;
}

/** Convert an example row from the API into form strings. */
export function valuesFromExample(meta: MetadataResponse, features: FeatureValues): FormValues {
  const values: FormValues = {};
  for (const f of meta.features) {
    const raw = features[f.name];
    if (raw === undefined) continue;
    // Real rows are sent exactly as recorded; step rounding is only for slider input
    // (rounding 18.875 to 0.01 would give 18.88, above the feature's max).
    values[f.name] = String(raw);
  }
  return values;
}

/** Client-side check of one field. Returns a friendly message, or null if the value is fine. */
export function validateField(feature: Feature, raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  if (text === '') return 'Please enter a value.';
  const value = Number(text);
  if (!Number.isFinite(value)) return 'Please enter a number.';
  if (isNumeric(feature)) {
    if (feature.integer && !Number.isInteger(value)) return 'Please enter a whole number.';
    if (value < feature.min || value > feature.max) {
      return `Must be between ${formatPlain(feature.min)} and ${formatPlain(feature.max)}.`;
    }
    return null;
  }
  if (!feature.options.some((o) => o.value === value)) return 'Please choose one of the options.';
  return null;
}

/** Validate every field the model needs at this stage. */
export function validateAll(features: Feature[], values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  for (const f of features) {
    const msg = validateField(f, values[f.name]);
    if (msg) errors[f.name] = msg;
  }
  return errors;
}

/** Numeric request payload for the given fields (call only when they are valid). */
export function toFeatureValues(features: Feature[], values: FormValues): FeatureValues {
  const out: FeatureValues = {};
  for (const f of features) out[f.name] = Number(values[f.name]);
  return out;
}

/** Up to 4 decimals, no trailing zeros: 18.875 -> "18.875", 20 -> "20". */
export function formatPlain(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** A slider is useful for bounded ranges; every numeric field in this dataset qualifies. */
export function wantsSlider(feature: NumericFeature): boolean {
  return feature.integer || feature.max - feature.min <= 200;
}
