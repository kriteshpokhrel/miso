import type { MotionLevel } from '../shared/contracts.js';

export interface Rect { x: number; y: number; width: number; height: number; }
export interface WindowGeometry { bounds: Rect; maximized: boolean; }
export interface Travel { x: number; y: number; vx: number; }
export interface WalkingDisplay { id: number; bounds: Rect; workArea: Rect; }

export function nextWalkingDisplay(current: WalkingDisplay, target: WalkingDisplay, displays: readonly WalkingDisplay[]): WalkingDisplay | null {
  const queue = [{ display: current, first: current }];
  const visited = new Set([current.id]);
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index]!;
    if (item.display.id === target.id) return item.first;
    for (const neighbor of displays) {
      if (visited.has(neighbor.id)) continue;
      const a = item.display;
      const touches = Math.abs(a.bounds.x + a.bounds.width - neighbor.bounds.x) < 4
        || Math.abs(neighbor.bounds.x + neighbor.bounds.width - a.bounds.x) < 4;
      const aligned = Math.abs(a.workArea.y + a.workArea.height - neighbor.workArea.y - neighbor.workArea.height) < 8;
      if (!touches || !aligned) continue;
      visited.add(neighbor.id);
      queue.push({ display: neighbor, first: item.display.id === current.id ? neighbor : item.first });
    }
  }
  return null;
}
export const MOTION_PROFILES = {
  still: { speed: 0, acceleration: 0, interval: Infinity, duration: 0 },
  gentle: { speed: 42, acceleration: 140, interval: 18_000, duration: 4500 },
  lively: { speed: 86, acceleration: 240, interval: 8000, duration: 6500 },
} satisfies Record<MotionLevel, { speed: number; acceleration: number; interval: number; duration: number }>;

export function walkingSurface(area: Rect, size: number, active: WindowGeometry | null, follow: boolean) {
  const floor = { min: area.x, max: area.x + Math.max(0, area.width - size), y: Math.max(area.y, area.y + area.height - size), perched: false, compact: false };
  if (!follow || !active || active.maximized) return floor;
  const rect = active.bounds;
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    || rect.width < size * 0.6 || rect.height < 100 || rect.y - size * 236 / 300 < area.y
    || rect.y > area.y + area.height - 30) return floor;
  const min = Math.max(floor.min, rect.x - size * 0.28);
  const max = Math.min(floor.max, rect.x + rect.width - size * 0.72);
  const compact = rect.y - size < area.y;
  return max > min ? { min, max, y: rect.y - size * (compact ? 236 / 300 : 1), perched: true, compact } : floor;
}

export function walkToward(position: Travel, target: number, elapsed: number, speed: number, acceleration: number): Travel {
  const dt = Math.max(0, Math.min(0.1, elapsed));
  const distance = target - position.x;
  if (speed <= 0 || acceleration <= 0 || Math.abs(distance) < 0.05) return { ...position, vx: 0 };
  const wanted = Math.sign(distance) * Math.min(speed, Math.sqrt(2 * acceleration * Math.abs(distance)));
  const vx = position.vx + Math.sign(wanted - position.vx) * Math.min(Math.abs(wanted - position.vx), acceleration * dt);
  const x = position.x + vx * dt;
  return (target - x) * distance <= 0 ? { ...position, x: target, vx: 0 } : { ...position, x, vx };
}

export function hopPosition(from: { x: number; y: number }, to: { x: number; y: number }, progress: number) {
  const t = Math.max(0, Math.min(1, (progress - 0.16) / 0.68));
  const ease = t * t * (3 - 2 * t);
  const lift = Math.min(70, 18 + Math.hypot(to.x - from.x, to.y - from.y) * 0.09);
  return { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease - Math.sin(Math.PI * t) * lift };
}

export function fallPosition(from: { x: number; y: number }, to: { x: number; y: number }, progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  return { x: from.x + (to.x - from.x) * t * t * (3 - 2 * t), y: from.y + (to.y - from.y) * t * t };
}
