import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ClassName } from '../api/types';
import { Card, PageHeader, Stat } from '../components';
import { useChartTheme } from '../hooks/useChartTheme';
import { formatNumber } from '../lib/format';

/** Class balance: shares from notebook cell 3 output, counts from data.csv (they sum to 4,424). */
const CLASS_BALANCE: { cls: ClassName; share: number; count: number; meaning: string }[] = [
  { cls: 'Graduate', share: 49.9, count: 2209, meaning: 'finished the degree' },
  { cls: 'Dropout', share: 32.1, count: 1421, meaning: 'left without finishing' },
  { cls: 'Enrolled', share: 17.9, count: 794, meaning: 'still studying at the end of the normal course length' },
];

interface PipelineStep {
  title: string;
  detail: string;
  to?: string;
}

const PIPELINE: PipelineStep[] = [
  { title: 'Data cleaning', detail: 'Fix column names. No missing values, no duplicates.' },
  { title: 'Statistics', detail: 'Test each feature against the outcome.', to: '/statistics' },
  { title: 'Feature selection', detail: 'Three methods vote for the 15 most useful features.', to: '/feature-selection' },
  { title: 'Model comparison', detail: 'Five models compared with the Friedman test.', to: '/models' },
  { title: 'XGBoost', detail: 'The best model is used from here on.', to: '/models' },
  { title: 'SHAP & LIME', detail: 'Explain why the model predicts what it does.', to: '/explainability' },
  { title: 'Fairness audit', detail: 'Check mistakes and reasons by gender, age and nationality.', to: '/fairness' },
  { title: 'Staged early warning', detail: 'Predict at enrollment, after semester 1 and after semester 2.', to: '/staged' },
  { title: 'Live prediction app', detail: 'Enter a student and get a risk estimate with reasons.', to: '/predict' },
];

interface GlossaryEntry {
  term: string;
  text: string;
  to: string;
  page: string;
}

const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Friedman test',
    text: 'A test that checks whether several models really perform differently, or whether the differences are just luck. Each model is ranked on each round of testing, and the test asks if some models are ranked better again and again.',
    to: '/models',
    page: 'Model comparison',
  },
  {
    term: 'SHAP',
    text: 'A way to split one prediction into parts, one per feature. Each feature gets a number that says how much it pushed the risk up or down. The parts add up exactly to the prediction.',
    to: '/explainability',
    page: 'Explainability',
  },
  {
    term: 'LIME',
    text: 'Another way to explain one prediction. It makes many small changes to the student, watches how the prediction moves, and fits a simple straight-line model around that one student.',
    to: '/explainability',
    page: 'Explainability',
  },
  {
    term: 'Feature selection',
    text: 'Picking a smaller set of useful inputs (features) and leaving out the rest. Fewer inputs can make a model simpler and easier to explain.',
    to: '/feature-selection',
    page: 'Feature selection',
  },
  {
    term: 'Equal opportunity',
    text: 'A fairness idea: students who really drop out should have the same chance of being caught by the model, whatever their group (for example women and men).',
    to: '/fairness',
    page: 'Fairness',
  },
  {
    term: 'TPR and FPR',
    text: 'True positive rate (TPR): of the students who really dropped out, the share the model flagged. False positive rate (FPR): of the students who did not drop out, the share the model flagged by mistake.',
    to: '/fairness',
    page: 'Fairness',
  },
  {
    term: 'Effect size',
    text: 'How big a difference or link is, not just whether it exists. A large effect size means the feature is strongly related to the outcome.',
    to: '/statistics',
    page: 'Statistics',
  },
  {
    term: 'p-value',
    text: 'How surprising a result would be if there were really no link at all. A small p-value (below 0.05) means the link is unlikely to be pure chance.',
    to: '/statistics',
    page: 'Statistics',
  },
];

const PAGES: { to: string; title: string; text: string }[] = [
  { to: '/statistics', title: 'Statistics', text: 'Which features are linked to the outcome, and how strongly.' },
  { to: '/feature-selection', title: 'Feature selection', text: 'The 15 features that most methods agree on.' },
  { to: '/models', title: 'Model comparison', text: 'Five models compared fairly; XGBoost comes out on top.' },
  { to: '/explainability', title: 'Explainability', text: 'SHAP and LIME explanations of the model.' },
  { to: '/fairness', title: 'Fairness', text: 'Does the model make different mistakes for different groups?' },
  { to: '/staged', title: 'Staged early warning', text: 'How early can we spot students at risk?' },
  { to: '/predict', title: 'Predict', text: "Try it yourself: enter a student's details." },
];

function ClassBalanceChart() {
  const ct = useChartTheme();
  return (
    <div className="h-56 min-w-0" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={CLASS_BALANCE} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
          <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 60]}
            ticks={[0, 10, 20, 30, 40, 50, 60]}
            unit="%"
            stroke={ct.axis}
            tick={{ fill: ct.text, fontSize: 12 }}
          />
          <YAxis type="category" dataKey="cls" width={76} stroke={ct.axis} tick={{ fill: ct.text, fontSize: 13 }} />
          <Tooltip
            {...ct.tooltip}
            cursor={{ fill: ct.cursor }}
            formatter={(value, _name, item) => {
              const row = item.payload as (typeof CLASS_BALANCE)[number];
              return [`${value}% (${formatNumber(row.count)} students)`, 'Share'];
            }}
          />
          <Bar dataKey="share" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {CLASS_BALANCE.map((d) => (
              <Cell key={d.cls} fill={ct.classColors[d.cls]} />
            ))}
            <LabelList dataKey="share" position="right" formatter={(v) => `${String(v)}%`} fill={ct.text} fontSize={13} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 rotate-90 text-slate-400 md:rotate-0 dark:text-slate-500"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PipelineDiagram() {
  const boxClass =
    'flex h-full w-full flex-col rounded-lg border px-3 py-2 text-left md:w-44 border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60';
  return (
    <ol className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-stretch md:gap-y-4">
      {PIPELINE.map((step, i) => {
        const content = (
          <>
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Step {i + 1}</span>
            <span className="font-semibold text-slate-900 dark:text-white">{step.title}</span>
            <span className="mt-0.5 text-xs leading-snug text-slate-600 dark:text-slate-400">{step.detail}</span>
          </>
        );
        return (
          <li key={step.title} className="flex flex-col items-center gap-2 md:flex-row">
            {step.to ? (
              <Link
                to={step.to}
                className={`${boxClass} transition-colors hover:border-indigo-400 hover:bg-indigo-50 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40`}
              >
                {content}
              </Link>
            ) : (
              <div className={boxClass}>{content}</div>
            )}
            {i < PIPELINE.length - 1 && <ArrowIcon />}
          </li>
        );
      })}
    </ol>
  );
}

export default function OverviewPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        lede="Can we spot students who are likely to drop out, explain why, and check that the model treats groups fairly? This app shows the results of that project and lets you try the model."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat value="4,424" label="Students" hint="One row per student" />
        <Stat value="36" label="Features" hint="Facts known about each student" />
        <Stat value="3" label="Possible outcomes" hint="Dropout, Enrolled, Graduate" />
        <Stat value="0" label="Missing values" hint="And no duplicate rows" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="The dataset">
          <div className="space-y-3 leading-relaxed text-slate-700 dark:text-slate-300">
            <p>
              The data is the public{' '}
              <a
                href="https://archive.ics.uci.edu/dataset/697/predict+students+dropout+and+academic+success"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                UCI “Predict Students’ Dropout and Academic Success”
              </a>{' '}
              dataset. It comes from a higher-education institution in Portugal and describes 4,424 students.
            </p>
            <p>For each student we know 36 features, such as:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>personal details (age, gender, nationality, marital status),</li>
              <li>family background (parents’ education and jobs),</li>
              <li>how they applied and their earlier grades,</li>
              <li>money matters (tuition paid, scholarship, debts),</li>
              <li>results in the first and second semester,</li>
              <li>the economy when they started (unemployment, inflation, GDP).</li>
            </ul>
            <p>Each student ended in one of three outcomes: Dropout, Enrolled or Graduate.</p>
          </div>
        </Card>

        <Card title="Class balance" subtitle="Share of students with each outcome">
          <ClassBalanceChart />
          <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
            {CLASS_BALANCE.map((d) => (
              <li key={d.cls}>
                <span className="font-semibold">{d.cls}</span>: {d.share}% ({formatNumber(d.count)} students),{' '}
                {d.meaning}.
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            The groups are not the same size. That is why the models are scored with macro-F1, which gives each
            outcome equal weight.
          </p>
        </Card>
      </div>

      <Card title="Project pipeline" subtitle="The steps of the project, in order. Click a step to open its page.">
        <PipelineDiagram />
      </Card>

      <Card title="Glossary" subtitle="The key ideas in plain words">
        <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt className="font-semibold text-slate-900 dark:text-white">{g.term}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {g.text}{' '}
                <Link
                  to={g.to}
                  className="whitespace-nowrap font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  See {g.page}
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Explore the results</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PAGES.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500"
            >
              <span className="font-semibold text-slate-900 group-hover:text-indigo-700 dark:text-white dark:group-hover:text-indigo-300">
                {p.title} <span aria-hidden="true">→</span>
              </span>
              <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{p.text}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
