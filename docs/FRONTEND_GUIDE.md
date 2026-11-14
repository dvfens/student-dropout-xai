# Frontend guide (for page agents)

The shell in `/frontend` is done: routing, layout, theme, API client/hooks and shared components.
Your job is to replace a stub in `src/pages/*.tsx` with real content. **Do not edit the shell files**
(`App.tsx`, `routes.ts`, `layout/`, `theme/`, `api/`, `components/`, `hooks/`, `lib/`) unless you must;
if you add something reusable, add it as a new file and mention it in your report.

Verify with `npx tsc --noEmit` / `npm run build` from `/frontend`. Never run the dev server on 5173;
if you need one, use `npx vite --port 518N` (N = your agent number) and kill it afterwards.

## Stack and layout

| Thing | Where |
| --- | --- |
| React 19 + TypeScript 7 (strict, `noUnusedLocals`, `verbatimModuleSyntax` → use `import type`) | |
| Tailwind CSS v4, class dark mode (`dark:` variants work; `<html class="dark">`) | `src/index.css` |
| Routes (lazy) | `src/routes.ts` → `src/pages/<Page>.tsx` (default export) |
| API base, fetch helpers, errors | `src/api/client.ts` |
| Response types for every endpoint | `src/api/types.ts` |
| TanStack Query hooks | `src/api/hooks.ts` |
| Shared components (barrel) | `src/components/index.ts` → `import { Card, DataTable } from '../components'` |
| Chart colours | `src/hooks/useChartTheme.ts` |
| Number formatting | `src/lib/format.ts` |

Pages: `/` Overview.tsx, `/statistics` Statistics.tsx, `/feature-selection` FeatureSelection.tsx,
`/models` ModelComparison.tsx, `/explainability` Explainability.tsx, `/fairness` Fairness.tsx,
`/staged` Staged.tsx, `/predict` Predict.tsx. Each must `export default function XxxPage()`.

## Page skeleton and styling conventions

```tsx
import { Card, FigureCard, InfoBox, PageHeader, QueryState } from '../components';
import { useFigures } from '../api/hooks';

export default function ExplainabilityPage() {
  const figures = useFigures('explainability');
  return (
    <div className="space-y-8">
      <PageHeader title="Explainability" lede="One or two plain sentences about the page." />
      <InfoBox>How to read the charts, in plain words.</InfoBox>
      <QueryState query={figures}>
        {(figs) => (
          <div className="grid gap-6 lg:grid-cols-2">
            {figs.map((f) => <FigureCard key={f.file} figure={f} caption="…" />)}
          </div>
        )}
      </QueryState>
    </div>
  );
}
```

- **Page wrapper:** `<div className="space-y-8">`. The layout already gives max width (`max-w-7xl`) and padding; do not add outer padding.
- **Headings:** `PageHeader` renders the only `<h1>`. `Card title` renders `<h2>` (use `headingLevel={3}` for cards nested under a section heading). For a section heading without a card: `<h2 className="text-xl font-semibold text-slate-900 dark:text-white">`.
- **Body text:** `text-slate-700 dark:text-slate-300`, muted `text-slate-600 dark:text-slate-400` (small text). Use `leading-relaxed` for paragraphs, `max-w-3xl` for long prose. Keep wording plain and short (the spec asks for simple language).
- **Spacing:** `space-y-8` between page sections, `gap-6` in grids of cards, `gap-4` in Stat rows, `space-y-4` inside cards.
- **Grids:** `grid gap-6 lg:grid-cols-2` for figures/cards; `grid grid-cols-2 gap-4 lg:grid-cols-4` for Stat rows. Always mobile-first (single column by default). Add `min-w-0` to grid children that contain charts/tables.
- **Surfaces:** put every content block in a `Card` (or `FigureCard`). Don't invent new border/shadow styles.
- **Accent colour:** indigo (`indigo-600` / dark `indigo-400`) for links, active states, primary buttons.
- **Primary button:** `rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400`.
- **Secondary button:** `rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`.
- **Form inputs:** `rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100`. Always pair with a `<label htmlFor>`.
- **Class colours (fixed, both themes):** Dropout `#E45756`, Enrolled `#F2CF5B`, Graduate `#54A24B`. Tailwind tokens: `bg-dropout`, `text-dropout`, `bg-enrolled`, `bg-graduate` (use for bars/dots; for text use the `Badge`/`Stat` tones, which have accessible contrast). Note the amber `#F2CF5B` has low contrast on white: never use it for text.
- **SHAP direction:** red (`chartTheme.positive`, `#E45756`) = pushes towards dropout; blue (`chartTheme.negative`) = pushes away.
- **Focus rings** are global (`:focus-visible` indigo outline). Don't remove outlines.
- **No horizontal page scroll at 375px.** Wide content (tables, wide charts) must scroll inside its own container. DataTable already does.
- **Numbers:** use `formatNumber`, `formatPercent`, `formatPValue` from `src/lib/format.ts` so every page agrees (3 decimals for metrics, 1 decimal for percentages, p < 0.001 in scientific notation).
- **Figures:** use the figure list from `useFigures(section)` and pick by `file` name, e.g. `figs.find(f => f.file === '09_shap_bar.png')`. Notebook PNGs have white backgrounds; FigureCard keeps a white frame in dark mode.

## API layer

### `src/api/client.ts`

| Export | Description |
| --- | --- |
| `API_BASE` | `import.meta.env.VITE_API_URL`, else `http://localhost:8000` in dev and the page's own origin (`""`) in production builds; no trailing slash. |
| `fetchJson<T>(path, init?)` | GET/any JSON request relative to `API_BASE`. Throws `ValidationError` on 422, `ApiError` otherwise (status 0 = network down). |
| `postJson<T>(path, body)` | POST JSON. |
| `ApiError` | `{ message, status, body }`. |
| `ValidationError extends ApiError` | `issues: { feature, msg }[]`, `byFeature(): Record<feature, msg>`. Handles both the contract shape and FastAPI's default `{loc,msg}` shape. |
| `isValidationError(err)` | Type guard. |
| `apiUrl(path)` | Prefix any API path with `API_BASE`. |
| `figureUrl(pathOrFile)` | `"/static/figures/x.png"` or `"x.png"` → absolute URL. |

### `src/api/hooks.ts`

| Hook | Returns | Notes |
| --- | --- | --- |
| `useMetadata()` | `UseQueryResult<MetadataResponse>` | features, stages, classes, sensitive_features, label_todo, `metrics` (model_metrics.json). Cached forever. |
| `useTable<Row>(name)` | `UseQueryResult<TableResponse<Row>>` | `name`: `statistical_tests`, `fairness_gaps`, `shap_group_differences`, `stage_fairness_gaps`, `stage_gap_changes`, `stage_blind_comparison`. |
| `useFigures(section?)` | `UseQueryResult<FigureInfo[]>` | `section`: `statistics`, `feature_selection`, `model_comparison`, `explainability`, `fairness`, `staged`. One request shared by all pages. |
| `useStageGroupMetrics()` | `UseQueryResult<StageGroupMetricsResponse>` | per stage × group TPR/FPR/AUC + CIs. |
| `useStageShapShares()` | `UseQueryResult<StageShapSharesResponse>` | shape documented in `docs/DEVIATIONS.md`; check real output. |
| `usePredict()` | `UseMutationResult<PredictResponse, ApiError, PredictRequest>` | `mutate({ stage, blind, features })`. |
| `useLime()` | `UseMutationResult<LimeResponse, ApiError, PredictRequest>` | slow (seconds): show `Loading`. |
| `useExample()` | `UseMutationResult<ExampleResponse, ApiError, ExampleParams>` | on demand: `mutateAsync({ cls: 'Graduate' })`, `{ cls: 'random' }`, `{ cls: 'Dropout', typical: false }`. Also `fetchExample(params)` (plain promise). |

```tsx
const predict = usePredict();
predict.mutate({ stage: 1, blind: false, features: values }, {
  onError: (err) => { if (isValidationError(err)) setFieldErrors(err.byFeature()); },
});
```

Typed table rows: declare an interface for the columns you use and pass it: `useTable<StatRow>('statistical_tests')`
where `interface StatRow extends Record<string, CellValue> { feature: string; p_value: number | null }`.
Check the real column names by opening the CSV at the repo root (NaN arrives as `null`).

### `src/api/types.ts`

`ClassName`, `CLASS_NAMES`, `StageId` (0|1|2), `STAGE_IDS`, `Feature` (= `NumericFeature | CodedFeature`,
discriminate on `feature.type === 'numeric'`), `FeatureOption`, `FeatureSection`, `FEATURE_SECTIONS` (display order),
`StageDefinition`, `MetadataResponse`, `ModelMetrics` (`metrics.stages['0'].aware.oof.dropout_auc`), `PredictRequest`,
`PredictResponse`, `ShapContribution`, `Reliability`, `LimeResponse`, `ExampleResponse`, `TableResponse`, `CellValue`,
`TableName`, `FigureInfo`, `FigureSection`, `StageGroupMetricsResponse`, `GroupMetric`, `StageShapSharesResponse`,
`ShapCategory`, `ValidationIssue`.

## Shared components (`import { … } from '../components'`)

### `PageHeader`
Props: `title: string`, `lede?: ReactNode`, `actions?: ReactNode`. Renders the page `<h1>` and sets `document.title`.
```tsx
<PageHeader title="Fairness" lede="Does the model make different mistakes for different groups?" />
```

### `Card`
Props: `title?`, `subtitle?`, `actions?` (right side of header), `headingLevel?: 2 | 3` (default 2), `flush?` (no body padding), `className?`, `children`.
```tsx
<Card title="Effect sizes" subtitle="Bigger bar = bigger difference" actions={<Badge>n = 4,424</Badge>}>…</Card>
```

### `InfoBox`
Props: `variant?: 'info' | 'warning'` (default info), `title?` (default "How to read this" / "Limitations"), `children`.
```tsx
<InfoBox variant="warning" title="How to read this / limitations"><ul className="list-disc pl-5">…</ul></InfoBox>
```

### `DataTable<Row>`
Props:
- `rows: Row[]` (`Row extends Record<string, CellValue>`, so a `TableResponse['rows']` works directly)
- `columns?: Array<key | ColumnDef<Row>>` (default: all keys of the first row, in order — pass `table.columns` to keep CSV order)
- `decimals?: number` (default 3), `searchable?` (default true), `searchPlaceholder?`
- `initialSort?: { key, direction: 'asc' | 'desc' }`, `caption?` (screen-reader caption; also labels the scroll region)
- `maxHeight?: string` (e.g. `'28rem'`, sticky header), `rowClassName?: (row) => string | undefined`, `emptyMessage?`

`ColumnDef<Row>`: `key`, `header?`, `format?: 'auto' | 'number' | 'pvalue' | 'percent' | 'boolean' | 'text'`, `decimals?`, `render?: (row) => ReactNode`, `align?`, `sortable?` (default true), `description?` (header tooltip).
Auto format: booleans (and "True"/"False" strings) → Yes/No badges; numbers in columns whose name looks like a p-value (`p`, `p_value`, `p-value`, `pvalue`, `p_adj`) → `formatPValue` (scientific below 0.001); other numbers → fixed decimals; nulls → "–". Sorting cycles asc → desc → off, nulls last; headers carry `aria-sort`.
```tsx
const q = useTable('statistical_tests');
<QueryState query={q}>
  {(t) => (
    <DataTable
      rows={t.rows}
      columns={t.columns}
      caption="Statistical tests per feature"
      initialSort={{ key: 'effect_size', direction: 'desc' }}
      rowClassName={(r) => (r.significant ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : undefined)}
    />
  )}
</QueryState>
```

### `FigureCard`
Props: `figure?: FigureInfo` **or** `src?: string` (file name or API path), `title?` (defaults to `figure.title`), `caption?: ReactNode`, `alt?: string`, `className?`. Click opens a full-size lightbox; a broken image shows a friendly message.
```tsx
<FigureCard src="06_critical_difference.png" title="Critical-difference diagram" caption="Models joined by a bar are not significantly different." />
```

### `Modal`
Props: `open`, `onClose`, `title: ReactNode`, `size?: 'md' | 'lg' | 'xl' | 'full'` (default lg), `bodyClassName?`, `children`. Focus trap, Esc, backdrop click, returns focus to the opener, locks page scroll. Rendered in a portal.

### `IframeModal`
Props: `open`, `onClose`, `title: string`, `src: string` (figure url like `/static/figures/lime_Dropout.html`, a file name, or absolute URL). Full-size iframe + "Open in a new tab" link.
```tsx
const [lime, setLime] = useState<FigureInfo | null>(null);
<button onClick={() => setLime(fig)}>Open interactive LIME</button>
<IframeModal open={lime !== null} onClose={() => setLime(null)} title={lime?.title ?? ''} src={lime?.url ?? ''} />
```

### `Tabs<Id>`
Props: `tabs: { id, label, content?, disabled? }[]`, `value?` (controlled) / `defaultValue?`, `onChange?(id)`, `ariaLabel: string`, `variant?: 'underline' | 'pills'` (pills = segmented control, good for stage selectors), `className?`. Roving tabindex, ←/→/Home/End. If you omit `content`, render your own panel below based on `value`.
```tsx
const [stage, setStage] = useState<'0' | '1' | '2'>('0');
<Tabs ariaLabel="Stage" variant="pills" value={stage} onChange={setStage}
  tabs={[{ id: '0', label: 'At enrollment' }, { id: '1', label: 'After semester 1' }, { id: '2', label: 'After semester 2' }]} />
```

### `Loading`, `ErrorState`, `QueryState`
- `Loading`: `label?` (default "Loading…").
- `ErrorState`: `error: unknown`, `title?`, `onRetry?`. A `ValidationError` with several issues is listed as bullets.
- `QueryState`: `query` (any `useQuery` result), `loadingLabel?`, `errorTitle?`, `children: (data) => ReactNode`. Use it around every query.

### `Badge`
Props: `variant?: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'dropout' | 'enrolled' | 'graduate'`, `children`. Helper `classBadgeVariant(cls)`.
```tsx
<Badge variant={classBadgeVariant(result.predicted_class)}>{result.predicted_class}</Badge>
<Badge variant={result.flagged_at_risk ? 'danger' : 'success'}>{result.flagged_at_risk ? 'At risk' : 'Not flagged'}</Badge>
```

### `Stat`
Props: `value: ReactNode` (pre-formatted), `label`, `hint?`, `tone?: 'default' | 'dropout' | 'enrolled' | 'graduate' | 'muted'`.
```tsx
<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
  <Stat value="4,424" label="Students" />
  <Stat value="32%" label="Dropout" tone="dropout" hint="1,421 students" />
</div>
```

## Charts: `useChartTheme()` (`src/hooks/useChartTheme.ts`)

Returns `{ isDark, text, mutedText, axis, grid, tooltipBg, tooltipBorder, tooltipText, cursor, classColors, positive, negative, primary, palette, tooltip: { contentStyle, labelStyle, itemStyle } }`. Also exports `CLASS_COLORS`.
Wrap charts in a sized div and `ResponsiveContainer`:
```tsx
const ct = useChartTheme();
<div className="h-72 min-w-0">
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
      <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" />
      <XAxis dataKey="name" stroke={ct.axis} tick={{ fill: ct.text, fontSize: 12 }} />
      <YAxis stroke={ct.axis} tick={{ fill: ct.text, fontSize: 12 }} />
      <Tooltip {...ct.tooltip} cursor={{ fill: ct.cursor }} />
      <Legend wrapperStyle={{ color: ct.text, fontSize: 12 }} />
      <Bar dataKey="value" fill={ct.primary} />
    </BarChart>
  </ResponsiveContainer>
</div>
```
Use `ct.classColors.Dropout` etc. for classes, `ct.palette[i]` for groups/series, `ct.positive`/`ct.negative` for SHAP signs. For long feature names on a vertical bar chart, use `layout="vertical"` with a `YAxis type="category" width={…}` and shorten labels on mobile. Give every chart a text alternative nearby (a sentence or a table) for screen readers.

## Theme

`useTheme()` from `src/theme/themeContext.ts` → `{ theme: 'light' | 'dark', setTheme, toggleTheme }`. The header already has the toggle; pages normally only need `useChartTheme()` or `dark:` classes.
