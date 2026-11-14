import type { ReactNode } from 'react';
import type { ClassName, Feature, LimeResponse, LimeWeight, ShapExplanation } from '../../api/types';
import { Card, ErrorState, Loading } from '../../components';
import { useChartTheme } from '../../hooks/useChartTheme';
import { ContributionChart, ContributionLegend, type ContributionRow } from './ContributionChart';
import { contributionSentence } from './explainText';

/** The backend adds these optional fields to each LIME weight (see docs/DEVIATIONS.md). */
type LimeWeightWithLabels = LimeWeight & { label?: string; value_label?: string };

function shapRows(shap: ShapExplanation): ContributionRow[] {
  return shap.contributions.map((c) => ({
    key: c.feature,
    label: (
      <>
        {c.label} = <span className="font-semibold">{c.value_label}</span>
      </>
    ),
    value: c.shap,
  }));
}

export interface ShapCardProps {
  shap: ShapExplanation;
  featuresByName: Map<string, Feature>;
  /** Rendered under the sentences (e.g. the LIME button). */
  footer?: ReactNode;
}

/** Waterfall of the top SHAP contributions plus plain-language sentences. */
export function ShapCard({ shap, featuresByName, footer }: ShapCardProps) {
  return (
    <Card
      title="Why this prediction? (SHAP)"
      subtitle="The 8 answers that moved the dropout risk the most for this student."
    >
      <div className="space-y-5">
        <ContributionLegend towards="Pushes towards dropout" away="Pushes away from dropout" />
        <ContributionChart
          rows={shapRows(shap)}
          mode="waterfall"
          baseValue={shap.base_value}
          baseLabel="Average student (base value)"
          totalLabel="After these 8 answers"
          ariaLabel="SHAP waterfall chart of the top 8 contributions to the dropout risk"
        />
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Numbers are in log-odds, the model&apos;s internal score for dropout: a higher score means dropout is more
          likely, and a push of 1 or more is large. Each bar starts where the one above ended. The other features add smaller amounts that are not
          shown, so the last row is not the final score.
        </p>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">In plain words</h3>
          <ul className="mt-2 space-y-2">
            {shap.contributions.map((c) => (
              <li key={c.feature} className="flex gap-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.direction === 'increases' ? 'bg-dropout' : 'bg-blue-600 dark:bg-blue-400'}`}
                  aria-hidden="true"
                />
                <span>{contributionSentence(c, featuresByName.get(c.feature))}</span>
              </li>
            ))}
          </ul>
        </div>
        {footer}
      </div>
    </Card>
  );
}

export interface LimeComparisonProps {
  shap: ShapExplanation;
  lime: LimeResponse | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  featuresByName: Map<string, Feature>;
}

/** SHAP and LIME side by side (stacked on phones), with a note on why they differ. */
export function LimeComparison({ shap, lime, isLoading, error, onRetry, featuresByName }: LimeComparisonProps) {
  const ct = useChartTheme();
  const explained: ClassName | undefined = lime?.class_explained;
  // Dropout keeps the red/blue SHAP colours; other classes use their own colour vs. grey.
  // The Enrolled amber is darkened a little so thin bars stay visible on white.
  const limeColors =
    explained === 'Graduate'
      ? { towards: ct.classColors.Graduate, away: ct.mutedText }
      : explained === 'Enrolled'
        ? { towards: '#d4a017', away: ct.mutedText }
        : undefined;

  return (
    <Card
      title="Compare SHAP and LIME"
      subtitle="Two different ways of explaining the same prediction."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">SHAP: towards dropout</h3>
          <ContributionLegend towards="Pushes towards dropout" away="Pushes away from dropout" />
          <ContributionChart
            rows={shapRows(shap)}
            mode="diverging"
            ariaLabel="SHAP contributions to the dropout risk, each measured from zero"
          />
          <p className="text-xs text-slate-600 dark:text-slate-400">Log-odds of the Dropout class.</p>
        </div>
        <div className="min-w-0 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            LIME{explained ? `: towards ${explained}` : ''}
          </h3>
          {isLoading && <Loading label="Running LIME (5,000 small variations of this student)…" />}
          {!isLoading && error !== null && error !== undefined && (
            <ErrorState
              error={error}
              title="LIME could not run"
              onRetry={onRetry}
              labelFor={(name) => featuresByName.get(name)?.label ?? name}
            />
          )}
          {lime && !isLoading && (
            <>
              <ContributionLegend
                towards={`Supports ${lime.class_explained}`}
                away={`Speaks against ${lime.class_explained}`}
                colors={limeColors}
              />
              <ContributionChart
                rows={(lime.weights as LimeWeightWithLabels[]).map((w) => ({
                  key: w.rule,
                  label: (
                    <>
                      {w.label ?? featuresByName.get(w.feature)?.label ?? w.feature}
                      {w.value_label !== undefined && (
                        <>
                          {' '}
                          = <span className="font-semibold">{w.value_label}</span>
                        </>
                      )}
                    </>
                  ),
                  detail: `rule: ${w.rule}`,
                  value: w.weight,
                }))}
                mode="diverging"
                colors={limeColors}
                decimals={3}
                ariaLabel={`LIME weights for the ${lime.class_explained} class`}
              />
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Change in the {lime.class_explained} probability (0-1 scale) from LIME&apos;s simple local model.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
        <p className="font-semibold text-slate-900 dark:text-white">Why can they disagree?</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            SHAP splits the model&apos;s own dropout score exactly between the answers. LIME instead tries thousands of
            slightly changed copies of the student and fits a simple straight-line model to them, so it is an
            approximation.
          </li>
          <li>
            LIME explains the most likely outcome
            {explained && explained !== 'Dropout' ? ` (here ${explained}, not Dropout)` : ''}, in probability units;
            SHAP here always explains dropout, in log-odds. Signs and sizes are not directly comparable.
          </li>
          <li>
            LIME works with ranges (&quot;Age &gt; 25&quot;) and treats coded answers such as Course as numbers, so a rule like
            &quot;Course &lt;= 9085&quot; is about code numbers, not about similar courses. The selected answer is shown next to each rule.
          </li>
          <li>When both methods point to the same answers, you can trust that part of the explanation more.</li>
        </ul>
      </div>
    </Card>
  );
}
