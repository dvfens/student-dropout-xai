import { useTable, useFigures } from '../api/hooks';
import type { CellValue, FigureInfo } from '../api/types';
import { Badge, Card, DataTable, FigureCard, InfoBox, PageHeader, QueryState, type ColumnDef } from '../components';
import { formatPValue } from '../lib/format';

// ---------------------------------------------------------------- notebook numbers

/**
 * Group-wise performance of the screening model (notebook cell 40), with group sizes and
 * true dropout rates from cell 37. Flag rule: P(Dropout) >= 0.5, out-of-fold for all 4,424 students.
 */
interface GroupRow extends Record<string, CellValue> {
  attribute: string;
  group: string;
  n: number;
  true_dropout_rate: number;
  flag_rate: number;
  TPR: number;
  FPR: number;
  accuracy: number;
}

const GROUP_ROWS: GroupRow[] = [
  { attribute: 'Gender', group: 'Female', n: 2868, true_dropout_rate: 0.251, flag_rate: 0.212, TPR: 0.714, FPR: 0.044, accuracy: 0.895 },
  { attribute: 'Gender', group: 'Male', n: 1556, true_dropout_rate: 0.451, flag_rate: 0.399, TPR: 0.756, FPR: 0.106, accuracy: 0.832 },
  { attribute: 'Age group', group: '<=20', n: 2551, true_dropout_rate: 0.212, flag_rate: 0.16, TPR: 0.6, FPR: 0.041, accuracy: 0.883 },
  { attribute: 'Age group', group: '21-24', n: 735, true_dropout_rate: 0.337, flag_rate: 0.294, TPR: 0.677, FPR: 0.099, accuracy: 0.826 },
  { attribute: 'Age group', group: '25-29', n: 427, true_dropout_rate: 0.576, flag_rate: 0.541, TPR: 0.858, FPR: 0.11, accuracy: 0.871 },
  { attribute: 'Age group', group: '30+', n: 711, true_dropout_rate: 0.541, flag_rate: 0.527, TPR: 0.883, FPR: 0.107, accuracy: 0.887 },
  { attribute: 'Nationality', group: 'Portuguese', n: 4314, true_dropout_rate: 0.322, flag_rate: 0.277, TPR: 0.733, FPR: 0.06, accuracy: 0.873 },
  { attribute: 'Nationality', group: 'Non-Portuguese', n: 110, true_dropout_rate: 0.291, flag_rate: 0.318, TPR: 0.812, FPR: 0.115, accuracy: 0.864 },
];

/** Plain names for the metric codes used in the CSVs. */
const METRIC_LABELS: Record<string, string> = {
  flag_rate: 'Share flagged',
  TPR: 'Recall of real dropouts (TPR)',
  FPR: 'False alarms (FPR)',
  accuracy: 'Accuracy',
};

function metricLabel(code: CellValue): string {
  return typeof code === 'string' ? (METRIC_LABELS[code] ?? code) : String(code ?? '–');
}

// ---------------------------------------------------------------- table rows

interface GapRow extends Record<string, CellValue> {
  attribute: string;
  metric: string;
  highest: string;
  lowest: string;
  gap: number;
  p_perm: number;
  p_FDR: number;
  significant: boolean;
}

interface ShapDiffRow extends Record<string, CellValue> {
  attribute: string;
  feature: string;
  highest_group: string;
  ratio_max_min: number;
  eps2: number;
  p: number;
  p_FDR: number;
}

/** The CSV rounds p-values to 4 decimals, so 0 really means "below 0.0001". */
function roundedP(value: CellValue): string {
  if (typeof value !== 'number') return '–';
  return value === 0 ? '< 0.0001' : formatPValue(value);
}

const percentCol = (key: keyof GroupRow & string, header: string, description?: string): ColumnDef<GroupRow> => ({
  key,
  header,
  format: 'percent',
  decimals: 1,
  align: 'right',
  description,
});

const GROUP_COLUMNS: ColumnDef<GroupRow>[] = [
  { key: 'attribute', header: 'Attribute' },
  { key: 'group', header: 'Group' },
  { key: 'n', header: 'Students', align: 'right' },
  percentCol('true_dropout_rate', 'Real dropout rate', 'Share of the group that actually dropped out'),
  percentCol('flag_rate', 'Share flagged', 'Share of the group flagged as at risk'),
  percentCol('TPR', 'Recall of real dropouts (TPR)', 'Of the students who really dropped out, the share the model caught'),
  percentCol('FPR', 'False alarms (FPR)', 'Of the students who did not drop out, the share wrongly flagged'),
  percentCol('accuracy', 'Accuracy', 'Share of correct at-risk / not-at-risk decisions'),
];

const GAP_COLUMNS: ColumnDef<GapRow>[] = [
  { key: 'attribute', header: 'Attribute' },
  { key: 'metric', header: 'Measure', render: (r) => metricLabel(r.metric) },
  { key: 'highest', header: 'Highest group' },
  { key: 'lowest', header: 'Lowest group' },
  { key: 'gap', header: 'Gap', format: 'percent', decimals: 1, align: 'right', description: 'Highest minus lowest group' },
  { key: 'p_perm', header: 'p (permutation)', format: 'pvalue', align: 'right' },
  { key: 'p_FDR', header: 'p (corrected)', format: 'pvalue', align: 'right', description: 'Corrected for testing many gaps at once (FDR)' },
  {
    key: 'significant',
    header: 'Real gap?',
    render: (r) => <Badge variant={r.significant ? 'danger' : 'neutral'}>{r.significant ? 'Yes' : 'No'}</Badge>,
  },
];

const SHAP_DIFF_COLUMNS: ColumnDef<ShapDiffRow>[] = [
  { key: 'attribute', header: 'Attribute' },
  { key: 'feature', header: 'Feature' },
  { key: 'highest_group', header: 'Relied on most for' },
  {
    key: 'ratio_max_min',
    header: 'Ratio (max / min)',
    decimals: 2,
    align: 'right',
    description: 'How many times more the model leans on the feature for the top group than for the bottom group',
  },
  { key: 'eps2', header: 'Effect size (ε²)', decimals: 3, align: 'right', description: '0 = no difference between groups, 1 = complete separation' },
  { key: 'p_FDR', header: 'p (corrected)', align: 'right', render: (r) => roundedP(r.p_FDR) },
];

const highlightSignificant = (significant: boolean) =>
  significant ? 'bg-rose-50 dark:bg-rose-950/30' : undefined;

// ---------------------------------------------------------------- page

function figureByFile(figs: FigureInfo[], file: string): FigureInfo | undefined {
  return figs.find((f) => f.file === file);
}

function Limitations() {
  return (
    <InfoBox variant="warning" title="How to read this / limitations" className="border-2 text-base">
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Small groups are uncertain.</strong> Only 110 students are non-Portuguese (about 32 of them dropped out), so
          their numbers jump around a lot and the confidence intervals are wide. One student more or less changes their recall
          by about 3 points.
        </li>
        <li>
          <strong>Correlation is not causation.</strong> SHAP describes how the <em>model</em> behaves, not why students drop
          out. “Age raises the risk” means the model uses age, not that being older causes dropout.
        </li>
        <li>
          <strong>Groups really differ.</strong> The real dropout rate is 25% for women and 45% for men, 21% for students aged
          20 or under and 58% for those aged 25–29. Different flag rates can partly reflect these real differences, not only
          model bias.
        </li>
        <li>
          <strong>Hidden proxies.</strong> Removing a sensitive column does not remove its information. For example, Course is
          strongly linked to gender (association 0.428), so the model can still “see” gender through the course.
        </li>
        <li>
          <strong>Group-specific thresholds are risky.</strong> Using a different cut-off per gender, age or nationality means
          treating people differently because of a protected attribute. This can be unlawful and raises ethical questions, even
          when the goal is to make outcomes fairer. The experiment below is an analysis, not a recommendation.
        </li>
        <li>
          Data come from one institution, and “Enrolled” students have no final outcome yet.
        </li>
      </ul>
    </InfoBox>
  );
}

export default function FairnessPage() {
  const figures = useFigures('fairness');
  const gaps = useTable<GapRow>('fairness_gaps');
  const shapDiff = useTable<ShapDiffRow>('shap_group_differences');

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fairness"
        lede="Does the model make different mistakes for different groups of students (gender, age, nationality), and does it rely on different reasons for them?"
      />

      <Limitations />

      <InfoBox>
        <p>
          The screening rule flags a student as <strong>at risk</strong> when the final model gives a dropout probability of 0.5
          or more. Every student is scored by a model that never saw them (5-fold out-of-fold predictions for all 4,424
          students).
        </p>
        <p>
          <strong>Share flagged</strong> = how many in the group are flagged. <strong>Recall (TPR)</strong> = of the students who
          really dropped out, how many were caught (missed students are the costly mistake). <strong>False alarms (FPR)</strong> =
          of the students who did not drop out, how many were flagged anyway.
        </p>
      </InfoBox>

      <QueryState query={figures} loadingLabel="Loading figures…">
        {(figs) => {
          const fig = (file: string) => figureByFile(figs, file);
          const f16 = fig('16_group_error_rates.png');
          const f17 = fig('17_shap_by_group_heatmap.png');
          const f18 = fig('18_shap_group_effects.png');
          const f19 = fig('19_age_reliance_matched.png');
          const f20 = fig('20_mitigation.png');
          return (
            <>
              <section className="space-y-4" aria-labelledby="errors-heading">
                <h2 id="errors-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
                  Error rates by group
                </h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  {f16 && (
                    <FigureCard
                      figure={f16}
                      caption="Each bar is one group; the dashed line is the overall value and the whiskers are 95% intervals. Older students and men are flagged far more often, and fewer young dropouts are caught (recall 60% for ≤20 vs 88% for 30+)."
                    />
                  )}
                  <Card title="The numbers behind the chart" subtitle="Notebook section 9.3" className="min-w-0">
                    <DataTable
                      rows={GROUP_ROWS}
                      columns={GROUP_COLUMNS}
                      searchable={false}
                      caption="Screening performance by group"
                    />
                  </Card>
                </div>
              </section>

              <section className="space-y-4" aria-labelledby="gaps-heading">
                <h2 id="gaps-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
                  Are the gaps real or just chance?
                </h2>
                <Card
                  subtitle="For each measure we take the largest gap between groups and shuffle the group labels 2,000 times to see how often such a gap appears by chance. Highlighted rows are real gaps after correcting for many tests."
                >
                  <QueryState query={gaps} loadingLabel="Loading gap table…">
                    {(t) => (
                      <DataTable
                        rows={t.rows}
                        columns={GAP_COLUMNS}
                        caption="Largest group gaps with permutation tests"
                        rowClassName={(r) => highlightSignificant(r.significant)}
                      />
                    )}
                  </QueryState>
                </Card>
                <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  In short: age gaps are real for every measure; for gender the flag rate, false alarms and accuracy differ but
                  recall does not (gap 4.2 points, not significant); no nationality gap is significant.
                </p>
              </section>

              <section className="space-y-4" aria-labelledby="reliance-heading">
                <h2 id="reliance-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
                  Does the model rely on different features for different groups?
                </h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  {f17 && (
                    <FigureCard
                      figure={f17}
                      caption="Darker cell = the model leans more on that feature for that group (average size of its SHAP effect on dropout). Age at enrollment matters far more for students aged 25–29 than for younger ones."
                    />
                  )}
                  {f18 && (
                    <FigureCard
                      figure={f18}
                      caption="The biggest differences in reliance between groups. Longer bar = bigger difference; red = statistically significant."
                    />
                  )}
                </div>
                <Card title="Feature reliance by group" subtitle="Top differences first. Search for a feature or group." headingLevel={3}>
                  <QueryState query={shapDiff} loadingLabel="Loading table…">
                    {(t) => (
                      <DataTable
                        rows={t.rows}
                        columns={SHAP_DIFF_COLUMNS}
                        caption="Differences in SHAP reliance between groups"
                        searchPlaceholder="Search feature or group…"
                        initialSort={{ key: 'eps2', direction: 'desc' }}
                        maxHeight="26rem"
                      />
                    )}
                  </QueryState>
                </Card>
              </section>

              <section className="space-y-4" aria-labelledby="age-heading">
                <h2 id="age-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
                  Age reliance and mitigation
                </h2>
                <div className="grid gap-6 lg:grid-cols-2">
                  {f19 && (
                    <FigureCard
                      figure={f19}
                      caption={
                        <>
                          Left: men and women of the <em>same</em> age band. The age effect is close but not equal: for ages
                          26–30 it adds 0.435 for men vs 0.395 for women, and for 19–20 it lowers risk by 0.189 vs 0.159. Only the
                          23–25 band shows no real difference (p = 0.70). Right: the direct effect of the Gender feature (it carries
                          4.0% of the model’s reasoning, age 7.6%).
                        </>
                      }
                    />
                  )}
                  {f20 && (
                    <FigureCard
                      figure={f20}
                      caption={
                        <>
                          Grey = one threshold (0.5) for everyone, green = a separate threshold per group, tested on a held-back
                          half. Gender recall gap 0.055 → 0.003 with no loss (F1 0.791 → 0.794). Age gap 0.286 → 0.149, but F1
                          drops to 0.762 and accuracy from 0.878 to 0.854. Nationality barely changes (0.057 → 0.052). Simply
                          removing Age shrinks the age gap less (0.283 → 0.222) and widens the nationality gap (0.080 → 0.114).
                        </>
                      }
                    />
                  )}
                </div>
              </section>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
