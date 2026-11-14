import { useChartTheme } from '../../hooks/useChartTheme';

export interface RiskGaugeProps {
  /** 0-100 dropout percentile. */
  percentile: number;
  /** Percentile at and above which a student is flagged (70 = top 30%). */
  flagAt: number;
  flagged: boolean;
}

const CX = 100;
const CY = 100;
const R = 80;

/** Point on the semicircle for a 0-100 value (0 = left, 100 = right). */
function point(value: number, radius = R): [number, number] {
  const theta = Math.PI * (1 - value / 100);
  return [CX + radius * Math.cos(theta), CY - radius * Math.sin(theta)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** Semicircle gauge for the dropout percentile, with the "flagged" zone marked. */
export function RiskGauge({ percentile, flagAt, flagged }: RiskGaugeProps) {
  const ct = useChartTheme();
  const value = Math.min(100, Math.max(0, percentile));
  const fill = flagged ? ct.classColors.Dropout : ct.classColors.Graduate;
  const [nx, ny] = point(value, R - 22);
  const [tx1, ty1] = point(flagAt, R + 9);
  const [tx2, ty2] = point(flagAt, R - 9);
  const track = ct.isDark ? '#334155' : '#e2e8f0';

  return (
    <svg
      viewBox="0 0 200 118"
      className="mx-auto block w-full max-w-[15rem]"
      role="img"
      aria-label={`Dropout percentile ${value.toFixed(0)} out of 100. Students at ${flagAt} or above are flagged.`}
    >
      <path d={arc(0, 100)} fill="none" stroke={track} strokeWidth={16} strokeLinecap="round" />
      <path d={arc(flagAt, 100)} fill="none" stroke={ct.classColors.Dropout} strokeOpacity={0.22} strokeWidth={16} />
      {value > 0.5 && (
        <path d={arc(0, value)} fill="none" stroke={fill} strokeWidth={16} strokeLinecap="round" />
      )}
      <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke={ct.text} strokeWidth={2} />
      <line x1={CX} y1={CY} x2={nx} y2={ny} stroke={ct.text} strokeWidth={3} strokeLinecap="round" />
      <circle cx={CX} cy={CY} r={5} fill={ct.text} />
      <text x={20} y={116} textAnchor="middle" fontSize={10} fill={ct.mutedText}>
        0
      </text>
      <text x={180} y={116} textAnchor="middle" fontSize={10} fill={ct.mutedText}>
        100
      </text>
    </svg>
  );
}
