import { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFigures, useStageGroupMetrics, useStageShapShares, useTable } from '../api/hooks';
import type {
  CellValue,
  GroupAttribute,
  GroupMetric,
  ShapCategory,
  StageGroupMetricsResponse,
  StageShapSharesResponse,
} from '../api/types';
import {
  Badge,
  Card,
  DataTable,
  FigureCard,
  InfoBox,
  PageHeader,
  QueryState,
  Stat,
  Tabs,
  type ColumnDef,
} from '../components';
import { useChartTheme, type ChartTheme } from '../hooks/useChartTheme';
import { formatNumber, formatPercent } from '../lib/format';

/**
 * Recharts colours legend labels with the series colour, which fails contrast for light series.
 * Render the label in the theme text colour; the swatch next to it keeps the series colour.
 */
function legendText(color: string) {
  return function LegendLabel(value: string) {
    return <span style={{ color }}>{value}</span>;
  };
}

// ---------------------------------------------------------------- stage definitions

type StageTab = '0' | '1' | '2';

interface StageInfo {
  id: StageTab;
  label: string;
  /** Short label used in the result CSVs ("stage_short" / "stage" columns). */
  short: string;
  axis: string;
  newInfo: string;
}

const STAGES: StageInfo[] = [
  {
    id: '0',
    label: 'At enrollment',
    short: 'S0 enrollment',
    axis: 'S0',
    newInfo: 'Personal data, family background, application and prior education, scholarship, economy (22 features).',
  },
  {
    id: '1',
    label: 'After semester 1',
    short: 'S1 after sem 1',
    axis: 'S1',
    newInfo: 'Adds semester-1 results, debtor and tuition-fee status (30 features).',
  },
  {
    id: '2',
    label: 'After semester 2',
    short: 'S2 after sem 2',
    axis: 'S2',
    newInfo: 'Adds semester-2 results (all 36 features).',
  },
];

/**
 * Overall quality per stage (notebook cell 56): out-of-fold, top 30% highest-risk students flagged.
 */
const STAGE_QUALITY: Record<StageTab, { accuracy: number; macroF1: number; auc: number; recall: number; precision: number }> = {
  '0': { accuracy: 0.62, macroF1: 0.509, auc: 0.772, recall: 0.56, precision: 0.6 },
  '1': { accuracy: 0.75, macroF1: 0.668, auc: 0.906, recall: 0.742, precision: 0.795 },
  '2': { accuracy: 0.781, macroF1: 0.712, auc: 0.926, recall: 0.766, precision: 0.821 },
};

const ATTRIBUTES: GroupAttribute[] = ['Gender', 'Age group', 'Nationality'];

type GroupMetricKey = 'TPR' | 'FPR' | 'AUC';

const METRIC_INFO: Record<GroupMetricKey, { tab: string; axis: string; explain: string }> = {
  TPR: {
    tab: 'Recall (TPR)',
    axis: 'Share of real dropouts caught',
    explain: 'Of the students who really dropped out, the share the model flagged. Higher is better.',
  },
  FPR: {
    tab: 'False alarms (FPR)',
    axis: 'Share wrongly flagged',
    explain: 'Of the students who did not drop out, the share flagged anyway. Lower is better.',
  },
  AUC: {
    tab: 'Ranking quality (AUC)',
    axis: 'AUC within the group',
    explain: 'How well the model ranks dropouts above non-dropouts inside the group (0.5 = guessing, 1 = perfect).',
  },
};

const METRIC_LABELS: Record<string, string> = {
  flag_rate: 'Share flagged',
  TPR: 'Recall (TPR)',
  FPR: 'False alarms (FPR)',
  accuracy: 'Accuracy',
};

// ---------------------------------------------------------------- table row types

interface GapChangeRow extends Record<string, CellValue> {
  attribute: string;
  metric: string;
  gap_S0: number;
  gap_S1: number;
  gap_S2: number;
  change_S0_to_S2: number;
  change_CI_low: number;
  change_CI_high: number;
  real_change: boolean;
}

interface StageGapRow extends Record<string, CellValue> {
  attribute: string;
  metric: string;
  highest: string;
  lowest: string;
  gap: number;
  p_perm: number;
  p_FDR_all: number;
  sig: boolean;
  stage_short: string;
}

interface BlindRow extends Record<string, CellValue> {
  stage: string;
  variant: string;
  AUC: number;
  recall: number;
  'TPR gap | Gender': number;
  'TPR gap | Age group': number;
  'TPR gap | Nationality': number;
}

const GAP_CHANGE_COLUMNS: ColumnDef<GapChangeRow>[] = [
  { key: 'attribute', header: 'Attribute' },
  { key: 'metric', header: 'Measure', render: (r) => METRIC_LABELS[r.metric] ?? r.metric },
  { key: 'gap_S0', header: 'Gap S0', align: 'right' },
  { key: 'gap_S1', header: 'Gap S1', align: 'right' },
  { key: 'gap_S2', header: 'Gap S2', align: 'right' },
  {
    key: 'change_S0_to_S2',
    header: 'Change S0 → S2',
    align: 'right',
    render: (r) => (r.change_S0_to_S2 > 0 ? '+' : '') + formatNumber(r.change_S0_to_S2),
  },
  {
    key: 'change_CI_low',
    header: '95% interval of the change',
    sortable: false,
    render: (r) => `${formatNumber(r.change_CI_low)} to ${formatNumber(r.change_CI_high)}`,
  },
  {
    key: 'real_change',
    header: 'Real change?',
    description: 'Yes when the 95% interval does not include 0',
    render: (r) => <Badge variant={r.real_change ? 'success' : 'neutral'}>{r.real_change ? 'Yes' : 'No'}</Badge>,
  },
];

const STAGE_GAP_COLUMNS: ColumnDef<StageGapRow>[] = [
  { key: 'attribute', header: 'Attribute' },
  { key: 'metric', header: 'Measure', render: (r) => METRIC_LABELS[r.metric] ?? r.metric },
  { key: 'highest', header: 'Highest group' },
  { key: 'lowest', header: 'Lowest group' },
  { key: 'gap', header: 'Gap', format: 'percent', decimals: 1, align: 'right' },
  { key: 'p_FDR_all', header: 'p (corrected)', format: 'pvalue', align: 'right', description: 'FDR-corrected across all stages' },
  {
    key: 'sig',
    header: 'Real gap?',
    render: (r) => <Badge variant={r.sig ? 'danger' : 'neutral'}>{r.sig ? 'Yes' : 'No'}</Badge>,
  },
];

// ---------------------------------------------------------------- group line chart

interface LinePoint {
  stage: string;
  [key: string]: string | number | [number, number] | null;
}

function buildLineData(
  data: StageGroupMetricsResponse,
  attribute: GroupAttribute,
  metric: GroupMetricKey,
): { points: LinePoint[]; groups: GroupMetric[] } {
  const ordered = [...data.stages].sort((a, b) => a.stage - b.stage);
  const groups = ordered[0]?.groups.filter((g) => g.attribute === attribute) ?? [];
  const points = ordered.map((s) => {
    const point: LinePoint = { stage: STAGES[s.stage]?.axis ?? s.label };
    groups.forEach((g0, i) => {
      const g = s.groups.find((x) => x.attribute === attribute && x.group === g0.group);
      const lo = g?.[`${metric}_lo`];
      const hi = g?.[`${metric}_hi`];
      point[`v${i}`] = g?.[metric] ?? null;
      point[`band${i}`] = lo != null && hi != null ? [lo, hi] : null;
    });
    return point;
  });
  return { points, groups };
}

interface GroupTooltipProps {
  active?: boolean;
  label?: string | number;
  data: StageGroupMetricsResponse;
  attribute: GroupAttribute;
  metric: GroupMetricKey;
  ct: ChartTheme;
}

function GroupTooltip({ active, label, data, attribute, metric, ct }: GroupTooltipProps) {
  if (!active || label === undefined) return null;
  const stageIdx = STAGES.findIndex((s) => s.axis === label);
  const entry = data.stages.find((s) => s.stage === stageIdx);
  if (!entry) return null;
  const rows = entry.groups.filter((g) => g.attribute === attribute);
  return (
    <div style={ct.tooltip.contentStyle} className="max-w-xs text-xs">
      <p style={ct.tooltip.labelStyle} className="mb-1 font-semibold">
        {STAGES[stageIdx]?.label} ({label})
      </p>
      <ul className="space-y-1">
        {rows.map((g, i) => (
          <li key={g.group} className="flex items-baseline gap-2">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: ct.palette[i] }} aria-hidden="true" />
            <span>
              <strong>{g.group}</strong>: {formatNumber(g[metric])}{' '}
              <span style={{ color: ct.mutedText }}>
                (95% CI {formatNumber(g[`${metric}_lo`])}–{formatNumber(g[`${metric}_hi`])}, n = {formatNumber(g.n)})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GroupLineChart({ data, stage }: { data: StageGroupMetricsResponse; stage: StageInfo }) {
  const ct = useChartTheme();
  const [attribute, setAttribute] = useState<GroupAttribute>('Gender');
  const [metric, setMetric] = useState<GroupMetricKey>('TPR');
  const [showBands, setShowBands] = useState(true);
  const { points, groups } = useMemo(() => buildLineData(data, attribute, metric), [data, attribute, metric]);
  const selectedEntry = data.stages.find((s) => s.stage === Number(stage.id));
  const selectedGroups = selectedEntry?.groups.filter((g) => g.attribute === attribute) ?? [];

  return (
    <Card
      title="How each group is treated as information arrives"
      subtitle={METRIC_INFO[metric].explain}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            ariaLabel="Group attribute"
            variant="pills"
            value={attribute}
            onChange={setAttribute}
            tabs={ATTRIBUTES.map((a) => ({ id: a, label: a }))}
          />
          <Tabs
            ariaLabel="Measure"
            variant="pills"
            value={metric}
            onChange={setMetric}
            tabs={(Object.keys(METRIC_INFO) as GroupMetricKey[]).map((m) => ({ id: m, label: METRIC_INFO[m].tab }))}
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showBands}
            onChange={(e) => setShowBands(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 dark:border-slate-600"
          />
          Show 95% confidence bands
        </label>
        <div className="h-80 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" />
              <XAxis dataKey="stage" stroke={ct.axis} tick={{ fill: ct.text, fontSize: 12 }} padding={{ left: 24, right: 24 }} />
              <YAxis
                stroke={ct.axis}
                tick={{ fill: ct.text, fontSize: 12 }}
                domain={[0, 1]}
                width={44}
                label={{ value: METRIC_INFO[metric].axis, angle: -90, position: 'insideLeft', fill: ct.mutedText, fontSize: 11, dy: 70, dx: 8 }}
              />
              <ReferenceLine x={stage.axis} stroke={ct.primary} strokeDasharray="4 4" />
              <Tooltip
                cursor={{ stroke: ct.axis }}
                content={({ active, label }) => (
                  <GroupTooltip
                    active={active}
                    label={label as string | number | undefined}
                    data={data}
                    attribute={attribute}
                    metric={metric}
                    ct={ct}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText(ct.text)} itemSorter="dataKey" />
              {showBands &&
                groups.map((g, i) => (
                  <Area
                    key={`band-${g.group}`}
                    dataKey={`band${i}`}
                    stroke="none"
                    fill={ct.palette[i]}
                    fillOpacity={0.15}
                    legendType="none"
                    isAnimationActive={false}
                    activeDot={false}
                  />
                ))}
              {groups.map((g, i) => (
                <Line
                  key={g.group}
                  dataKey={`v${i}`}
                  name={`${g.group} (n=${formatNumber(g.n)})`}
                  stroke={ct.palette[i]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {stage.label} ({stage.axis}, dashed line):{' '}
          {selectedGroups.map((g) => `${g.group} ${formatNumber(g[metric])}`).join(', ')}. Values are recomputed by the
          backend from the same procedure as the notebook, so they can differ from the notebook figure by up to about 0.03 in
          small groups.
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- SHAP shares chart

const CATEGORY_COLORS = ['#4C78A8', '#9D755D', '#72B7B2', '#BAB0AC', '#F58518', '#E45756', '#B279A2'];

function ShapSharesChart({ data, stage }: { data: StageShapSharesResponse; stage: StageInfo }) {
  const ct = useChartTheme();
  const rows = [...data.stages]
    .sort((a, b) => a.stage - b.stage)
    .map((s) => ({ stage: STAGES[s.stage]?.axis ?? s.label, ...s.category_shares }));
  const selected = data.stages.find((s) => s.stage === Number(stage.id));

  return (
    <Card title="What the model bases its decisions on" subtitle="Share of the model’s total SHAP importance (Dropout class) per feature family.">
      <div className="space-y-4">
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 1]}
                tickFormatter={(v: number) => formatPercent(v, 0)}
                stroke={ct.axis}
                tick={{ fill: ct.text, fontSize: 12 }}
              />
              <YAxis type="category" dataKey="stage" stroke={ct.axis} tick={{ fill: ct.text, fontSize: 12 }} width={36} />
              <Tooltip
                {...ct.tooltip}
                cursor={{ fill: ct.cursor }}
                formatter={(value) => formatPercent(typeof value === 'number' ? value : Number(value))}
              />
              <Legend
                wrapperStyle={{ fontSize: 12 }}
                formatter={legendText(ct.text)}
                itemSorter={(item) => data.categories.indexOf(String(item.dataKey) as ShapCategory)}
              />
              {data.categories.map((c, i) => (
                <Bar key={c} dataKey={c} stackId="share" fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {selected && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Sensitive attributes at {stage.axis}: {formatPercent(selected.all_sensitive)}
              </p>
              <ul className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {Object.entries(selected.sensitive_shares).map(([f, v]) => (
                  <li key={f}>
                    {f}: {formatPercent(v)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Top 5 features at {stage.axis}</p>
              <ol className="mt-1 list-decimal pl-5 text-sm text-slate-700 dark:text-slate-300">
                {selected.top_features.slice(0, 5).map((f) => (
                  <li key={f.feature}>
                    {f.feature} ({formatPercent(f.share, 0)})
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- blind vs aware chart

const BLIND_LABELS: Record<string, string> = {
  'with sensitive attributes': 'With sensitive attributes',
  'without sensitive attributes': 'Without sensitive attributes',
};

function BlindComparison({ rows, stage }: { rows: BlindRow[]; stage: StageInfo }) {
  const ct = useChartTheme();
  const aware = rows.find((r) => r.stage === stage.short && r.variant === 'with sensitive attributes');
  const blind = rows.find((r) => r.stage === stage.short && r.variant === 'without sensitive attributes');
  if (!aware || !blind) return <p className="text-sm text-slate-600 dark:text-slate-400">No data for this stage.</p>;
  const chartData = ATTRIBUTES.map((a) => {
    const key = `TPR gap | ${a}` as const;
    return { attribute: a, aware: aware[key], blind: blind[key] };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat value={formatNumber(aware.AUC)} label="AUC with sensitive attributes" />
        <Stat value={formatNumber(blind.AUC)} label="AUC without" hint={`Change ${formatNumber(blind.AUC - aware.AUC)}`} />
        <Stat value={formatPercent(aware.recall)} label="Dropouts caught, with" />
        <Stat value={formatPercent(blind.recall)} label="Dropouts caught, without" />
      </div>
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="attribute" stroke={ct.axis} tick={{ fill: ct.text, fontSize: 12 }} />
            <YAxis stroke={ct.axis} tick={{ fill: ct.text, fontSize: 12 }} width={44} domain={[0, 'auto']} />
            <Tooltip {...ct.tooltip} cursor={{ fill: ct.cursor }} formatter={(v) => formatNumber(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText(ct.text)} />
            <Bar dataKey="aware" name={BLIND_LABELS['with sensitive attributes']} fill="#E45756" isAnimationActive={false} />
            <Bar dataKey="blind" name={BLIND_LABELS['without sensitive attributes']} fill="#4C78A8" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Bars show the largest recall gap between groups at stage {stage.axis} (lower = fairer):{' '}
        {chartData.map((d) => `${d.attribute} ${formatNumber(d.aware)} → ${formatNumber(d.blind)}`).join(', ')}.
      </p>
    </div>
  );
}

const BLIND_TABLE_COLUMNS: ColumnDef<BlindRow>[] = [
  { key: 'stage', header: 'Stage' },
  { key: 'variant', header: 'Model', render: (r) => BLIND_LABELS[r.variant] ?? r.variant },
  { key: 'AUC', header: 'AUC', align: 'right' },
  { key: 'recall', header: 'Dropouts caught', format: 'percent', decimals: 1, align: 'right' },
  { key: 'TPR gap | Gender', header: 'Recall gap: gender', align: 'right' },
  { key: 'TPR gap | Age group', header: 'Recall gap: age', align: 'right' },
  { key: 'TPR gap | Nationality', header: 'Recall gap: nationality', align: 'right' },
];

// ---------------------------------------------------------------- page

/** Takeaway sentence on the sensitive SHAP share, read from the served artifact (notebook values as fallback). */
function describeSensitiveShares(data: StageShapSharesResponse | undefined): string {
  const share = (stage: number, fallback: number) =>
    formatPercent(data?.stages.find((s) => s.stage === stage)?.all_sensitive ?? fallback);
  return (
    `About ${share(0, 0.297)} of its reasoning comes from age, gender, nationality and international status, ` +
    `against ${share(1, 0.112)} after semester 1 and ${share(2, 0.089)} after semester 2` +
    (data ? ' (served models; the notebook reported 29.7%, 11.2% and 8.9%).' : '.')
  );
}

export default function StagedPage() {
  const [stageId, setStageId] = useState<StageTab>('0');
  const stage = STAGES.find((s) => s.id === stageId) ?? STAGES[0];
  const quality = STAGE_QUALITY[stageId];

  const groupMetrics = useStageGroupMetrics();
  const shapShares = useStageShapShares();
  const gapChanges = useTable<GapChangeRow>('stage_gap_changes');
  const stageGaps = useTable<StageGapRow>('stage_fairness_gaps');
  const blind = useTable<BlindRow>('stage_blind_comparison');
  const figures = useFigures('staged');
  const fig24 = figures.data?.find((f) => f.file === '24_stage_shap_shares.png');
  const fig25 = figures.data?.find((f) => f.file === '25_stage_blind_gaps.png');
  const sensitiveShareText = describeSensitiveShares(shapShares.data);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Staged early warning"
        lede="A real warning system has to act early. The model is rebuilt three times, each time using only what the university knows at that moment."
      />

      <InfoBox title="Key takeaways">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Gaps shrink a lot once grades arrive.</strong> The gender recall gap falls from 0.268 at enrollment to 0.089
            after semester 1 (0.059 after semester 2); the age gap from 0.642 to 0.292 (0.249).
          </li>
          <li>
            <strong>At enrollment the model leans on who students are.</strong> {sensitiveShareText}
          </li>
          <li>
            <strong>Removing sensitive attributes helps most at enrollment</strong>, at a small cost: the gender recall gap drops
            from 0.268 to 0.112 and the age gap from 0.642 to 0.504, while AUC falls only from 0.772 to 0.763.
          </li>
          <li>
            At every stage the top 30% highest-risk students are flagged (a fixed support capacity), so the stages are compared
            fairly.
          </li>
        </ul>
      </InfoBox>

      <div className="space-y-4">
        <Tabs
          ariaLabel="Stage"
          variant="pills"
          value={stageId}
          onChange={setStageId}
          tabs={STAGES.map((s) => ({ id: s.id, label: `${s.axis} · ${s.label}` }))}
        />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          <strong className="text-slate-900 dark:text-white">{stage.label}:</strong> {stage.newInfo}
        </p>
      </div>

      <section className="space-y-4" aria-labelledby="quality-heading">
        <h2 id="quality-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
          Overall quality {stage.label.toLowerCase()}
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat value={formatNumber(quality.auc)} label="Dropout AUC" hint="Ranking quality (0.5 = guessing, 1 = perfect)" />
          <Stat value={formatPercent(quality.recall)} label="Dropouts caught (recall)" hint="Among the top 30% flagged" tone="dropout" />
          <Stat value={formatPercent(quality.precision)} label="Precision" hint="Flagged students who really dropped out" />
          <Stat value={formatNumber(quality.macroF1)} label="Macro-F1 (3 classes)" hint={`Accuracy ${formatPercent(quality.accuracy)}`} />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Out-of-fold results for all 4,424 students (notebook section 10.2).</p>
        {stageId === '0' && (
          <InfoBox variant="warning" title="Enrollment predictions are weak">
            At enrollment the model catches only 56% of dropouts and 40% of flagged students would not have dropped out. Treat
            these flags as a rough first signal.
          </InfoBox>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="groups-heading">
        <h2 id="groups-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
          Recall, false alarms and AUC by group
        </h2>
        <QueryState query={groupMetrics} loadingLabel="Loading group metrics…">
          {(data) => <GroupLineChart data={data} stage={stage} />}
        </QueryState>
      </section>

      <section className="space-y-4" aria-labelledby="gapchange-heading">
        <h2 id="gapchange-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
          Do the gaps between groups shrink?
        </h2>
        <Card subtitle="Largest gap between groups at each stage, and whether the change from S0 to S2 is real (bootstrap 95% interval excludes 0). Highlighted rows changed for real.">
          <QueryState query={gapChanges} loadingLabel="Loading table…">
            {(t) => (
              <DataTable
                rows={t.rows}
                columns={GAP_CHANGE_COLUMNS}
                searchable={false}
                caption="Change in group gaps from S0 to S2"
                rowClassName={(r) => (r.real_change ? 'bg-emerald-50 dark:bg-emerald-950/30' : undefined)}
              />
            )}
          </QueryState>
        </Card>
        <Card
          title={`Gap tests ${stage.label.toLowerCase()}`}
          subtitle="Permutation test of the largest gap, corrected across all stages. Highlighted rows are real gaps."
          headingLevel={3}
        >
          <QueryState query={stageGaps} loadingLabel="Loading table…">
            {(t) => (
              <DataTable
                rows={t.rows.filter((r) => r.stage_short === stage.short)}
                columns={STAGE_GAP_COLUMNS}
                searchable={false}
                caption={`Fairness gap tests, ${stage.label}`}
                rowClassName={(r) => (r.sig ? 'bg-rose-50 dark:bg-rose-950/30' : undefined)}
              />
            )}
          </QueryState>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Only 110 students are non-Portuguese, so nationality gaps are noisy.
          </p>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="shap-heading">
        <h2 id="shap-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
          How the reasons change
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <QueryState query={shapShares} loadingLabel="Loading SHAP shares…">
              {(data) => <ShapSharesChart data={data} stage={stage} />}
            </QueryState>
          </div>
          {fig24 && (
            <FigureCard
              figure={fig24}
              caption="The notebook version. Left: personal and application details dominate at enrollment; semester results take over later. Right: the share carried by sensitive attributes drops from 29.7% to 11.2% and 8.9%."
            />
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The interactive chart is recomputed by the backend and can differ slightly from the notebook figure.
        </p>
      </section>

      <section className="space-y-4" aria-labelledby="blind-heading">
        <h2 id="blind-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
          With vs without sensitive attributes
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={`Recall gaps ${stage.label.toLowerCase()}`} headingLevel={3} className="min-w-0">
            <QueryState query={blind} loadingLabel="Loading comparison…">
              {(t) => <BlindComparison rows={t.rows} stage={stage} />}
            </QueryState>
          </Card>
          {fig25 && (
            <FigureCard
              figure={fig25}
              caption="Red = model with age, gender, nationality and international status; blue dashed = without them. Removing them narrows the gender and age gaps most at enrollment. The nationality gap even grows after semester 1 (0.040 → 0.106), but that group is very small."
            />
          )}
        </div>
        <Card title="All stages" headingLevel={3}>
          <QueryState query={blind} loadingLabel="Loading table…">
            {(t) => (
              <DataTable rows={t.rows} columns={BLIND_TABLE_COLUMNS} searchable={false} caption="Blind vs aware models at each stage" />
            )}
          </QueryState>
        </Card>
      </section>
    </div>
  );
}
