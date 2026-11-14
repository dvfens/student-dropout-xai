import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge, Card, InfoBox, PageHeader, Stat } from '../components';
import { useChartTheme } from '../hooks/useChartTheme';
import { formatNumber, formatPValue } from '../lib/format';
import { NotebookFigure } from './analysis/NotebookFigure';

interface ModelResult {
  model: string;
  /** Mean macro-F1 over the 10 CV folds (notebook cell 14). */
  mean: number;
  std: number;
  /** Mean rank across folds, 1 = best (notebook cell 15). */
  rank: number;
  /** Nemenyi p-value against XGBoost (notebook cell 15); null for XGBoost itself. */
  pVsXgb: number | null;
}

/** Sorted best to worst by mean rank. */
const MODELS: ModelResult[] = [
  { model: 'XGBoost', mean: 0.7126, std: 0.0122, rank: 1.1, pVsXgb: null },
  { model: 'Random Forest', mean: 0.6921, std: 0.0094, rank: 2.1, pVsXgb: 0.6184 },
  { model: 'SVM (RBF)', mean: 0.6729, std: 0.0126, rank: 3.4, pVsXgb: 0.0101 },
  { model: 'Logistic Reg.', mean: 0.674, std: 0.0149, rank: 3.8, pVsXgb: 0.0013 },
  { model: 'Decision Tree', mean: 0.6622, std: 0.0166, rank: 4.6, pVsXgb: 0.0 },
];

/** Classification report of the final model on the 885 test students (notebook cell 20). */
const REPORT: { label: string; precision: number; recall: number; f1: number; support: number }[] = [
  { label: 'Dropout', precision: 0.807, recall: 0.736, f1: 0.77, support: 284 },
  { label: 'Enrolled', precision: 0.526, recall: 0.44, f1: 0.479, support: 159 },
  { label: 'Graduate', precision: 0.815, recall: 0.91, f1: 0.86, support: 442 },
  { label: 'Macro average', precision: 0.716, recall: 0.695, f1: 0.703, support: 885 },
  { label: 'Weighted average', precision: 0.761, recall: 0.769, f1: 0.763, support: 885 },
];
const TEST_ACCURACY = 0.769;

function nemenyiText(p: number | null): string {
  if (p === null) return '–';
  return p < 0.001 ? '< 0.001' : formatPValue(p);
}

function ScoreChart() {
  const ct = useChartTheme();
  const data = MODELS.map((m) => ({ ...m, error: m.std }));
  return (
    <div className="h-72 min-w-0" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 16, left: 4 }}>
          <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 0.8]}
            ticks={[0, 0.2, 0.4, 0.6, 0.8]}
            stroke={ct.axis}
            tick={{ fill: ct.text, fontSize: 12 }}
            label={{ value: 'Mean macro-F1 (± std)', position: 'insideBottom', offset: -8, fill: ct.mutedText, fontSize: 12 }}
          />
          <YAxis type="category" dataKey="model" width={104} stroke={ct.axis} tick={{ fill: ct.text, fontSize: 12 }} />
          <Tooltip
            {...ct.tooltip}
            cursor={{ fill: ct.cursor }}
            formatter={(value, _name, item) => {
              const d = item.payload as ModelResult;
              return [`${formatNumber(Number(value), 4)} ± ${formatNumber(d.std, 4)}`, 'Macro-F1'];
            }}
          />
          <Bar dataKey="mean" isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {data.map((d) => (
              <Cell key={d.model} fill={d.model === 'XGBoost' ? ct.primary : ct.axis} />
            ))}
            <ErrorBar dataKey="error" width={6} stroke={ct.text} direction="x" />
            <LabelList dataKey="mean" position="right" offset={14} formatter={(v) => formatNumber(Number(v), 3)} fill={ct.text} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RankChart() {
  const ct = useChartTheme();
  return (
    <div className="h-72 min-w-0" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={MODELS} layout="vertical" margin={{ top: 4, right: 40, bottom: 16, left: 4 }}>
          <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 5]}
            ticks={[0, 1, 2, 3, 4, 5]}
            stroke={ct.axis}
            tick={{ fill: ct.text, fontSize: 12 }}
            label={{ value: 'Mean rank (1 = best)', position: 'insideBottom', offset: -8, fill: ct.mutedText, fontSize: 12 }}
          />
          <YAxis type="category" dataKey="model" width={104} stroke={ct.axis} tick={{ fill: ct.text, fontSize: 12 }} />
          <Tooltip
            {...ct.tooltip}
            cursor={{ fill: ct.cursor }}
            formatter={(value) => [formatNumber(Number(value), 1), 'Mean rank']}
          />
          <Bar dataKey="rank" isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {MODELS.map((d) => (
              <Cell key={d.model} fill={d.model === 'XGBoost' ? ct.primary : ct.axis} />
            ))}
            <LabelList dataKey="rank" position="right" formatter={(v) => Number(v).toFixed(1)} fill={ct.text} fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const th = 'px-3 py-2 font-semibold whitespace-nowrap';
const td = 'px-3 py-2 tabular-nums';

export default function ModelComparisonPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Model comparison"
        lede="Five common models were tested the same way. Is the best one really better, or did it just get lucky with the data split? The Friedman test answers that."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat value="31.12" label="Friedman chi-square" hint="5 models, 10 rounds" />
        <Stat value="p < 0.001" label="p-value" hint="The models really differ" />
        <Stat value="0.778" label="Kendall’s W" hint="Effect size: 0 = no agreement, 1 = same order every round" />
        <Stat value="XGBoost" label="Best model" hint="Mean rank 1.1" />
      </div>

      <InfoBox title="How the models were tested">
        <p>
          Each model was trained and tested 10 times on different splits of the data (5-fold cross-validation, repeated
          twice). The score is <strong>macro-F1</strong>: it averages the F1 score of the three outcomes, so the small
          “Enrolled” group counts as much as the others. In every round the models are ranked 1 (best) to 5 (worst).
          The Friedman test then checks whether some models get better ranks again and again. They do: XGBoost was
          first in almost every round.
        </p>
      </InfoBox>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Average score" subtitle="Mean macro-F1 over 10 rounds; the whisker shows the spread (std)">
          <ScoreChart />
        </Card>
        <Card title="Average rank" subtitle="Shorter bar = better (rank 1 = best in a round)">
          <RankChart />
        </Card>
      </div>

      <Card title="Results table" subtitle="The Nemenyi follow-up test says which models are significantly worse than XGBoost">
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <caption className="sr-only">Macro-F1, mean rank and Nemenyi p-value against XGBoost for each model</caption>
            <thead className="bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <tr>
                <th scope="col" className={`${th} text-left`}>Model</th>
                <th scope="col" className={`${th} text-right`}>Mean macro-F1</th>
                <th scope="col" className={`${th} text-right`}>Std</th>
                <th scope="col" className={`${th} text-right`}>Mean rank</th>
                <th scope="col" className={`${th} text-right`}>p vs XGBoost</th>
                <th scope="col" className={`${th} text-left`}>Clearly worse than XGBoost?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800 dark:text-slate-300">
              {MODELS.map((m) => (
                <tr key={m.model}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{m.model}</td>
                  <td className={`${td} text-right`}>{formatNumber(m.mean, 4)}</td>
                  <td className={`${td} text-right`}>{formatNumber(m.std, 4)}</td>
                  <td className={`${td} text-right`}>{m.rank.toFixed(1)}</td>
                  <td className={`${td} text-right`}>{nemenyiText(m.pVsXgb)}</td>
                  <td className="px-3 py-2">
                    {m.pVsXgb === null ? (
                      <Badge variant="info">best model</Badge>
                    ) : m.pVsXgb < 0.05 ? (
                      <Badge variant="danger">Yes</Badge>
                    ) : (
                      <Badge variant="neutral">No, too close to call</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          XGBoost is significantly better than SVM, logistic regression and the decision tree. Its lead over random
          forest is not statistically significant.
        </p>
      </Card>

      <InfoBox title="How to read the two charts below">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Nemenyi heatmap (right half of the first figure):</strong> each cell is the p-value for one pair of
            models. Green cells (p below 0.05) mean that pair really differs; red cells mean the difference could be
            chance.
          </li>
          <li>
            <strong>Critical-difference diagram:</strong> models sit on a line by their average rank (left = better).
            Models joined by a black bar are not significantly different from each other.
          </li>
        </ul>
      </InfoBox>

      <div className="grid gap-6">
        <NotebookFigure
          file="05_friedman_nemenyi.png"
          section="model_comparison"
          caption="Left: the spread of macro-F1 scores over the 10 rounds for each model. Right: Nemenyi p-values for each pair of models."
        />
        <NotebookFigure
          file="06_critical_difference.png"
          section="model_comparison"
          caption="XGBoost (1.1) and random forest (2.1) share a bar, so they are not significantly different. XGBoost does not share a bar with SVM, logistic regression or the decision tree."
        />
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Fewer features, same model</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <NotebookFigure
            file="07_feature_selection_friedman.png"
            section="model_comparison"
            caption="XGBoost with all 36 features versus three 15-feature sets. Friedman chi-square = 8.76, p = 0.033. Only “all 36” versus the filter set is a significant difference (Nemenyi p = 0.029); all 15-feature sets lose only about 0.01 in macro-F1."
          />
          <Card title="What this means" headingLevel={3}>
            <p className="leading-relaxed text-slate-700 dark:text-slate-300">
              Using every feature gives the best average score (0.7126). The three 15-feature sets score 0.7008
              (filter), 0.7021 (embedded) and 0.7038 (wrapper). The gap is small, and only the filter set is
              significantly worse. So a much smaller, easier-to-explain model is almost as good.
            </p>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">The final model on unseen students</h2>
        <p className="max-w-3xl leading-relaxed text-slate-700 dark:text-slate-300">
          XGBoost was trained on the 15 consensus features using 80% of the students, then tested on the other 20% (885
          students it had never seen). It got {formatNumber(TEST_ACCURACY * 100, 1)}% of them right. It is good at
          spotting graduates and dropouts, and weaker on students who are still enrolled.
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <NotebookFigure
            file="08_confusion_matrix.png"
            section="model_comparison"
            caption="Rows are the real outcome, columns the predicted outcome. The diagonal shows correct predictions."
          />
          <Card title="Classification report" subtitle={`Test set, accuracy ${formatNumber(TEST_ACCURACY, 3)}`} headingLevel={3}>
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  <caption className="sr-only">Precision, recall and F1 per outcome on the test set</caption>
                  <thead className="bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <tr>
                      <th scope="col" className={`${th} text-left`}>Outcome</th>
                      <th scope="col" className={`${th} text-right`}>Precision</th>
                      <th scope="col" className={`${th} text-right`}>Recall</th>
                      <th scope="col" className={`${th} text-right`}>F1</th>
                      <th scope="col" className={`${th} text-right`}>Students</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800 dark:text-slate-300">
                    {REPORT.map((r) => (
                      <tr key={r.label} className={r.support === 885 ? 'bg-slate-50/60 dark:bg-slate-900/60' : undefined}>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{r.label}</td>
                        <td className={`${td} text-right`}>{r.precision.toFixed(3)}</td>
                        <td className={`${td} text-right`}>{r.recall.toFixed(3)}</td>
                        <td className={`${td} text-right`}>{r.f1.toFixed(3)}</td>
                        <td className={`${td} text-right`}>{r.support}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
                <li>
                  <strong>Precision:</strong> when the model predicts an outcome (say “Dropout”), how often it is right.
                </li>
                <li>
                  <strong>Recall:</strong> of the students who really had that outcome, how many the model found.
                </li>
                <li>
                  <strong>F1:</strong> one number that balances precision and recall.
                </li>
              </ul>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
