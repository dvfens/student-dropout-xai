import type { PredictResponse } from '../../api/types';
import { CLASS_NAMES } from '../../api/types';
import { Badge, Card, InfoBox, classBadgeVariant } from '../../components';
import { formatPercent } from '../../lib/format';
import { RiskGauge } from './RiskGauge';

/** The notebook flags the top 30% riskiest students, i.e. percentile >= 70. */
export const FLAG_PERCENTILE = 70;

const BAR_CLASS: Record<(typeof CLASS_NAMES)[number], string> = {
  Dropout: 'bg-dropout',
  Enrolled: 'bg-enrolled',
  Graduate: 'bg-graduate',
};

const FRIENDLY: Record<(typeof CLASS_NAMES)[number], string> = {
  Dropout: 'Drops out',
  Enrolled: 'Still enrolled',
  Graduate: 'Graduates',
};

export interface ResultSummaryProps {
  result: PredictResponse;
  stageLabel: string;
}

/** Reliability banner, class probabilities, percentile gauge and the at-risk flag. */
export function ResultSummary({ result, stageLabel }: ResultSummaryProps) {
  const { reliability } = result;
  const percentile = result.dropout_percentile;

  return (
    <div className="space-y-4">
      {reliability.level === 'weak' ? (
        <InfoBox variant="warning" title="Predictions at this stage are weak">
          <p>{reliability.message}</p>
        </InfoBox>
      ) : (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          {reliability.message}
        </p>
      )}

      <Card
        title="Prediction"
        subtitle={`${stageLabel}${result.blind ? ' · sensitive attributes hidden' : ''}`}
        actions={
          <Badge variant={result.flagged_at_risk ? 'danger' : 'success'}>
            {result.flagged_at_risk ? 'At risk' : 'Not flagged'}
          </Badge>
        }
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Most likely outcome:{' '}
            <Badge variant={classBadgeVariant(result.predicted_class)}>
              {FRIENDLY[result.predicted_class]} ({result.predicted_class})
            </Badge>
          </p>

          <ul className="space-y-2.5" aria-label="Probability of each outcome">
            {CLASS_NAMES.map((cls) => {
              const p = result.probabilities[cls];
              return (
                <li key={cls} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{cls}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                    <span
                      className={`block h-full rounded-full ${BAR_CLASS[cls]} transition-[width] duration-300`}
                      style={{ width: `${Math.max(p * 100, 0.5)}%` }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                    {formatPercent(p)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
            <RiskGauge percentile={percentile} flagAt={FLAG_PERCENTILE} flagged={result.flagged_at_risk} />
            <p className="mt-2 text-center text-base font-semibold text-slate-900 dark:text-white">
              Riskier than {percentile.toFixed(0)}% of past students at this stage
            </p>
            <p className="mt-2 text-center text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Like the notebook, we flag the riskiest 30% of students at each stage (percentile {FLAG_PERCENTILE} or
              higher). At this stage that means a dropout chance of {formatPercent(result.flag_threshold)} or more.
              The shaded part of the gauge is the flagged zone.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
