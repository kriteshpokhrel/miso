import type { CareAction, PetState, Settings } from '../shared/contracts.js';
import { DEFAULT_SETTINGS } from '../shared/contracts.js';

const APP_NAME = /^[a-zA-Z0-9][a-zA-Z0-9 ._()+-]{0,79}$/;
export function normalizeAppName(value: string): string {
  return value.trim().toLowerCase();
}

export function validateSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) throw new Error('Settings must be an object.');
  const candidate = value as Record<string, unknown>;
  const petSize = candidate.petSize === undefined ? 1 : candidate.petSize;
  const breakReminders = candidate.breakReminders === undefined ? true : candidate.breakReminders;
  const coatPattern = candidate.coatPattern === undefined ? DEFAULT_SETTINGS.coatPattern : candidate.coatPattern;
  const coatColor = candidate.coatColor === undefined ? DEFAULT_SETTINGS.coatColor : candidate.coatColor;
  const accentColor = candidate.accentColor === undefined ? DEFAULT_SETTINGS.accentColor : candidate.accentColor;
  if ((coatPattern !== 'single' && coatPattern !== 'dual') || typeof coatColor !== 'string'
    || typeof accentColor !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(coatColor) || !/^#[a-fA-F0-9]{6}$/.test(accentColor)) {
    throw new Error('Choose single or dual tone and six-digit hex colors for Nooki’s coat.');
  }
  if (typeof candidate.launchAtLogin !== 'boolean' || typeof candidate.aiEnabled !== 'boolean'
    || typeof candidate.reducedMotion !== 'boolean'
    || !['off', 'quiet', 'balanced', 'chatty'].includes(String(candidate.commentFrequency))
    || !Array.isArray(candidate.allowedApps) || candidate.allowedApps.length > 30
    || typeof petSize !== 'number' || !Number.isFinite(petSize) || petSize < 0.7 || petSize > 1.5
    || typeof breakReminders !== 'boolean') {
    throw new Error('Invalid settings. Check the comment frequency and application list (maximum 30).');
  }
  const apps: string[] = [];
  for (const value of candidate.allowedApps) {
    if (typeof value !== 'string' || !APP_NAME.test(value.trim())) {
      throw new Error('Use application names only, up to 80 characters, without paths or special symbols.');
    }
    apps.push(normalizeAppName(value));
  }
  return {
    launchAtLogin: candidate.launchAtLogin,
    aiEnabled: candidate.aiEnabled,
    reducedMotion: candidate.reducedMotion,
    commentFrequency: candidate.commentFrequency as Settings['commentFrequency'],
    allowedApps: [...new Set(apps)],
    petSize,
    breakReminders,
    coatPattern,
    coatColor: coatColor.toLowerCase(),
    accentColor: accentColor.toLowerCase(),
  };
}

export function validateCare(value: unknown): CareAction {
  if (value !== 'feed' && value !== 'pet' && value !== 'play') throw new Error('Unknown care action.');
  return value;
}

export function validatePet(value: unknown): PetState {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid saved pet.');
  const pet = value as Record<string, unknown>;
  const moods = ['idle', 'walking', 'hungry', 'playing', 'purring', 'sleeping', 'home', 'mimicking', 'irritated'];
  if (pet.species !== 'cat' || typeof pet.atHome !== 'boolean' || !moods.includes(String(pet.mood))) {
    throw new Error('Invalid saved pet identity.');
  }
  for (const key of ['hunger', 'energy', 'lastTickAt', 'lastInteractionAt', 'lastCommentAt', 'reactionUntil']) {
    if (typeof pet[key] !== 'number' || !Number.isFinite(pet[key]) || pet[key] < 0) {
      throw new Error('Invalid saved pet state.');
    }
  }
  if ((pet.hunger as number) > 100 || (pet.energy as number) > 100) throw new Error('Invalid saved needs.');
  const additions: Record<string, number> = {};
  for (const key of ['disturbance', 'lastDisturbedAt', 'activeTimeMs', 'lastBreakReminderAt']) {
    const number = pet[key] === undefined ? 0 : pet[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0
      || (key === 'disturbance' && number > 100)) throw new Error('Invalid saved companion state.');
    additions[key] = number;
  }
  return {
    species: 'cat',
    atHome: pet.atHome,
    mood: pet.mood as PetState['mood'],
    hunger: pet.hunger as number,
    energy: pet.energy as number,
    lastTickAt: pet.lastTickAt as number,
    lastInteractionAt: pet.lastInteractionAt as number,
    lastCommentAt: pet.lastCommentAt as number,
    reactionUntil: pet.reactionUntil as number,
    disturbance: additions.disturbance!,
    lastDisturbedAt: additions.lastDisturbedAt!,
    activeTimeMs: additions.activeTimeMs!,
    lastBreakReminderAt: additions.lastBreakReminderAt!,
  };
}
