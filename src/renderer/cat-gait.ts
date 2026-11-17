export const WALK_YAW = 1.22;
export const WALK_CYCLE_PIXELS = 0.6 * Math.sin(WALK_YAW) * 236 / 2.82;

export function walkBob(cycle: number): number {
  return (1 - Math.cos(cycle * Math.PI * 4)) / 2;
}

export function pawStep(cycle: number): { forward: number; lift: number } {
  const phase = ((cycle % 1) + 1) % 1;
  const stance = 0.7;
  if (phase < stance) return { forward: 0.21 - phase / stance * 0.42, lift: 0 };
  const swing = (phase - stance) / (1 - stance);
  return { forward: -0.21 + (swing * swing * (3 - 2 * swing)) * 0.42, lift: Math.sin(swing * Math.PI) * 0.14 };
}

export function legJoint(hipY: number, hipZ: number, footY: number, footZ: number, bend: -1 | 1) {
  const dy = footY - hipY;
  const dz = footZ - hipZ;
  const distance = Math.max(0.001, Math.hypot(dy, dz));
  const height = Math.sqrt(Math.max(0, 0.36 ** 2 - (distance / 2) ** 2));
  return { y: (hipY + footY) / 2 - dz / distance * height * bend, z: (hipZ + footZ) / 2 + dy / distance * height * bend };
}
