import assert from 'node:assert/strict';
import test from 'node:test';
import { care, createPet, tick } from './pet.js';
import { getSpecies, type SpeciesDefinition } from '../shared/species.js';

test('species strategies override needs, care effects and reactions without changing the engine', () => {
  const original = getSpecies('cat');
  const alternate: SpeciesDefinition = {
    ...original,
    needs: { ...original.needs, hungerPerSecond: 1, energyDrainPerSecond: 2 },
    care: { ...original.care, pet: { ...original.care.pet, energy: 10 } },
    reactToCare: (_state, _action, now) => ({ mood: 'playing', reactionUntil: now + 1234 }),
  };
  const pet = createPet(0);
  const advanced = tick(pet, 1000, alternate);
  assert.equal(advanced.hunger, pet.hunger + 1);
  assert.equal(advanced.energy, pet.energy - 2);
  const reaction = care(pet, 'pet', 0, alternate);
  assert.equal(reaction.energy, pet.energy + 10);
  assert.equal(reaction.mood, 'playing');
  assert.equal(reaction.reactionUntil, 1234);
  assert.equal(care(pet, 'pet', 0).mood, 'purring');
});
