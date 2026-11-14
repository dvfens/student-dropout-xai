/**
 * Turns SHAP contributions into short plain-language sentences, using only the
 * metadata (type, median, options, section) and the contribution itself.
 */
import type { Feature, ShapContribution } from '../../api/types';
import { formatPlain, isNumeric } from './formModel';

/** Label without a trailing unit such as " (%)", for use inside a sentence. */
function sentenceLabel(label: string): string {
  return label.replace(/\s*\(%\)\s*$/, '');
}

/** Lower-case the first letter, but leave acronyms such as "GDP" alone. */
function lowerFirst(text: string): string {
  if (text.length === 0 || /^[A-Z]{2}/.test(text)) return text;
  return text[0].toLowerCase() + text.slice(1);
}

function upperFirst(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

/** "strongly raises", "raises" or "slightly raises", based on the size of the log-odds push. */
function effectPhrase(c: ShapContribution): string {
  const verb = c.direction === 'increases' ? 'raises' : 'lowers';
  const size = Math.abs(c.shap);
  if (size >= 0.5) return `strongly ${verb}`;
  if (size < 0.1) return `slightly ${verb}`;
  return verb;
}

/** Plain-language sentence for one contribution. */
export function contributionSentence(c: ShapContribution, feature: Feature | undefined): string {
  const effect = `${effectPhrase(c)} the dropout risk`;
  const label = sentenceLabel(c.label);

  if (feature && isNumeric(feature)) {
    const median = feature.median;
    const typical = formatPlain(median);
    // Counts of subjects/exams read better as "fewer/more", other numbers as "lower/higher".
    const isCount = feature.integer && feature.section.startsWith('Semester');
    if (Math.abs(c.value - median) < 1e-9) {
      return `${upperFirst(label)} of ${c.value_label}, about typical, ${effect}.`;
    }
    const above = c.value > median;
    const comparison = isCount ? (above ? 'More' : 'Fewer') : above ? 'A higher' : 'A lower';
    return `${comparison} ${lowerFirst(label)} than usual (${c.value_label} vs. a typical ${typical}) ${effect}.`;
  }

  const options = feature && !isNumeric(feature) ? feature.options.map((o) => o.label) : [];
  const isYesNo = options.length === 2 && options.includes('Yes') && options.includes('No');
  if (isYesNo) {
    return `Answering "${c.value_label}" to "${label}" ${effect}.`;
  }
  return `${label}: ${c.value_label} ${effect}.`;
}
