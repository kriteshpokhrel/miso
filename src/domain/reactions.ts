export const ANGER_DURATION_MS = 5000;
export const REASSURANCE_DURATION_MS = 2200;
export const IRRITATION_DURATION_MS = ANGER_DURATION_MS + REASSURANCE_DURATION_MS;

export function irritationBeat(elapsed: number): { mood: 'irritated' | 'purring'; text: string; done: boolean } {
  return elapsed < ANGER_DURATION_MS
    ? { mood: 'irritated', text: 'Easy! I might close that window!', done: false }
    : { mood: 'purring', text: 'Only teasing. Your windows are safe, lovely.', done: elapsed >= IRRITATION_DURATION_MS };
}

export function homeBeat(elapsed: number): { state: 'home-arriving' | 'home-entering' | 'home-leaving'; progress: number; done: boolean } {
  if (elapsed < 500) return { state: 'home-arriving', progress: Math.max(0, elapsed / 500), done: false };
  if (elapsed < 3500) return { state: 'home-entering', progress: (elapsed - 500) / 3000, done: false };
  return { state: 'home-leaving', progress: Math.min(1, (elapsed - 3500) / 800), done: elapsed >= 4300 };
}
