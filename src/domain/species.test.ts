import assert from 'node:assert/strict';
import test from 'node:test';
import { care, createPet, setHome, setSleeping, scriptedComment, tick } from './pet.js';
import { getSpecies, PET_SPECIES, type SpeciesDefinition, type SpeciesId } from '../shared/species.js';

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

test('every implemented species uses its own needs and care without losing sleep or Home guarantees', () => {
  for (const species of Object.keys(PET_SPECIES) as SpeciesId[]) {
    const definition = getSpecies(species);
    const pet = createPet(0, species);
    const advanced = tick(pet, 1000);
    assert.equal(advanced.hunger, pet.hunger + definition.needs.hungerPerSecond);
    assert.equal(advanced.energy, pet.energy - definition.needs.energyDrainPerSecond);
    assert.ok(care(pet, 'feed', 0).hunger < pet.hunger);
    assert.equal(care(pet, 'pet', 0).mood, 'purring');
    assert.equal(care(pet, 'play', 0).mood, 'playing');
    const sleeping = tick(setSleeping(pet, true, 0), 120_000);
    assert.equal(sleeping.mood, 'sleeping');
    assert.ok(sleeping.energy > pet.energy);
    const home = tick(setHome(pet, true, 0), 120_000);
    assert.equal(home.hunger, pet.hunger);
    assert.equal(home.energy, pet.energy);
    const hungry = { ...pet, hunger: 90 };
    assert.equal(scriptedComment(hungry, 'quiet', 120_000, 0), definition.comments.hungry[0]);
  }
});
