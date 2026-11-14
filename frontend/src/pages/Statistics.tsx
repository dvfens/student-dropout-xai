import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTable } from '../api/hooks';
import type { CellValue } from '../api/types';
import { Card, DataTable, InfoBox, PageHeader, QueryState, Stat, type ColumnDef } from '../components';
import { useChartTheme } from '../hooks/useChartTheme';
import { formatNumber, formatPValue } from '../lib/format';
import { NotebookFigure } from './analysis/NotebookFigure';
import { shortFeatureLabel } from './analysis/shortLabel';
import { useMediaQuery } from './analysis/useMediaQuery';

const SIGNIFICANT_KEY = 'significant (FDR<0.05)';

interface StatRow extends Record<string, CellValue> {
  feature: string;
  type: string;
  test: string;
  statistic: number | null;
  p_value: number | null;
  effect_size: number | null;
  p_adj_FDR: number | null;
  [SIGNIFICANT_KEY]: boolean | string | null;
}

/** Same colours as the notebook figure 01. */
const TYPE_COLORS: Record<string, string> = { categorical: '#4C78A8', numeric: '#F58518' };

function isSignificant(row: StatRow): boolean {
  const v = row[SIGNIFICANT_KEY];
  return v === true || (typeof v === 'string' && v.toLowerCase() === 'true');
}

const COLUMNS: ColumnDef<StatRow>[] = [
  { key: 'feature', header: 'Feature' },
  {
    key: 'type',
    header: 'Type',
    render: (r) => (r.type === 'categorical' ? 'Categorical' : r.type === 'numeric' ? 'Numeric' : r.type),
  },
  { key: 'test', header: 'Test used' },
  { key: 'statistic', header: 'Test statistic', decimals: 1, description: 'Chi-square or Kruskal-Wallis H' },
  { key: 'p_value', header: 'p-value', format: 'pvalue', description: 'Before correction for many tests' },
  {
    key: 'p_adj_FDR',
    header: 'p-value (FDR-corrected)',
    format: 'pvalue',
    description: 'Benjamini-Hochberg correction for testing 36 features',
  },
  {
    key: 'effect_size',
    header: 'Effect size',
    decimals: 3,
    description: "Cramér's V for categorical features, epsilon-squared for numeric features",
  },
  { key: SIGNIFICANT_KEY, header: 'Significant?', format: 'boolean', align: 'center' },
];

interface ChartDatum {
  feature: string;
  label: string;
  type: string;
  effect: number;
  pAdj: number | null;
}

function EffectSizeChart({ rows }: { rows: StatRow[] }) {
  const ct = useChartTheme();
  const wide = useMediaQuery('(min-width: 640px)');
  const data: ChartDatum[] = useMemo(
    () =>
      rows
        .filter((r) => r.effect_size !== null)
        .map((r) => ({
          feature: r.feature,
          label: wide ? r.feature : shortFeatureLabel(r.feature),
          type: r.type,
          effect: r.effect_size ?? 0,
          pAdj: r.p_adj_FDR,
        }))
        .sort((a, b) => b.effect - a.effect),
    [rows, wide],
  );

  return (
    <div className="min-w-0" style={{ height: data.length * 24 + 48 }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 16, left: 4 }} barCategoryGap={3}>
          <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 0.5]}
            ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5]}
            stroke={ct.axis}
            tick={{ fill: ct.text, fontSize: 12 }}
            label={{ value: 'Effect size', position: 'insideBottom', offset: -8, fill: ct.mutedText, fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={wide ? 250 : 118}
            interval={0}
            stroke={ct.axis}
            tick={{ fill: ct.text, fontSize: wide ? 12 : 11 }}
          />
          <Tooltip
            {...ct.tooltip}
            cursor={{ fill: ct.cursor }}
            labelFormatter={(_label, payload) => payload[0]?.payload.feature ?? ''}
            formatter={(value, _name, item) => {
              const d = item.payload as ChartDatum;
              return [`${formatNumber(Number(value), 3)} (${d.type}, corrected p = ${formatPValue(d.pAdj)})`, 'Effect size'];
            }}
          />
          <Bar dataKey="effect" isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {data.map((d) => (
              <Cell key={d.feature} fill={TYPE_COLORS[d.type] ?? ct.primary} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">
      <li className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: TYPE_COLORS.categorical }} aria-hidden="true" />
        Categorical (Cramér’s V)
      </li>
      <li className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: TYPE_COLORS.numeric }} aria-hidden="true" />
        Numeric (epsilon-squared)
      </li>
    </ul>
  );
}

export default function StatisticsPage() {
  const table = useTable<StatRow>('statistical_tests');

  return (
    <div className="space-y-8">
      <PageHeader
        title="Statistics"
        lede="Before building any model, we tested every feature on its own: is it linked to whether a student drops out, stays enrolled or graduates? And how strong is that link?"
      />

      <InfoBox>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Effect size</strong> tells you how strong the link between a feature and the outcome is (0 = no
            link; here the strongest is about 0.43).
          </li>
          <li>
            <strong>p-value</strong> tells you how likely a link this strong would be if there were really none; below
            0.05 counts as “significant”.
          </li>
          <li>
            Because 36 features were tested, the p-values were corrected for testing many things at once
            (Benjamini-Hochberg false discovery rate, FDR).
          </li>
          <li>
            With 4,424 students, even tiny links become “significant”. So look at the <strong>effect size</strong> to
            see which features really matter.
          </li>
        </ul>
      </InfoBox>

      <QueryState query={table} loadingLabel="Loading the test results…">
        {(t) => {
          const rows = t.rows;
          const nCat = rows.filter((r) => r.type === 'categorical').length;
          const nNum = rows.filter((r) => r.type === 'numeric').length;
          const nSig = rows.filter(isSignificant).length;
          const top = [...rows].sort((a, b) => (b.effect_size ?? 0) - (a.effect_size ?? 0)).slice(0, 3);
          return (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat value={rows.length} label="Features tested" />
                <Stat value={`${nSig} of ${rows.length}`} label="Significant after correction" hint="FDR below 0.05" />
                <Stat value={nCat} label="Categorical features" hint="Chi-square test, Cramér’s V" />
                <Stat value={nNum} label="Numeric features" hint="Kruskal-Wallis test, epsilon-squared" />
              </div>

              <Card
                title="How strongly is each feature linked to the outcome?"
                subtitle="Longer bar = stronger link. Hover a bar for details."
              >
                <div className="space-y-4">
                  <Legend />
                  <EffectSizeChart rows={rows} />
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Strongest links:{' '}
                    {top.map((r, i) => (
                      <span key={r.feature}>
                        {i > 0 && (i === top.length - 1 ? ' and ' : ', ')}
                        {r.feature} ({formatNumber(r.effect_size, 3)})
                      </span>
                    ))}
                    . Paying tuition on time and the number of subjects passed matter most.
                  </p>
                </div>
              </Card>

              <Card
                title="All test results"
                subtitle="Click a column header to sort. Type in the box to search. Green rows are significant after correction."
              >
                <DataTable
                  rows={rows}
                  columns={COLUMNS}
                  caption="Statistical test of each feature against the outcome"
                  searchPlaceholder="Search features…"
                  initialSort={{ key: 'effect_size', direction: 'desc' }}
                  rowClassName={(r) => (isSignificant(r) ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : undefined)}
                  maxHeight="32rem"
                />
              </Card>
            </>
          );
        }}
      </QueryState>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">A closer look</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <NotebookFigure
            file="02_top_feature_boxplot.png"
            section="statistics"
            caption="The strongest numeric feature. Graduates passed many more subjects in semester 2 than dropouts. A follow-up test (Dunn’s test, Bonferroni-corrected) found that all three pairs of outcomes differ (p < 0.001)."
          />
          <NotebookFigure
            file="03_dropout_rates.png"
            section="statistics"
            caption="Share of students who dropped out, split by tuition status, scholarship, debt and gender (0 = No / Female, 1 = Yes / Male). Students who are behind on tuition drop out far more often."
          />
        </div>
      </section>
    </div>
  );
}
