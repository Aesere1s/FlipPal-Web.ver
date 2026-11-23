export interface ProgressRingProps {
  done: number;
  total: number;
  label?: string;
}

const SIZE = 120;
const RADIUS = 52;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function toFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function ProgressRing({ done, total, label = '今日进度' }: ProgressRingProps) {
  const safeDone = toFinite(done);
  const safeTotal = toFinite(total);
  const empty = safeTotal <= 0;
  const shownDone = empty ? 0 : safeDone;
  const shownTotal = empty ? 0 : safeTotal;
  const ratio = empty ? 0 : Math.min(Math.max(shownDone / shownTotal, 0), 1);

  return (
    <div
      className="progress-ring"
      role="img"
      aria-label={`${label} ${shownDone} / ${shownTotal}`}
    >
      <svg className="progress-ring-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle
          className="progress-ring-track"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
        />
        <circle
          className="progress-ring-value"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - ratio)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="progress-ring-text" aria-hidden="true">
        {shownDone} / {shownTotal}
      </span>
    </div>
  );
}