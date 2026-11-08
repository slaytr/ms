/** A duration as h:mm:ss, e.g. 4,500,000 ms is "1:15:00". */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** A short count for chart axes: 950, 12.5K, 3M. One decimal at most, trailing ".0" dropped. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (value >= 1_000_000_000) return `${trim(value / 1_000_000_000)}B`;
  if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (value >= 1000) return `${trim(value / 1000)}K`;
  return String(Math.round(value));
}

/**
 * Per-hour figures (meso/hr, EXP/hr): whole numbers below 1000, otherwise thousands
 * as "96K". Truncated, never rounded, so a display never claims more than was earned
 * (96,999 shows as 96K, 999.9 shows as 999).
 */
export function formatPerHour(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const whole = Math.floor(value);
  return whole >= 1000 ? `${Math.floor(whole / 1000)}K` : String(whole);
}
