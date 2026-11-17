import type { CareAction, CommentFrequency, PetState } from '../shared/contracts.js';
import { DEFAULT_SPECIES, getSpecies, type SpeciesDefinition, type SpeciesId } from '../shared/species.js';

const MIN_NEED = 0;
const MAX_NEED = 100;
const SLEEP_THRESHOLD = 12;
const WAKE_THRESHOLD = 60;
const HUNGER_COMMENT_THRESHOLD = 70;
const MAX_TICK_SECONDS = 24 * 60 * 60;
const DISTURBANCE_HALF_LIFE_MS = 25_000;
const BREAK_REMINDER_INTERVAL_MS = 45 * 60 * 1_000;

const COMMENT_COOLDOWNS: Record<CommentFrequency, number> = {
  off: Number.POSITIVE_INFINITY,
  quiet: 120_000,
  balanced: 60_000,
  chatty: 30_000,
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
  needs: SpeciesDefinition['needs'],
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
        (WAKE_THRESHOLD - energy) / needs.sleepRecoveryPerSecond;
      if (remaining < secondsUntilWake) {
        energy += remaining * needs.sleepRecoveryPerSecond;
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
        (energy - SLEEP_THRESHOLD) / needs.energyDrainPerSecond;
      if (remaining < secondsUntilSleep) {
        energy -= remaining * needs.energyDrainPerSecond;
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

export function createPet(now: number, species: SpeciesId = DEFAULT_SPECIES): PetState {
  const timestamp = Number.isFinite(now) ? now : 0;
  const definition = getSpecies(species);
  return {
    species,
    hunger: definition.needs.initialHunger,
    energy: definition.needs.initialEnergy,
    mood: 'idle',
    atHome: false,
    manualSleep: false,
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

export function tick(pet: PetState, now: number, definition = getSpecies(pet.species)): PetState {
  if (!Number.isFinite(now) || !Number.isFinite(pet.lastTickAt) || now < pet.lastTickAt) {
    return pet;
  }

  const elapsedSeconds = Math.min((now - pet.lastTickAt) / 1_000, MAX_TICK_SECONDS);
  const elapsedMs = elapsedSeconds * 1_000;
  const hunger = pet.atHome
    ? clampNeed(pet.hunger)
    : clampNeed(pet.hunger + elapsedSeconds * definition.needs.hungerPerSecond);
  const energyResult = pet.atHome
    ? { energy: clampNeed(pet.energy), sleeping: pet.mood === 'sleeping' || pet.energy <= SLEEP_THRESHOLD }
    : pet.manualSleep
      ? { energy: clampNeed(pet.energy + elapsedSeconds * definition.needs.sleepRecoveryPerSecond), sleeping: true }
      : advanceEnergy(pet.energy, elapsedSeconds, pet.mood === 'sleeping', definition.needs);
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

export function care(pet: PetState, action: CareAction, now: number, definition = getSpecies(pet.species)): PetState {
  if (!Number.isFinite(now) || !Object.hasOwn(definition.care, action)) return pet;

  const advanced = tick(pet, now, definition);
  const interactionAt = Math.max(now, advanced.lastTickAt);
  let hunger = advanced.hunger;
  let energy = advanced.energy;

  const effect = definition.care[action];
  hunger += effect.hunger;
  energy += effect.energy;

  hunger = clampNeed(hunger);
  energy = clampNeed(energy);
  const disturbance = clampNeed(
    advanced.disturbance - effect.calm,
  );
  const reaction = effect.mood;
  const canReact = !advanced.atHome && advanced.mood !== 'sleeping' && energy > SLEEP_THRESHOLD;

  const result: PetState = {
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
    reactionUntil: canReact ? interactionAt + effect.duration : 0,
  };
  return canReact && definition.reactToCare ? { ...result, ...definition.reactToCare(result, action, interactionAt) } : result;
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

  return addDisturbance(pet, 6 + Math.min(60, distancePixels / 25), now);
}

export function addDisturbance(pet: PetState, contribution: number, now: number): PetState {
  if (pet.atHome || !Number.isFinite(now) || now < pet.lastTickAt || !Number.isFinite(contribution) || contribution <= 0) return pet;
  const advanced = tick(pet, now);
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
    mood: atHome ? 'home' : advanced.manualSleep ? 'sleeping' : baselineMood(advanced.hunger, advanced.energy),
    lastTickAt: Math.max(now, advanced.lastTickAt),
    reactionUntil: atHome ? 0 : advanced.reactionUntil,
  };
}

export function setSleeping(pet: PetState, asleep: boolean, now: number): PetState {
  if (!Number.isFinite(now) || now < pet.lastTickAt) return pet;
  const advanced = tick(pet, now);
  if (advanced.atHome) return advanced;
  const energy = asleep ? advanced.energy : Math.max(SLEEP_THRESHOLD + 1, advanced.energy);
  return { ...advanced, manualSleep: asleep, energy, mood: asleep ? 'sleeping' : baselineMood(advanced.hunger, energy),
    reactionUntil: 0, lastInteractionAt: Math.max(now, advanced.lastTickAt) };
}

export function idleActivity(pet: PetState, now: number, moving: boolean, random: number): PetState | null {
  if (pet.atHome || moving || pet.reactionUntil > now || pet.hunger >= HUNGER_COMMENT_THRESHOLD
    || pet.energy <= 20 || (pet.mood !== 'idle' && pet.mood !== 'walking')) return null;
  return { ...pet, mood: random < 0.4 ? 'yawning' : 'relaxing', reactionUntil: now + (random < 0.4 ? 4500 : 12_000) };
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
    pet.mood === 'sleeping' ||
    !(frequency in COMMENT_COOLDOWNS) ||
    frequency === 'off' ||
    !Number.isFinite(now) ||
    !Number.isFinite(pet.lastCommentAt) ||
    now - pet.lastCommentAt < commentCooldown(frequency)
  ) {
    return null;
  }

  const lines = getSpecies(pet.species).comments;
  const comments =
    pet.mood === 'irritated' && pet.reactionUntil > now
      ? lines.irritated
      : pet.hunger >= HUNGER_COMMENT_THRESHOLD
        ? lines.hungry
        : pet.energy <= 35
          ? lines.tired
          : lines.general;
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
    pet.mood === 'sleeping' ||
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

  return 'A little stretch and a sip of water, lovely?';
}
