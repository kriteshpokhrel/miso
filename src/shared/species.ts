import type { CareAction, Mood, PetState } from './contracts.js';

export interface SpeciesDefinition {
  label: string;
  personality: string;
  needs: {
    initialHunger: number; initialEnergy: number; hungerPerSecond: number;
    energyDrainPerSecond: number; sleepRecoveryPerSecond: number;
  };
  care: Record<CareAction, { hunger: number; energy: number; calm: number; mood: Mood; duration: number; message: string }>;
  comments: Record<'hungry' | 'tired' | 'general' | 'irritated', readonly string[]>;
  reactToCare?: (state: Readonly<PetState>, action: CareAction, now: number) => Pick<PetState, 'mood' | 'reactionUntil'>;
}

export const DEFAULT_SPECIES = 'cat';
export const PET_SPECIES = {
  cat: {
    label: 'Cat',
    personality: 'affectionate, playful, mischievous',
    needs: { initialHunger: 18, initialEnergy: 82, hungerPerSecond: 0.005, energyDrainPerSecond: 0.004, sleepRecoveryPerSecond: 0.015 },
    care: {
      feed: { hunger: -35, energy: 3, calm: 8, mood: 'eating', duration: 8000, message: 'A tiny feast. An enormous thank you.' },
      pet: { hunger: 0, energy: 2, calm: 40, mood: 'purring', duration: 12000, message: 'That is the spot. Purrfect.' },
      play: { hunger: 8, energy: -12, calm: 0, mood: 'playing', duration: 18000, message: 'I definitely meant to miss that.' },
    },
    comments: {
      hungry: ['A little snack would make my whiskers very happy.', 'I can smell treats somewhere around here.'],
      tired: ['I think these paws are ready for a cozy rest.', 'Could I borrow a sunny spot for a little nap?'],
      general: ['Could we have a tiny play break?', 'You are my favorite human to supervise.'],
      irritated: ['These paws would appreciate gentler handling.', 'A little less shaking, a little more scritching?'],
    },
  },
} satisfies Record<string, SpeciesDefinition>;

export type SpeciesId = keyof typeof PET_SPECIES;
export function isSpeciesId(value: unknown): value is SpeciesId {
  return typeof value === 'string' && Object.hasOwn(PET_SPECIES, value);
}
export function getSpecies(id: SpeciesId): SpeciesDefinition {
  if (!isSpeciesId(id)) throw new Error('Unsupported pet species.');
  return PET_SPECIES[id];
}
