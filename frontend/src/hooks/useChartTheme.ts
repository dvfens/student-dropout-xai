import { useMemo, type CSSProperties } from 'react';
import type { ClassName } from '../api/types';
import { useTheme } from '../theme/themeContext';

/** Fixed class colours, identical in both themes (match the notebook figures). */
export const CLASS_COLORS: Record<ClassName, string> = {
  Dropout: '#E45756',
  Enrolled: '#F2CF5B',
  Graduate: '#54A24B',
};

export interface ChartTheme {
  isDark: boolean;
  /** Axis tick labels and legend text. */
  text: string;
  /** Secondary text (axis titles, captions). */
  mutedText: string;
  axis: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  /** Hover band behind bars (Recharts `cursor`). */
  cursor: string;
  classColors: Record<ClassName, string>;
  /** Pushes towards dropout (SHAP > 0). */
  positive: string;
  /** Text-safe variant of `positive` (4.5:1 on the card background). */
  positiveText: string;
  /** Pushes away from dropout (SHAP < 0). */
  negative: string;
  /** Neutral single-series colour. */
  primary: string;
  /** Categorical palette for groups/series (colour-blind friendly, Tableau 10 order). */
  palette: string[];
  /** Ready-made props for <Tooltip contentStyle=... labelStyle=... itemStyle=...>. */
  tooltip: {
    contentStyle: CSSProperties;
    labelStyle: CSSProperties;
    itemStyle: CSSProperties;
  };
}

/** Recharts colours for the current light/dark theme. */
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  return useMemo(() => {
    const isDark = theme === 'dark';
    const text = isDark ? '#cbd5e1' : '#334155';
    const tooltipBg = isDark ? '#0f172a' : '#ffffff';
    const tooltipBorder = isDark ? '#334155' : '#cbd5e1';
    const tooltipText = isDark ? '#e2e8f0' : '#0f172a';
    return {
      isDark,
      text,
      mutedText: isDark ? '#94a3b8' : '#64748b',
      axis: isDark ? '#475569' : '#94a3b8',
      grid: isDark ? '#1e293b' : '#e2e8f0',
      tooltipBg,
      tooltipBorder,
      tooltipText,
      cursor: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.10)',
      classColors: CLASS_COLORS,
      positive: '#E45756',
      positiveText: isDark ? '#f87171' : '#b91c1c',
      negative: isDark ? '#60a5fa' : '#2563eb',
      primary: isDark ? '#818cf8' : '#4f46e5',
      palette: isDark
        ? ['#6b9bd1', '#f8a04b', '#6cc070', '#ef7b7a', '#a98bd6', '#c9a07e', '#f39bd0', '#b5b5b5']
        : ['#4C78A8', '#F58518', '#54A24B', '#E45756', '#79599f', '#9D755D', '#E377C2', '#7f7f7f'],
      tooltip: {
        contentStyle: {
          backgroundColor: tooltipBg,
          border: `1px solid ${tooltipBorder}`,
          borderRadius: 8,
          color: tooltipText,
          fontSize: 13,
        },
        labelStyle: { color: tooltipText, fontWeight: 600 },
        itemStyle: { color: tooltipText },
      },
    };
  }, [theme]);
}
