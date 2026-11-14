import { useState, type ReactNode } from 'react';
import { useFigures } from '../api/hooks';
import type { ClassName, FigureInfo } from '../api/types';
import { Card, FigureCard, IframeModal, InfoBox, PageHeader, QueryState, Stat } from '../components';

/** One-line "how to read it" captions, keyed by figure file name. */
const SHAP_FIGURES: { file: string; caption: string }[] = [
  {
    file: '09_shap_bar.png',
    caption:
      'Longer bar = the feature matters more overall. Each colour shows how much of that importance goes to Dropout, Enrolled or Graduate.',
  },
  {
    file: '10_shap_beeswarm_dropout.png',
    caption:
      'Each dot is one student. Dots to the right push towards dropout, dots to the left push away. Red = high value of the feature, blue = low value.',
  },
  {
    file: '11_shap_beeswarm_graduate.png',
    caption:
      'Same idea for the Graduate class: dots to the right make graduating more likely. Red = high feature value, blue = low.',
  },
  {
    file: '12_shap_dependence.png',
    caption:
      'For the two most important features: the x-axis is the feature value, the y-axis is how much it pushes towards dropout. The colour shows a second feature that interacts with it.',
  },
];

const WATERFALL_CLASSES: ClassName[] = ['Dropout', 'Enrolled', 'Graduate'];

const WATERFALL_CAPTION =
  'Start at the average prediction at the bottom (E[f(x)]); each bar adds (red) or removes (blue) a bit until you reach this student’s score at the top (f(x)).';

const LIME_CAPTION =
  'Each bar is a simple rule about this student (for example “approved units ≤ 3”). Green bars support the class, red bars argue against it. Longer bar = stronger effect.';

/** Notebook cell 35 output: agreement between SHAP and LIME on 40 test students. */
const AGREEMENT = {
  students: 40,
  jaccardMean: 0.587,
  jaccardMin: 0.429,
  jaccardMax: 0.818,
  spearmanMean: 0.422,
  spearmanMin: 0.004,
  spearmanMax: 0.764,
};

interface ComparisonRow {
  aspect: string;
  shap: ReactNode;
  lime: ReactNode;
}

const COMPARISON: ComparisonRow[] = [
  {
    aspect: 'How it works',
    shap: 'Shares out the prediction fairly between the features, using an idea from game theory (Shapley values). All contributions add up to the model’s output.',
    lime: 'Makes thousands of slightly changed copies of one student, asks the model about each, and fits a simple straight-line model around that student.',
  },
  {
    aspect: 'Exact or approximate?',
    shap: 'Exact for tree models like XGBoost (TreeExplainer computes the true values).',
    lime: 'Approximate: the simple model only mimics the real model near this student.',
  },
  {
    aspect: 'Same answer every time?',
    shap: 'Yes, it is deterministic.',
    lime: 'Not by default: it uses random samples, so results can change between runs unless the random seed is fixed.',
  },
  {
    aspect: 'Global or local?',
    shap: 'Both: one student at a time, and averaged over all students for an overall picture.',
    lime: 'Local only: it explains one student at a time.',
  },
  {
    aspect: 'Which models?',
    shap: 'TreeExplainer is model-specific: it is built for tree models (other SHAP explainers exist for other models, but are slower).',
    lime: 'Model-agnostic: works with any model that gives probabilities.',
  },
  {
    aspect: 'Speed',
    shap: 'Very fast for tree models: thousands of students in seconds.',
    lime: 'Slower: thousands of model calls for every single student.',
  },
  {
    aspect: 'When to use it',
    shap: 'Default choice for tree models, and whenever you need the overall picture or consistent, repeatable numbers.',
    lime: 'When the model is a black box you cannot open, or as a second opinion that is easy to read as simple rules.',
  },
];

function findFigure(figs: FigureInfo[], file: string): FigureInfo | undefined {
  return figs.find((f) => f.file === file);
}

function ComparisonTable() {
  return (
    <div className="overflow-x-auto" role="region" aria-label="SHAP vs LIME comparison" tabIndex={0}>
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">SHAP compared with LIME, in plain words</caption>
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th scope="col" className="w-40 py-2 pr-4 font-semibold text-slate-900 dark:text-white">
              Question
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold text-slate-900 dark:text-white">
              SHAP
            </th>
            <th scope="col" className="py-2 font-semibold text-slate-900 dark:text-white">
              LIME
            </th>
          </tr>
        </thead>
        <tbody>
          {COMPARISON.map((row) => (
            <tr key={row.aspect} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
              <th scope="row" className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                {row.aspect}
              </th>
              <td className="py-3 pr-4 leading-relaxed text-slate-700 dark:text-slate-300">{row.shap}</td>
              <td className="py-3 leading-relaxed text-slate-700 dark:text-slate-300">{row.lime}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ExplainabilityPage() {
  const figures = useFigures('explainability');
  const [limeFigure, setLimeFigure] = useState<FigureInfo | null>(null);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Explainability"
        lede="Why does the model predict what it predicts? SHAP and LIME are two ways to see which student details push a prediction up or down."
      />

      <InfoBox>
        <p>
          These charts explain the final XGBoost model from the notebook (15 selected features, tested on 885 students it had
          never seen). <strong>SHAP</strong> shows how much each feature adds to or removes from a prediction.{' '}
          <strong>LIME</strong> explains one student at a time with simple rules. Click any image to enlarge it.
        </p>
      </InfoBox>

      <QueryState query={figures} loadingLabel="Loading figures…">
        {(figs) => (
          <>
            <section className="space-y-4" aria-labelledby="shap-heading">
              <h2 id="shap-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
                SHAP: the overall picture
              </h2>
              <div className="grid gap-6 lg:grid-cols-2">
                {SHAP_FIGURES.map(({ file, caption }) => {
                  const fig = findFigure(figs, file);
                  return fig ? <FigureCard key={file} figure={fig} caption={caption} /> : null;
                })}
              </div>
            </section>

            <section className="space-y-4" aria-labelledby="waterfall-heading">
              <h2 id="waterfall-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
                SHAP: three individual students
              </h2>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                One student confidently and correctly predicted as each class. Each chart explains the score for that class.
              </p>
              <div className="grid gap-6 lg:grid-cols-3">
                {WATERFALL_CLASSES.map((cls) => {
                  const fig = findFigure(figs, `13_shap_waterfall_${cls}.png`);
                  return fig ? <FigureCard key={fig.file} figure={fig} caption={WATERFALL_CAPTION} /> : null;
                })}
              </div>
            </section>

            <section className="space-y-4" aria-labelledby="lime-heading">
              <h2 id="lime-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
                LIME: the same three students
              </h2>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Each picture has an interactive version that also lists the student’s actual values.
              </p>
              <div className="grid gap-6 lg:grid-cols-3">
                {WATERFALL_CLASSES.map((cls) => {
                  const fig = findFigure(figs, `14_lime_${cls}.png`);
                  const html = findFigure(figs, `lime_${cls}.html`);
                  if (!fig) return null;
                  return (
                    <div key={fig.file} className="flex min-w-0 flex-col gap-3">
                      <FigureCard figure={fig} caption={LIME_CAPTION} className="flex-1" />
                      {html && (
                        <button
                          type="button"
                          onClick={() => setLimeFigure(html)}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Open interactive LIME ({cls})
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-4" aria-labelledby="agreement-heading">
              <h2 id="agreement-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
                Do SHAP and LIME agree?
              </h2>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat value={String(AGREEMENT.students)} label="Test students compared" />
                <Stat
                  value={AGREEMENT.jaccardMean.toFixed(3)}
                  label="Mean top-10 overlap (Jaccard)"
                  hint={`Range ${AGREEMENT.jaccardMin.toFixed(3)} – ${AGREEMENT.jaccardMax.toFixed(3)}`}
                />
                <Stat
                  value={AGREEMENT.spearmanMean.toFixed(3)}
                  label="Mean rank agreement (Spearman)"
                  hint={`Range ${AGREEMENT.spearmanMin.toFixed(3)} – ${AGREEMENT.spearmanMax.toFixed(3)}`}
                />
                <Stat value="Partly" label="Verdict" hint="Similar top features, different order" tone="muted" />
              </div>
              {(() => {
                const fig = findFigure(figs, '15_shap_vs_lime.png');
                return fig ? (
                  <FigureCard
                    figure={fig}
                    caption={
                      <>
                        Left: for each student, how many of the top-10 features both methods share (1 = the same ten, 0 = none in
                        common). Right: how similarly they rank all features (1 = same order, 0 = unrelated). On average they share
                        about {Math.round(AGREEMENT.jaccardMean * 100)}% of their top features (Jaccard {AGREEMENT.jaccardMean}),
                        but the order only loosely matches (Spearman {AGREEMENT.spearmanMean}).
                      </>
                    }
                  />
                ) : null;
              })()}
            </section>
          </>
        )}
      </QueryState>

      <section className="space-y-4" aria-labelledby="compare-heading">
        <h2 id="compare-heading" className="text-xl font-semibold text-slate-900 dark:text-white">
          SHAP vs LIME in plain words
        </h2>
        <Card>
          <ComparisonTable />
        </Card>
      </section>

      <IframeModal
        open={limeFigure !== null}
        onClose={() => setLimeFigure(null)}
        title={limeFigure?.title ?? ''}
        src={limeFigure?.url ?? ''}
      />
    </div>
  );
}
