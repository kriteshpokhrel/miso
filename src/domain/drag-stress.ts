export interface DragStress { vx: number; vy: number; lastAt: number; lastReversal: number; distance: number; }
export const createDragStress = (now: number): DragStress => ({ vx: 0, vy: 0, lastAt: now, lastReversal: now - 100, distance: 0 });

export function sampleDrag(stress: DragStress, dx: number, dy: number, now: number): { stress: DragStress; score: number } {
  if (![dx, dy, now].every(Number.isFinite) || now <= stress.lastAt) return { stress, score: 0 };
  const dt = Math.max(0.016, Math.min(0.2, (now - stress.lastAt) / 1000));
  const vx = dx / dt;
  const vy = dy / dt;
  const speed = Math.hypot(vx, vy);
  const reversal = now - stress.lastReversal >= 80 && speed > 350 && Math.hypot(stress.vx, stress.vy) > 350
    && vx * stress.vx + vy * stress.vy < 0;
  const distance = Math.hypot(dx, dy);
  return {
    stress: { vx, vy, lastAt: now, lastReversal: reversal ? now : stress.lastReversal, distance: stress.distance + distance },
    score: Math.min(8, distance / 90) + (reversal ? 21 : 0),
  };
}
