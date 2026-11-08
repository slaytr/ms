/**
 * MapleStory Classic EXP table, levels 1-100.
 * Source: https://meowdb.com/msclassic/guides/exp-table-level-1-to-100 (page updated 2026-10-23)
 *
 * Levels 1-89 match pre-Big-Bang rates; levels 90-99 cost 2.1x the previous level.
 * Level 100 is the cap and has no EXP requirement.
 */

export const MAX_LEVEL = 100

/** EXP needed to advance from level N to N+1, indexed by N (levels 1-99). */
export const EXP_TO_NEXT: Readonly<Record<number, number>> = Object.freeze({
  1: 15, 2: 34, 3: 57, 4: 92, 5: 135,
  6: 372, 7: 560, 8: 840, 9: 1242, 10: 1716,
  11: 2360, 12: 3216, 13: 4200, 14: 5460, 15: 7050,
  16: 8840, 17: 11040, 18: 13716, 19: 16680, 20: 20216,
  21: 24402, 22: 28980, 23: 34320, 24: 40512, 25: 47216,
  26: 54900, 27: 63666, 28: 73080, 29: 83720, 30: 95700,
  31: 108480, 32: 122760, 33: 138666, 34: 155540, 35: 174216,
  36: 194832, 37: 216600, 38: 240500, 39: 266682, 40: 294216,
  41: 324240, 42: 356916, 43: 391160, 44: 428280, 45: 468450,
  46: 510420, 47: 555680, 48: 604416, 49: 655200, 50: 709716,
  51: 748608, 52: 789631, 53: 832902, 54: 878545, 55: 926689,
  56: 977471, 57: 1031036, 58: 1087536, 59: 1147132, 60: 1209994,
  61: 1276301, 62: 1346242, 63: 1420016, 64: 1497832, 65: 1579913,
  66: 1666492, 67: 1757815, 68: 1854143, 69: 1955750, 70: 2062925,
  71: 2175973, 72: 2295216, 73: 2420993, 74: 2553663, 75: 2693603,
  76: 2841212, 77: 2996910, 78: 3161140, 79: 3334370, 80: 3517093,
  81: 3709829, 82: 3913127, 83: 4127566, 84: 4353756, 85: 4592341,
  86: 4844001, 87: 5109452, 88: 5389449, 89: 5684790, 90: 11938059,
  91: 25069923, 92: 52646838, 93: 110558359, 94: 232172553, 95: 487562361,
  96: 1023880958, 97: 2150150011, 98: 4515315023, 99: 9482161548,
})

/** Total EXP from level 1 to reach each level, indexed by level (1-100). Level 1 = 0. */
export const CUMULATIVE_EXP: Readonly<Record<number, number>> = Object.freeze(
  Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).reduce<Record<number, number>>(
    (acc, level) => ({
      ...acc,
      [level]: level === 1 ? 0 : acc[level - 1] + EXP_TO_NEXT[level - 1],
    }),
    {},
  ),
)

/** EXP needed to go from `level` to `level + 1`, or null at/after the cap or for invalid input. */
export function expToNext(level: number): number | null {
  return EXP_TO_NEXT[level] ?? null
}

/** Total EXP needed to climb from `from` to `to` (inclusive of range bounds), or null if invalid. */
export function expBetween(from: number, to: number): number | null {
  const a = CUMULATIVE_EXP[from]
  const b = CUMULATIVE_EXP[to]
  if (a === undefined || b === undefined || to < from) return null
  return b - a
}
