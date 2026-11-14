import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isValidationError } from '../../api/client';
import { fetchExample, useLime, usePredict } from '../../api/hooks';
import type { Feature, MetadataResponse, PredictRequest, StageId } from '../../api/types';
import { Badge, Card, ErrorState, Loading, Tabs } from '../../components';
import { formatPercent } from '../../lib/format';
import { ExampleBar, Switch, type LoadedExample } from './Controls';
import { LimeComparison, ShapCard } from './Explanations';
import { FormSections } from './FormSections';
import {
  activeFeatures,
  fallbackValues,
  featuresForStage,
  sectionsForStage,
  toFeatureValues,
  validateAll,
  valuesFromExample,
  type FieldErrors,
  type FormValues,
} from './formModel';
import { ResultSummary } from './ResultSummary';

type StageTabId = '0' | '1' | '2';

const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400';

const AUTO_PREDICT_DELAY_MS = 450;

function Spinner() {
  return (
    <span
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  );
}

export interface PredictWorkspaceProps {
  meta: MetadataResponse;
}

/** The interactive part of the Predict page: form on the left, results on the right. */
export function PredictWorkspace({ meta }: PredictWorkspaceProps) {
  const [stage, setStage] = useState<StageId>(0);
  const [blind, setBlind] = useState(false);
  const [autoPredict, setAutoPredict] = useState(true);
  const [values, setValues] = useState<FormValues>({});
  const [loaded, setLoaded] = useState<LoadedExample | null>(null);
  const [busyExample, setBusyExample] = useState<LoadedExample['kind'] | null>(null);
  const [exampleError, setExampleError] = useState<unknown>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [sentKey, setSentKey] = useState<string | null>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);

  const predict = usePredict();
  const lime = useLime();
  const { mutate: mutatePredict } = predict;
  const { mutate: mutateLime, reset: resetLime } = lime;

  const featuresByName = useMemo(() => new Map<string, Feature>(meta.features.map((f) => [f.name, f])), [meta]);
  const labelFor = (name: string) => featuresByName.get(name)?.label ?? name;
  const stageDef = meta.stages.find((s) => s.id === stage);
  const stageLabel = stageDef?.label ?? `Stage ${stage}`;
  const sections = useMemo(() => sectionsForStage(meta, stage), [meta, stage]);
  const active = useMemo(() => activeFeatures(meta, stage, blind), [meta, stage, blind]);
  const ready = Object.keys(values).length > 0;

  const clientErrors = useMemo(() => (ready ? validateAll(active, values) : {}), [active, values, ready]);
  const errors = useMemo(() => ({ ...serverErrors, ...clientErrors }), [serverErrors, clientErrors]);
  const errorCount = Object.keys(clientErrors).length;

  const request = useMemo<PredictRequest | null>(
    () => (ready && errorCount === 0 ? { stage, blind, features: toFeatureValues(active, values) } : null),
    [ready, errorCount, stage, blind, active, values],
  );
  const requestKey = request ? JSON.stringify(request) : null;
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  // ------------------------------------------------------------ examples

  const loadExample = useCallback(
    async (kind: LoadedExample['kind']) => {
      setBusyExample(kind);
      setExampleError(null);
      try {
        const example = await fetchExample({ cls: kind });
        setValues({ ...fallbackValues(meta), ...valuesFromExample(meta, example.features) });
        setLoaded({ kind, rowIndex: example.row_index, actual: example.actual_target, edited: false });
        setServerErrors({});
      } catch (err) {
        setExampleError(err);
        setValues((current) => (Object.keys(current).length > 0 ? current : fallbackValues(meta)));
      } finally {
        setBusyExample(null);
      }
    },
    [meta],
  );

  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void loadExample('Graduate');
  }, [loadExample]);

  const reset = () => {
    setStage(0);
    setBlind(false);
    setAutoPredict(true);
    void loadExample('Graduate');
  };

  // ------------------------------------------------------------ editing

  const onFieldChange = useCallback((name: string, value: string) => {
    setValues((v) => ({ ...v, [name]: value }));
    setServerErrors((e) => {
      if (!(name in e)) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
    setLoaded((l) => (l && !l.edited ? { ...l, edited: true } : l));
  }, []);

  // ------------------------------------------------------------ predict

  const runPredict = useCallback(() => {
    const body = requestRef.current;
    if (!body) return;
    setSentKey(JSON.stringify(body));
    mutatePredict(body, {
      onSuccess: () => setServerErrors({}),
      onError: (err) => {
        if (isValidationError(err)) setServerErrors(err.byFeature());
      },
    });
  }, [mutatePredict]);

  useEffect(() => {
    if (!autoPredict || requestKey === null) return;
    const timer = window.setTimeout(runPredict, AUTO_PREDICT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoPredict, requestKey, runPredict]);

  // Any change to the inputs, stage or blind switch makes an old LIME result invalid.
  useEffect(() => {
    resetLime();
  }, [requestKey, resetLime]);

  const runLime = () => {
    if (!request) return;
    mutateLime(request);
    window.setTimeout(() => comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const result = predict.data;
  const isStale = result !== undefined && sentKey !== requestKey;
  const showComparison = result !== undefined && !isStale && (lime.isPending || lime.isSuccess || lime.isError);
  const predictError = predict.isError && !isValidationError(predict.error) ? predict.error : null;
  const serverIssueCount = predict.isError && isValidationError(predict.error) ? predict.error.issues.length : 0;

  // ------------------------------------------------------------ render

  const stageTabs = meta.stages.map((s) => ({
    id: String(s.id) as StageTabId,
    label: (
      <span className="flex items-center gap-1.5">
        {s.label}
        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{featuresForStage(meta, s.id).length}</span>
      </span>
    ),
  }));

  const statusLine = !ready ? null : errorCount > 0 ? (
    <span className="text-red-700 dark:text-red-400">
      Fix {errorCount} {errorCount === 1 ? 'field' : 'fields'} to update the prediction.
    </span>
  ) : predict.isPending ? (
    'Updating the prediction…'
  ) : isStale ? (
    autoPredict ? 'Updating the prediction…' : 'You changed something. Press Predict to update.'
  ) : result ? (
    'The prediction is up to date.'
  ) : null;

  const predictButton = (
    <button type="button" className={primaryButton} onClick={runPredict} disabled={!request || predict.isPending}>
      {predict.isPending && <Spinner />}
      Predict
    </button>
  );

  return (
    <div className="pb-20 lg:pb-0">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* ---------------------------------------------------------- form */}
        {/* noValidate: the app's own validateField is the only check; native step/range bubbles would block submit. */}
        <form
          noValidate
          className="min-w-0 space-y-4"
          aria-label="Student details"
          onSubmit={(e) => {
            e.preventDefault();
            runPredict();
          }}
        >
          <Card>
            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">When are we predicting?</p>
                <Tabs<StageTabId>
                  ariaLabel="Prediction stage"
                  variant="pills"
                  value={String(stage) as StageTabId}
                  onChange={(id) => setStage(Number(id) as StageId)}
                  tabs={stageTabs}
                />
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  Each stage adds what the university knows by then: {featuresForStage(meta, stage).length} fields at
                  this stage. Values you enter are kept when you switch.
                </p>
              </div>

              <Switch
                checked={blind}
                onChange={setBlind}
                label={`Hide sensitive attributes (${meta.sensitive_features.map((n) => featuresByName.get(n)?.label ?? n).join(', ')})`}
                description="Uses a separate model trained without these fields, so they cannot influence the result."
              />

              <ExampleBar loaded={loaded} busy={busyExample} onLoad={(k) => void loadExample(k)} onReset={reset} />
              {exampleError !== null && (
                <ErrorState error={exampleError} title="Could not load the example student" />
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                {predictButton}
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoPredict}
                    onChange={(e) => setAutoPredict(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                  />
                  Update automatically
                </label>
                <span className="text-xs text-slate-600 dark:text-slate-400" aria-live="polite">
                  {statusLine}
                </span>
              </div>
            </div>
          </Card>

          {!ready ? (
            <Loading label="Loading the starting student…" />
          ) : (
            <FormSections
              sections={sections}
              stage={stage}
              blind={blind}
              values={values}
              errors={errors}
              onChange={onFieldChange}
            />
          )}

          {ready && <div className="flex justify-end">{predictButton}</div>}
        </form>

        {/* ---------------------------------------------------------- results */}
        <aside
          id="prediction-result"
          aria-label="Prediction result"
          className="min-w-0 scroll-mt-28 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1"
        >
          <div className={isStale ? 'space-y-4 opacity-60 transition-opacity' : 'space-y-4 transition-opacity'}>
            {predictError && <ErrorState error={predictError} title="Prediction failed" onRetry={runPredict} labelFor={labelFor} />}
            {serverIssueCount > 0 && (
              <ErrorState
                error={predict.error}
                labelFor={labelFor}
                title={`The model could not use ${serverIssueCount === 1 ? 'one answer' : `${serverIssueCount} answers`}. Please check the highlighted fields.`}
              />
            )}
            {result ? (
              <>
                <ResultSummary result={result} stageLabel={meta.stages.find((s) => s.id === result.stage)?.label ?? stageLabel} />
                <ShapCard
                  shap={result.shap}
                  featuresByName={featuresByName}
                  footer={
                    <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                      <button
                        type="button"
                        className={primaryButton}
                        onClick={runLime}
                        disabled={!request || isStale || lime.isPending}
                      >
                        {lime.isPending && <Spinner />}
                        {lime.isSuccess ? 'Run LIME again' : 'Explain with LIME'}
                      </button>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        A second explanation method, shown next to SHAP below. It takes a moment.
                      </p>
                    </div>
                  }
                />
              </>
            ) : (
              !predictError &&
              serverIssueCount === 0 && (
                <Card title="Prediction">
                  {predict.isPending || !ready ? (
                    <Loading label="Calculating…" />
                  ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Fill in the form and press Predict to see the dropout risk and why.
                    </p>
                  )}
                </Card>
              )
            )}
          </div>
        </aside>
      </div>

      {showComparison && result && (
        <div ref={comparisonRef} className="mt-8 scroll-mt-28">
          <LimeComparison
            shap={result.shap}
            lime={lime.data}
            isLoading={lime.isPending}
            error={lime.isError ? lime.error : null}
            onRetry={runLime}
            featuresByName={featuresByName}
          />
        </div>
      )}

      {/* Phone-only summary bar so the result is never far away. */}
      {result && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <span className="font-semibold text-slate-900 dark:text-white">
                Dropout {formatPercent(result.probabilities.Dropout)}
              </span>{' '}
              <Badge variant={result.flagged_at_risk ? 'danger' : 'success'}>
                {result.flagged_at_risk ? 'At risk' : 'Not flagged'}
              </Badge>
              {isStale && <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">updating…</span>}
            </div>
            <a
              href="#prediction-result"
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white no-underline hover:bg-indigo-700 hover:no-underline dark:bg-indigo-500"
            >
              See result
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
