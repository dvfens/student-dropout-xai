/**
 * Shorter feature names for chart axes on small screens.
 * "Curricular units 2nd sem (approved)" -> "Sem 2: approved".
 */
export function shortFeatureLabel(name: string): string {
  const sem = /^Curricular units (1st|2nd) sem \((.+)\)$/.exec(name);
  if (sem) {
    const what = sem[2] === 'without evaluations' ? 'no evals' : sem[2];
    return `Sem ${sem[1] === '1st' ? 1 : 2}: ${what}`;
  }
  const replacements: Record<string, string> = {
    'Tuition fees up to date': 'Tuition paid',
    'Previous qualification (grade)': 'Prev. qual. grade',
    'Previous qualification': 'Prev. qualification',
    'Daytime/evening attendance': 'Day/evening',
    'Educational special needs': 'Special needs',
    "Mother's qualification": "Mother's qual.",
    "Father's qualification": "Father's qual.",
    "Mother's occupation": "Mother's job",
    "Father's occupation": "Father's job",
    'Age at enrollment': 'Age',
    'Scholarship holder': 'Scholarship',
  };
  return replacements[name] ?? name;
}
