// WHO LMS z-score. Data from knowledge/growth/who_lms_*.json
export interface LMS { L: number; M: number; S: number }

export function zFromLMS(x: number, { L, M, S }: LMS): number {
  const z = L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
  if (Math.abs(z) <= 3) return z;
  // WHO restricted adjustment beyond ±3 SD
  const sd = (k: number) => M * Math.pow(1 + L * S * k, 1 / L);
  if (z > 3) { const d = sd(3) - sd(2); return 3 + (x - sd(3)) / d; }
  const d = sd(-2) - sd(-3); return -3 + (x - sd(-3)) / d;
}

export type Band = 'severe_low' | 'low' | 'normal' | 'high' | 'severe_high';
export const classify = (z: number): Band =>
  z < -3 ? 'severe_low' : z < -2 ? 'low' : z <= 2 ? 'normal' : z <= 3 ? 'high' : 'severe_high';

export function correctedAgeDays(birth: Date, at: Date, gestWeeks = 40): number {
  const days = Math.floor((at.getTime() - birth.getTime()) / 86400000);
  const correction = gestWeeks < 37 ? (40 - gestWeeks) * 7 : 0;
  return Math.max(0, days - correction);
}
// TODO(agent): unit tests vs WHO published SD tables (sample points day 0, 365, 730).
