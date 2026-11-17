import type { Attention } from '../shared/contracts.js';

export const NEUTRAL_ATTENTION: Readonly<Attention> = Object.freeze({ x: 0, y: 0, nearby: false });

export function cursorAttention(
  cursor: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
): Attention {
  if (![cursor.x, cursor.y, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) return { ...NEUTRAL_ATTENTION };
  const dx = cursor.x - (bounds.x + bounds.width * 0.5);
  const dy = cursor.y - (bounds.y + bounds.height * 0.52);
  const size = Math.max(bounds.width, bounds.height);
  if (Math.hypot(dx, dy) > size * 1.5) return { ...NEUTRAL_ATTENTION };
  const limit = (value: number): number => Math.max(-1, Math.min(1, value));
  return { x: limit(dx / (size * 0.8)), y: limit(dy / (size * 0.8)), nearby: true };
}
