import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Badge, Card, InfoBox, PageHeader, Stat } from '../components';
import { formatNumber } from '../lib/format';
import { NotebookFigure } from './analysis/NotebookFigure';

type MethodId = 'filter' | 'embedded' | 'wrapper';

const METHODS: { id: MethodId; name: string; short: string; how: string; analogy: string }[] = [
  {
    id: 'filter',
    name: 'Filter: mutual information',
    short: 'Filter (MI)',
    how: 'Scores each feature on its own by how much it tells us about the outcome, without training any model. Fast and simple.',
    analogy: 'Like judging each player on their own stats.',
  },
  {
    id: 'embedded',
    name: 'Embedded: random forest importance',
    short: 'Embedded (RF)',
    how: 'Trains a random forest and keeps the features the forest relied on most. The choice happens while the model learns.',
    analogy: 'Like watching a team play and noting who touches the ball most.',
  },
  {
    id: 'wrapper',
    name: 'Wrapper: recursive feature elimination',
    short: 'Wrapper (RFE-LR)',
    how: 'Trains a logistic regression, drops the weakest features, and repeats until 15 are left.',
    analogy: 'Like cutting the weakest players from a squad, round after round.',
  },
];

/** Votes from notebook cell 11 (also shown in figure 04). */
const VOTES: { feature: string; methods: MethodId[] }[] = [
  { feature: 'Course', methods: ['filter', 'embedded', 'wrapper'] },
  { feature: 'Curricular units 2nd sem (grade)', methods: ['filter', 'embedded', 'wrapper'] },
  { feature: 'Age at enrollment', methods: ['filter', 'embedded', 'wrapper'] },
  { feature: 'Tuition fees up to date', methods: ['filter', 'embedded', 'wrapper'] },
  { feature: 'Curricular units 2nd sem (evaluations)', methods: ['filter', 'embedded', 'wrapper'] },
  { feature: 'Curricular units 2nd sem (approved)', methods: ['filter', 'embedded', 'wrapper'] },
  { feature: 'Curricular units 1st sem (approved)', methods: ['filter', 'embedded', 'wrapper'] },
  { feature: 'Curricular units 1st sem (evaluations)', methods: ['filter', 'embedded'] },
  { feature: 'Curricular units 1st sem (enrolled)', methods: ['filter', 'wrapper'] },
  { feature: 'Curricular units 1st sem (grade)', methods: ['filter', 'embedded'] },
  { feature: 'Previous qualification (grade)', methods: ['filter', 'embedded'] },
  { feature: "Mother's occupation", methods: ['embedded', 'wrapper'] },
  { feature: 'Scholarship holder', methods: ['filter', 'wrapper'] },
  { feature: 'Admission grade', methods: ['filter', 'embedded'] },
  { feature: 'Curricular units 2nd sem (enrolled)', methods: ['filter', 'wrapper'] },
];

/** Features picked by only one method (figure 04). */
const SINGLE_VOTES: { feature: string; method: MethodId }[] = [
  { feature: 'Application mode', method: 'filter' },
  { feature: 'Unemployment rate', method: 'embedded' },
  { feature: "Father's occupation", method: 'embedded' },
  { feature: 'GDP', method: 'embedded' },
  { feature: 'Curricular units 2nd sem (credited)', method: 'wrapper' },
  { feature: 'Curricular units 1st sem (credited)', method: 'wrapper' },
  { feature: 'Debtor', method: 'wrapper' },
  { feature: 'International', method: 'wrapper' },
];

/** Notebook cell 18: XGBoost macro-F1 over 10 CV folds for each feature set. */
const FEATURE_SET_SCORES: { name: string; mean: number; std: number; vsAllP: number | null }[] = [
  { name: 'All 36 features', mean: 0.7126, std: 0.0122, vsAllP: null },
  { name: 'Filter MI (15 features)', mean: 0.7008, std: 0.0123, vsAllP: 0.029 },
  { name: 'Embedded RF (15 features)', mean: 0.7021, std: 0.0124, vsAllP: 0.11 },
  { name: 'Wrapper RFE (15 features)', mean: 0.7038, std: 0.0106, vsAllP: 0.226 },
];

const METHOD_SHORT: Record<MethodId, string> = { filter: 'Filter', embedded: 'Embedded', wrapper: 'Wrapper' };

function MethodChips({ methods }: { methods: MethodId[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {(['filter', 'embedded', 'wrapper'] as const).map((m) => {
        const on = methods.includes(m);
        return (
          <span
            key={m}
            className={clsx(
              'rounded px-1.5 py-0.5 text-xs font-medium',
              on
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
                : 'bg-slate-100 text-slate-600 line-through dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            <span className="sr-only">{on ? 'chosen by ' : 'not chosen by '}</span>
            {METHOD_SHORT[m]}
          </span>
        );
      })}
    </span>
  );
}

export default function FeatureSelectionPage() {
  const unanimous = VOTES.filter((v) => v.methods.length === 3);
  const twoVotes = VOTES.filter((v) => v.methods.length === 2);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Feature selection"
        lede="Do we need all 36 features? Three different methods each picked the 15 features they found most useful. Features picked by at least two methods form the consensus set."
      />

      <div className="grid gap-6 md:grid-cols-3">
        {METHODS.map((m) => (
          <Card key={m.id} title={m.name} headingLevel={3}>
            <div className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              <p>{m.how}</p>
              <p className="text-slate-600 italic dark:text-slate-400">{m.analogy}</p>
            </div>
          </Card>
        ))}
      </div>

      <InfoBox title="Fair play">
        Each method chose exactly 15 features (k = 15). To avoid “peeking” at the test data, the selection was done
        on the training part of the data only (80% of students).
      </InfoBox>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="The 15 consensus features"
          subtitle="Chosen by at least 2 of the 3 methods"
          actions={<Badge variant="info">15 of 36</Badge>}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Stat value={unanimous.length} label="Chosen by all 3 methods" />
              <Stat value={twoVotes.length} label="Chosen by 2 methods" />
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {VOTES.map((v) => (
                <li key={v.feature} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge variant={v.methods.length === 3 ? 'success' : 'neutral'}>
                      {v.methods.length} votes
                    </Badge>
                    <span className="font-medium text-slate-900 dark:text-white">{v.feature}</span>
                  </span>
                  <MethodChips methods={v.methods} />
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Picked by only one method (left out):{' '}
              {SINGLE_VOTES.map((s) => `${s.feature} (${METHOD_SHORT[s.method]})`).join(', ')}.
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Semester results, tuition status, course and age come up again and again. The final XGBoost model in the
              notebook uses these 15 features (see{' '}
              <Link
                to="/models"
                className="font-medium text-indigo-700 underline underline-offset-2 dark:text-indigo-400"
              >
                Model comparison
              </Link>
              ).
            </p>
          </div>
        </Card>

        <div className="min-w-0 lg:col-span-2">
          <NotebookFigure
            file="04_feature_selection_votes.png"
            section="feature_selection"
            caption="Each row is a feature, each column a method. 1 (dark blue) = the method chose that feature. Features no method chose are not shown."
          />
        </div>
      </div>

      <Card
        title="Does using fewer features hurt the model?"
        subtitle="XGBoost scored with each feature set over 10 rounds of cross-validation (macro-F1, higher is better)"
      >
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <caption className="sr-only">Macro-F1 of XGBoost with each feature set</caption>
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr className="text-slate-700 dark:text-slate-200">
                  <th scope="col" className="px-3 py-2 text-left font-semibold">Feature set</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Mean macro-F1</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Spread (std)</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                    p vs all 36 (Nemenyi)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {FEATURE_SET_SCORES.map((s) => (
                  <tr key={s.name} className="text-slate-700 dark:text-slate-300">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{s.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(s.mean, 4)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(s.std, 4)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.vsAllP === null ? '–' : (
                        <span className="inline-flex items-center gap-2">
                          {formatNumber(s.vsAllP, 3)}
                          {s.vsAllP < 0.05 && <Badge variant="warning">significant</Badge>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="leading-relaxed text-slate-700 dark:text-slate-300">
            A second Friedman test found a difference between the feature sets (chi-square = 8.76, p = 0.033). The
            follow-up test shows that only one pair really differs: using all 36 features is slightly but significantly
            better than the filter set. The other 15-feature sets are not significantly worse than using everything.
            In plain words: dropping 21 features costs only about 0.01 in macro-F1.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            The box plot of these scores (figure 07) is on the{' '}
            <Link to="/models" className="font-medium text-indigo-700 underline underline-offset-2 dark:text-indigo-400">
              Model comparison
            </Link>{' '}
            page.
          </p>
        </div>
      </Card>
    </div>
  );
}
