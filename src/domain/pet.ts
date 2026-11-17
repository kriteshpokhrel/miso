import type { CareAction, CommentFrequency, PetState } from '../shared/contracts.js';

const MIN_NEED = 0;
const MAX_NEED = 100;
const SLEEP_THRESHOLD = 12;
const WAKE_THRESHOLD = 60;
const HUNGER_COMMENT_THRESHOLD = 70;
const MAX_TICK_SECONDS = 24 * 60 * 60;
const DISTURBANCE_HALF_LIFE_MS = 25_000;
const BREAK_REMINDER_INTERVAL_MS = 45 * 60 * 1_000;

export const SPECIES_CONFIG = {
  cat: {
    initialHunger: 18,
    initialEnergy: 82,
    hungerPerSecond: 0.005,
    energyDrainPerSecond: 0.004,
    sleepRecoveryPerSecond: 0.015,
  },
} as const;

const COMMENT_COOLDOWNS: Record<CommentFrequency, number> = {
  off: Number.POSITIVE_INFINITY,
  quiet: 120_000,
  balanced: 60_000,
  chatty: 30_000,
};

const HUNGER_COMMENTS = [
  'A little snack would make my whiskers very happy.',
  'I can smell treats somewhere around here.',
];

const ENERGY_COMMENTS = [
  'I think these paws are ready for a cozy rest.',
  'Could I borrow a sunny spot for a little nap?',
];

const GENERAL_COMMENTS = [
  'Could we have a tiny play break?',
  'You are my favorite human to supervise.',
];

const IRRITATED_COMMENTS = [
  'I could close that app... kidding. I only have paws.',
  'I could move that window... kidding. Paws, not power.',
];

const REACTION_DURATIONS: Record<CareAction, number> = {
  feed: 8_000,
  pet: 12_000,
  play: 18_000,
};

function clampNeed(value: number): number {
  return Math.min(MAX_NEED, Math.max(MIN_NEED, value));
}

function baselineMood(hunger: number, energy: number): PetState['mood'] {
  if (energy <= SLEEP_THRESHOLD) return 'sleeping';
  return hunger >= HUNGER_COMMENT_THRESHOLD ? 'hungry' : 'idle';
}

function advanceEnergy(
  initialEnergy: number,
  elapsedSeconds: number,
  wasSleeping: boolean,
): { energy: number; sleeping: boolean } {
  let energy = clampNeed(initialEnergy);
  let remaining = elapsedSeconds;
  let sleeping = wasSleeping || energy <= SLEEP_THRESHOLD;

  while (remaining > 0) {
    if (sleeping) {
      if (energy >= WAKE_THRESHOLD) {
        sleeping = false;
        continue;
      }

      const secondsUntilWake =
        (WAKE_THRESHOLD - energy) / SPECIES_CONFIG.cat.sleepRecoveryPerSecond;
      if (remaining < secondsUntilWake) {
        energy += remaining * SPECIES_CONFIG.cat.sleepRecoveryPerSecond;
        remaining = 0;
      } else {
        energy = WAKE_THRESHOLD;
        remaining -= secondsUntilWake;
        sleeping = false;
      }
    } else {
      if (energy <= SLEEP_THRESHOLD) {
        sleeping = true;
        continue;
      }

      const secondsUntilSleep =
        (energy - SLEEP_THRESHOLD) / SPECIES_CONFIG.cat.energyDrainPerSecond;
      if (remaining < secondsUntilSleep) {
        energy -= remaining * SPECIES_CONFIG.cat.energyDrainPerSecond;
        remaining = 0;
      } else {
        energy = SLEEP_THRESHOLD;
        remaining -= secondsUntilSleep;
        sleeping = true;
      }
    }
  }

  return { energy: clampNeed(energy), sleeping };
}

export function createPet(now: number): PetState {
  const timestamp = Number.isFinite(now) ? now : 0;
  return {
    species: 'cat',
    hunger: SPECIES_CONFIG.cat.initialHunger,
    energy: SPECIES_CONFIG.cat.initialEnergy,
    mood: 'idle',
    atHome: false,
    lastTickAt: timestamp,
    lastInteractionAt: timestamp,
    lastCommentAt: 0,
    reactionUntil: 0,
    disturbance: 0,
    lastDisturbedAt: 0,
    activeTimeMs: 0,
    lastBreakReminderAt: 0,
  };
}

export function tick(pet: PetState, now: number): PetState {
  if (!Number.isFinite(now) || !Number.isFinite(pet.lastTickAt) || now < pet.lastTickAt) {
    return pet;
  }

  const elapsedSeconds = Math.min((now - pet.lastTickAt) / 1_000, MAX_TICK_SECONDS);
  const elapsedMs = elapsedSeconds * 1_000;
  const hunger = pet.atHome
    ? clampNeed(pet.hunger)
    : clampNeed(pet.hunger + elapsedSeconds * SPECIES_CONFIG.cat.hungerPerSecond);
  const energyResult = pet.atHome
    ? { energy: clampNeed(pet.energy), sleeping: pet.mood === 'sleeping' || pet.energy <= SLEEP_THRESHOLD }
    : advanceEnergy(pet.energy, elapsedSeconds, pet.mood === 'sleeping');
  const reactionIsActive = pet.reactionUntil > now && !energyResult.sleeping;
  const disturbance = clampNeed(
    (Number.isFinite(pet.disturbance) ? pet.disturbance : 0) *
    Math.pow(0.5, elapsedMs / DISTURBANCE_HALF_LIFE_MS),
  );
  const activeTimeMs = Math.max(0, Number.isFinite(pet.activeTimeMs) ? pet.activeTimeMs : 0) +
    (pet.atHome ? 0 : elapsedMs);

  return {
    ...pet,
    hunger,
    energy: energyResult.energy,
    disturbance,
    activeTimeMs,
    mood: pet.atHome
      ? 'home'
      : energyResult.sleeping
        ? 'sleeping'
      : reactionIsActive
        ? pet.mood
        : baselineMood(hunger, energyResult.energy),
    lastTickAt: now,
    reactionUntil: pet.reactionUntil > now ? pet.reactionUntil : 0,
  };
}

export function care(pet: PetState, action: CareAction, now: number): PetState {
  if (!Number.isFinite(now) || !(action in REACTION_DURATIONS)) return pet;

  const advanced = tick(pet, now);
  const interactionAt = Math.max(now, advanced.lastTickAt);
  let hunger = advanced.hunger;
  let energy = advanced.energy;

  if (action === 'feed') {
    hunger -= 35;
    energy += 3;
  } else if (action === 'pet') {
    energy += 2;
  } else {
    hunger += 8;
    energy -= 12;
  }

  hunger = clampNeed(hunger);
  energy = clampNeed(energy);
  const disturbance = clampNeed(
    advanced.disturbance - (action === 'pet' ? 40 : action === 'feed' ? 8 : 0),
  );
  const reaction = action === 'play' ? 'playing' : 'purring';
  const canReact = !advanced.atHome && advanced.mood !== 'sleeping' && energy > SLEEP_THRESHOLD;

  return {
    ...advanced,
    hunger,
    energy,
    disturbance,
    mood: advanced.atHome
      ? 'home'
      : canReact
        ? reaction
        : advanced.mood === 'sleeping'
          ? 'sleeping'
        : baselineMood(hunger, energy),
    lastTickAt: interactionAt,
    lastInteractionAt: interactionAt,
    reactionUntil: canReact ? interactionAt + REACTION_DURATIONS[action] : 0,
  };
}

export function disturb(pet: PetState, distancePixels: number, now: number): PetState {
  if (
    pet.atHome ||
    !Number.isFinite(now) ||
    !Number.isFinite(distancePixels) ||
    distancePixels < 0 ||
    now < pet.lastTickAt
  ) {
    return pet;
  }

  const advanced = tick(pet, now);
  const contribution = 6 + Math.min(60, distancePixels / 25);
  const disturbance = clampNeed(advanced.disturbance + contribution);
  const irritated = disturbance >= 60;

  return {
    ...advanced,
    disturbance,
    lastDisturbedAt: now,
    mood: irritated ? 'irritated' : advanced.mood,
    reactionUntil: irritated ? now + 12_000 : advanced.reactionUntil,
  };
}

export function setHome(pet: PetState, atHome: boolean, now: number): PetState {
  if (!Number.isFinite(now)) return pet;

  const advanced = tick(pet, now);
  if (advanced.atHome === atHome) {
    return atHome ? { ...advanced, mood: 'home' } : advanced;
  }

  return {
    ...advanced,
    atHome,
    mood: atHome ? 'home' : baselineMood(advanced.hunger, advanced.energy),
    lastTickAt: Math.max(now, advanced.lastTickAt),
    reactionUntil: atHome ? 0 : advanced.reactionUntil,
  };
}

export function shouldFollowCursor(pet: PetState): boolean {
  return !pet.atHome && pet.mood !== 'sleeping' && pet.hunger >= HUNGER_COMMENT_THRESHOLD;
}

export function commentCooldown(frequency: CommentFrequency): number {
  return COMMENT_COOLDOWNS[frequency] ?? Number.POSITIVE_INFINITY;
}

export function scriptedComment(
  pet: PetState,
  frequency: CommentFrequency,
  now: number,
  random?: number,
): string | null {
  if (
    pet.atHome ||
    !(frequency in COMMENT_COOLDOWNS) ||
    frequency === 'off' ||
    !Number.isFinite(now) ||
    !Number.isFinite(pet.lastCommentAt) ||
    now - pet.lastCommentAt < commentCooldown(frequency)
  ) {
    return null;
  }

  const comments =
    pet.mood === 'irritated' && pet.reactionUntil > now
      ? IRRITATED_COMMENTS
      : pet.hunger >= HUNGER_COMMENT_THRESHOLD
        ? HUNGER_COMMENTS
        : pet.energy <= 35
          ? ENERGY_COMMENTS
          : GENERAL_COMMENTS;
  const cooldown = commentCooldown(frequency);
  const index =
    random === undefined
      ? ((Math.floor(now / cooldown) % comments.length) + comments.length) % comments.length
      : Number.isFinite(random)
        ? Math.min(
            comments.length - 1,
            Math.floor(Math.min(1, Math.max(0, random)) * comments.length),
          )
        : 0;
  return comments[index] ?? null;
}

export function breakReminder(
  pet: PetState,
  enabled: boolean,
  frequency: CommentFrequency,
  now: number,
): string | null {
  if (
    !enabled ||
    pet.atHome ||
    frequency === 'off' ||
    !(frequency in COMMENT_COOLDOWNS) ||
    !Number.isFinite(now) ||
    !Number.isFinite(pet.activeTimeMs) ||
    !Number.isFinite(pet.lastBreakReminderAt) ||
    !Number.isFinite(pet.lastCommentAt) ||
    pet.activeTimeMs - pet.lastBreakReminderAt < BREAK_REMINDER_INTERVAL_MS ||
    now - pet.lastCommentAt < commentCooldown(frequency)
  ) {
    return null;
  }

  return 'You have been working hard—how about a little stretch or a sip of water?';
}
