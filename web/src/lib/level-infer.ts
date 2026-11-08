import { expToNext, MAX_LEVEL } from '../data/expTable';
import type { Detection } from './detect/detect.ts';

/** The game shows EXP% with two decimals, rounded, so the true value is within half a hundredth of what we read. */
const PCT_TOLERANCE = 0.006;

/** Every level whose EXP bar would show `expPct` for this much raw EXP. */
export function levelCandidates(exp: number, expPct: number): number[] {
  const matches: number[] = [];
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    const need = expToNext(level);
    if (need === null || exp >= need) continue;
    if (Math.abs((exp / need) * 100 - expPct) <= PCT_TOLERANCE) matches.push(level);
  }
  return matches;
}

/**
 * Works out the level from the EXP bar when the level digits can't be read: raw EXP divided by the
 * EXP a level needs must equal the percentage shown. If several levels fit (only possible at tiny
 * values, e.g. 0 EXP), `hint`, the level we last knew, breaks the tie, either unchanged or one up
 * after a level-up. Returns null rather than guess.
 */
export function inferLevel(exp: number | null, expPct: number | null, hint: number | null = null): number | null {
  if (exp === null || expPct === null || exp < 0) return null;
  const candidates = levelCandidates(exp, expPct);
  if (candidates.length === 1) return candidates[0];
  if (hint !== null) {
    if (candidates.includes(hint)) return hint;
    if (candidates.includes(hint + 1)) return hint + 1;
  }
  return null;
}

/** The detection with its level filled in from EXP when the digits were unreadable. Marks `levelInferred`. */
export function withInferredLevel(detection: Detection, hint: number | null): Detection {
  if (detection.level !== null) return detection;
  const level = inferLevel(detection.exp, detection.expPct, hint);
  return level === null ? detection : { ...detection, level, levelInferred: true };
}
