/** Shared number formatting so every page shows numbers the same way. */

const formatters = new Map<number, Intl.NumberFormat>();

function numberFormat(decimals: number): Intl.NumberFormat {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, f);
  }
  return f;
}

/** 1234.5678 -> "1,234.568" (decimals=3). Whole numbers are shown without decimals. */
export function formatNumber(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  if (Number.isInteger(value)) return numberFormat(0).format(value);
  return numberFormat(decimals).format(value);
}

/** p-values: scientific notation below 0.001 ("3.2e-7"), otherwise 3 decimals. */
export function formatPValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  if (value === 0) return '< 1e-300';
  if (value < 0.001) {
    const [mantissa, exponent] = value.toExponential(1).split('e');
    return `${mantissa}e${Number(exponent)}`;
  }
  return value.toFixed(3);
}

/** 0.4567 -> "45.7%" (input is a 0-1 share). */
export function formatPercent(share: number | null | undefined, decimals = 1): string {
  if (share === null || share === undefined || Number.isNaN(share)) return '–';
  return `${(share * 100).toFixed(decimals)}%`;
}

/**
 * Heuristic used by DataTable: does this column name look like a p-value?
 * Matches "p", "p_value", "p-value", "pvalue", "p_adj", "p (Mann-Whitney)", "chi2_p".
 */
export function isPValueColumn(name: string): boolean {
  const n = name.trim().toLowerCase();
  return /(^|[_\s(-])p([_\s-]?val(ue)?)?([_\s)-]|$)/.test(n) || /p[_\s-]?adj/.test(n) || n.startsWith('pval');
}
