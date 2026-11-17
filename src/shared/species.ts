import type { CareAction, Mood, PetState } from './contracts.js';

export interface SpeciesDefinition {
  label: string;
  personality: string;
  affectionLabel: string;
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
    affectionLabel: 'purring',
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
  dog: {
    label: 'Dog',
    personality: 'loyal, bouncy, affectionate, easily delighted',
    affectionLabel: 'happily wagging',
    needs: { initialHunger: 22, initialEnergy: 88, hungerPerSecond: 0.006, energyDrainPerSecond: 0.005, sleepRecoveryPerSecond: 0.017 },
    care: {
      feed: { hunger: -38, energy: 4, calm: 8, mood: 'eating', duration: 8000, message: 'For me? Best day. Best human. Best snack.' },
      pet: { hunger: 0, energy: 3, calm: 40, mood: 'purring', duration: 12000, message: 'My tail has a thank-you of its own.' },
      play: { hunger: 9, energy: -13, calm: 5, mood: 'playing', duration: 18000, message: 'Throw it! Or pretend. I love both.' },
    },
    comments: {
      hungry: ['My nose has detected a possible snack situation.', 'One treat-sized pause, perhaps?'],
      tired: ['Even good dogs need a little snooze.', 'I will guard this cozy spot with my eyes closed.'],
      general: ['You work. I will handle the tail-wagging.', 'A tiny game of fetch would be pretty wonderful.'],
      irritated: ['Gentle carries, please. I am not a maraca.', 'These floppy ears need a steadier ride.'],
    },
  },
  panda: {
    label: 'Panda',
    personality: 'gentle, unhurried, cuddly, quietly curious',
    affectionLabel: 'enjoying a cuddle',
    needs: { initialHunger: 25, initialEnergy: 76, hungerPerSecond: 0.0045, energyDrainPerSecond: 0.003, sleepRecoveryPerSecond: 0.018 },
    care: {
      feed: { hunger: -32, energy: 3, calm: 10, mood: 'eating', duration: 10000, message: 'A slow little munch. A very big thank-you.' },
      pet: { hunger: 0, energy: 2, calm: 45, mood: 'purring', duration: 14000, message: 'This is an excellent arrangement for cuddles.' },
      play: { hunger: 6, energy: -9, calm: 5, mood: 'playing', duration: 15000, message: 'I will catch it. At a thoughtful pace.' },
    },
    comments: {
      hungry: ['Could we schedule a small munch?', 'My next big idea is a little snack.'],
      tired: ['A round bear deserves a round little nap.', 'I have a very important appointment with a pillow.'],
      general: ['No rush. I am quite happy here with you.', 'A little pause can be productive too.'],
      irritated: ['This bear prefers the gentle setting.', 'Less tumbling, more cuddling, please.'],
    },
  },
  octopus: {
    label: 'Octopus',
    personality: 'curious, clever, tender, playfully dramatic',
    affectionLabel: 'curling up happily',
    needs: { initialHunger: 20, initialEnergy: 84, hungerPerSecond: 0.005, energyDrainPerSecond: 0.0045, sleepRecoveryPerSecond: 0.016 },
    care: {
      feed: { hunger: -35, energy: 4, calm: 10, mood: 'eating', duration: 9000, message: 'Eight arms. One very grateful little appetite.' },
      pet: { hunger: 0, energy: 2, calm: 42, mood: 'purring', duration: 12000, message: 'A gentle pat earns an eight-armed hug.' },
      play: { hunger: 7, energy: -11, calm: 5, mood: 'playing', duration: 18000, message: 'I have eight chances to catch this.' },
    },
    comments: {
      hungry: ['All eight arms agree: snack time?', 'A tiny bite for your tiny sea friend?'],
      tired: ['Time to curl these arms into a cozy little pile.', 'Even eight arms cannot outwork a good nap.'],
      general: ['Eight arms, and still only one task at a time.', 'I am lending you a hand. Several, actually.'],
      irritated: ['Eight arms requesting one gentler ride.', 'Please do not scramble the little sea friend.'],
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
