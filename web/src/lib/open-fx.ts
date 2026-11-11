/** How fancy a crate opening looks: the lower the drop rate, the bigger the show. */
export type FxTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface FxPlan {
  readonly tier: FxTier;
  /** Crate shaking before it bursts (ms). */
  readonly shakeMs: number;
  /** Icons the slot reel flips through before it locks on the real item; it slows as it goes. */
  readonly spinSteps: number;
  /** How long the locked-in item stays up before the overlay closes (ms). */
  readonly holdMs: number;
  readonly particles: number;
  readonly rays: boolean;
  readonly flash: boolean;
  readonly color: string;
}

/** Tier from a drop rate in percent (the published list only has 1-3%, so the bands are tight on purpose). */
export function tierFor(rate: number): FxTier {
  if (rate <= 1) return 'legendary';
  if (rate <= 2) return 'epic';
  if (rate <= 3) return 'rare';
  return 'common';
}

const PLANS: Record<FxTier, FxPlan> = {
  common: { tier: 'common', shakeMs: 400, spinSteps: 8, holdMs: 1000, particles: 8, rays: false, flash: false, color: '#9ad0ff' },
  rare: { tier: 'rare', shakeMs: 500, spinSteps: 12, holdMs: 1300, particles: 18, rays: false, flash: false, color: '#6fe39a' },
  epic: { tier: 'epic', shakeMs: 700, spinSteps: 18, holdMs: 1800, particles: 32, rays: true, flash: false, color: '#c58bff' },
  legendary: { tier: 'legendary', shakeMs: 900, spinSteps: 26, holdMs: 2600, particles: 56, rays: true, flash: true, color: '#ffc83d' },
};

/** Every tier's colour, in rarity order: the slot border cycles through these while the reel spins. */
export const SPIN_COLORS: readonly string[] = Object.values(PLANS).map((p) => p.color);

export const planFor= (rate: number): FxPlan => PLANS[tierFor(rate)];
