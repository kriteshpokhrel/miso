import assert from 'node:assert/strict';
import test from 'node:test';
import { createDragStress, sampleDrag } from './drag-stress.js';
import { addDisturbance, createPet } from './pet.js';

test('ordinary carrying adds little disturbance, repeated fast reversals react before release', () => {
  let stress = createDragStress(0);
  let pet = createPet(0);
  for (let index = 1; index <= 10; index++) {
    const next = sampleDrag(stress, 10, 0, index * 100);
    stress = next.stress;
    pet = addDisturbance(pet, next.score, index * 100);
  }
  assert.ok(pet.disturbance < 3);
  for (let index = 11; index <= 16; index++) {
    const next = sampleDrag(stress, index % 2 ? 80 : -80, 0, index * 100);
    stress = next.stress;
    pet = addDisturbance(pet, next.score, index * 100);
  }
  assert.equal(pet.mood, 'irritated');
  assert.ok(pet.reactionUntil > 1600);
});
