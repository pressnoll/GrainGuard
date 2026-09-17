import { colors } from './theme';
import type { Band } from './monitoring';

/** Colour pair for a state. `line` is for text/marks, `wash` for fills. */
export function bandColor(band: Band): { line: string; wash: string } {
  switch (band) {
    case 'ok':
      return { line: colors.ok, wash: colors.okWash };
    case 'caution':
      return { line: colors.caution, wash: colors.cautionWash };
    case 'critical':
      return { line: colors.critical, wash: colors.criticalWash };
    default:
      return { line: colors.idle, wash: colors.idleWash };
  }
}

/** "3 min ago" / "2 h 14 ago" / "3 d ago" — compact, mono-friendly. */
export function ago(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) {
    const m = minutes % 60;
    return m === 0 ? `${h} h ago` : `${h} h ${m} ago`;
  }
  const d = Math.floor(h / 24);
  return `${d} d ago`;
}

/** Signed delta with an explicit sign, e.g. "+1.3". */
export function signed(value: number, digits = 1): string {
  const s = value.toFixed(digits);
  return value > 0 ? `+${s}` : s;
}

/** 9400 -> "9.4 t"; keeps mass readable at a glance. */
export function tonnes(kg: number): string {
  return `${(kg / 1000).toFixed(1)} t`;
}

/** 2400 -> "2.4k"; for frequency axis labels. */
export function hz(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`;
}

export const percent = (v: number, digits = 1) => `${v.toFixed(digits)}%`;

/** Net change across a series, used for trend deltas. */
export function seriesDelta(series: number[]): number {
  if (series.length < 2) return 0;
  return series[series.length - 1] - series[0];
}
