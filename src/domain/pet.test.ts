import assert from 'node:assert/strict';
import test from 'node:test';
import type { PetState } from '../shared/contracts.js';
import {
  breakReminder,
  care,
  commentCooldown,
  createPet,
  idleActivity,
  disturb,
  scriptedComment,
  setHome,
  setSleeping,
  shouldFollowCursor,
  tick,
} from './pet.js';

test('a chosen nap stays asleep after recovery, is quiet, and wakes on request', () => {
  const asleep = setSleeping(createPet(0), true, 0);
  const rested = tick(asleep, 3_600_000);
  assert.equal(rested.mood, 'sleeping');
  assert.equal(rested.energy, 100);
  assert.equal(scriptedComment(rested, 'chatty', 3_600_000), null);
  assert.equal(breakReminder({ ...rested, activeTimeMs: 3_600_000 }, true, 'chatty', 3_600_000), null);
  const awake = setSleeping({ ...rested, energy: 5 }, false, 3_600_000);
  assert.equal(awake.manualSleep, false);
  assert.notEqual(tick(awake, 3_601_000).mood, 'sleeping');
  const home = setHome(asleep, true, 0);
  assert.equal(tick(home, 60_000).energy, home.energy);
  assert.equal(setHome(tick(home, 60_000), false, 60_000).mood, 'sleeping');
});

test('idle poses never interrupt care, travel, sleep or home', () => {
  const pet = createPet(0);
  const yawn = idleActivity(pet, 1000, false, 0.1)!;
  assert.equal(yawn.mood, 'yawning');
  assert.equal(tick(yawn, yawn.reactionUntil).mood, 'idle');
  assert.equal(idleActivity(pet, 1000, false, 0.8)!.mood, 'relaxing');
  assert.equal(idleActivity(pet, 1000, true, 0.1), null);
  assert.equal(idleActivity(care(pet, 'feed', 1000), 1000, false, 0.1), null);
  assert.equal(idleActivity(setSleeping(pet, true, 1000), 1000, false, 0.1), null);
  assert.equal(idleActivity(setHome(pet, true, 1000), 1000, false, 0.1), null);
});

test('createPet starts with bounded needs and the supplied clock', () => {
  const pet = createPet(1_234);

  assert.equal(pet.species, 'cat');
  assert.equal(pet.lastTickAt, 1_234);
  assert.equal(pet.hunger, 18);
  assert.equal(pet.energy, 82);
  assert.equal(pet.mood, 'idle');
  assert.equal(pet.disturbance, 0);
  assert.equal(pet.lastDisturbedAt, 0);
  assert.equal(pet.activeTimeMs, 0);
  assert.equal(pet.lastBreakReminderAt, 0);
});

test('tick advances needs by elapsed time and clamps them', () => {
  const pet = createPet(0);
  const oneMinute = tick(pet, 60_000);

  assert.equal(oneMinute.hunger, 18.3);
  assert.equal(oneMinute.energy, 81.76);

  const longElapsed = tick(oneMinute, Number.MAX_SAFE_INTEGER);
  assert.equal(longElapsed.hunger, 100);
  assert.ok(longElapsed.energy >= 0 && longElapsed.energy <= 100);
  assert.ok(['hungry', 'sleeping'].includes(longElapsed.mood));
});

test('low-energy cats sleep and recover energy', () => {
  const sleeping = { ...createPet(0), energy: 0, mood: 'sleeping' as const };
  const rested = tick(sleeping, 60_000);

  assert.equal(rested.mood, 'sleeping');
  assert.ok(Math.abs(rested.energy - 0.9) < 1e-10);
});

test('sleep persists through repeated ticks until the wake threshold', () => {
  let pet: PetState = { ...createPet(0), energy: 12, mood: 'sleeping' };

  for (let second = 1; second <= 1_000; second += 1) {
    pet = tick(pet, second * 1_000);
    assert.equal(pet.mood, 'sleeping');
  }
  assert.ok(pet.energy > 12 && pet.energy < 60);

  for (let second = 1_001; pet.mood === 'sleeping'; second += 1) {
    pet = tick(pet, second * 1_000);
  }
  assert.ok(pet.energy >= 60 - 0.004);
  assert.notEqual(pet.mood, 'sleeping');
});

test('tick ignores invalid and backwards clocks without rewinding state', () => {
  const pet = tick(createPet(10_000), 20_000);

  assert.equal(tick(pet, 19_999), pet);
  assert.equal(tick(pet, Number.NaN), pet);
  assert.equal(pet.lastTickAt, 20_000);
});

test('home pauses needs and restoration does not catch up elapsed home time', () => {
  const away = createPet(0);
  const atHome = setHome(away, true, 60_000);
  const stillHome = tick(atHome, 3_600_000);
  const restored = setHome(stillHome, false, 3_600_000);
  const afterOneAwayMinute = tick(restored, 3_660_000);

  assert.equal(atHome.mood, 'home');
  assert.equal(stillHome.hunger, atHome.hunger);
  assert.equal(stillHome.energy, atHome.energy);
  assert.equal(afterOneAwayMinute.hunger, atHome.hunger + 0.3);
  assert.equal(afterOneAwayMinute.lastTickAt, 3_660_000);
});

test('care changes needs and starts bounded reactions that expire', () => {
  const fed = care(createPet(0), 'feed', 0);
  assert.equal(fed.hunger, 0);
  assert.equal(fed.mood, 'eating');
  assert.equal(fed.reactionUntil, 8_000);

  const expired = tick(fed, 8_000);
  assert.equal(expired.mood, 'idle');
  assert.equal(expired.reactionUntil, 0);

  const played = care(createPet(0), 'play', 0);
  assert.equal(played.hunger, 26);
  assert.equal(played.energy, 70);
  assert.equal(played.mood, 'playing');
});

test('hungry cats follow the cursor unless they are home or asleep', () => {
  const hungry = { ...createPet(0), hunger: 70 };
  assert.equal(shouldFollowCursor(hungry), true);
  assert.equal(shouldFollowCursor({ ...hungry, atHome: true }), false);
  assert.equal(shouldFollowCursor({ ...hungry, mood: 'sleeping' }), false);
  assert.equal(shouldFollowCursor({ ...hungry, hunger: 69.99 }), false);
});

test('comments are scripted, deterministic, and disabled by frequency', () => {
  const pet = createPet(0);
  const eligiblePet = { ...pet, lastCommentAt: 0 };
  assert.equal(scriptedComment(eligiblePet, 'off', 120_000), null);
  assert.equal(
    scriptedComment({ ...eligiblePet, hunger: 70 }, 'balanced', 120_000, 0),
    'A little snack would make my whiskers very happy.',
  );
  assert.equal(
    scriptedComment({ ...eligiblePet, energy: 30 }, 'balanced', 120_000, 0),
    'I think these paws are ready for a cozy rest.',
  );
  assert.equal(scriptedComment(eligiblePet, 'balanced', Number.NaN), null);
  assert.equal(scriptedComment({ ...eligiblePet, atHome: true }, 'chatty', 120_000), null);
  assert.notEqual(
    scriptedComment(eligiblePet, 'quiet', 120_000),
    scriptedComment(eligiblePet, 'quiet', 240_000),
  );
  assert.equal(commentCooldown('off'), Number.POSITIVE_INFINITY);
  assert.ok(commentCooldown('quiet') > commentCooldown('balanced'));
  assert.ok(commentCooldown('balanced') > commentCooldown('chatty'));
});

test('comment cooldown blocks recent comments and allows the exact boundary', () => {
  const pet = { ...createPet(0), lastCommentAt: 1_000 };

  assert.equal(scriptedComment(pet, 'balanced', 1_000), null);
  assert.equal(scriptedComment(pet, 'balanced', 60_999), null);
  assert.notEqual(scriptedComment(pet, 'balanced', 61_000), null);
  assert.equal(scriptedComment({ ...pet, atHome: true }, 'balanced', 61_000), null);
  assert.equal(scriptedComment(pet, 'off', 61_000), null);
});

test('disturbance builds per drag, decays by half-life, and is bounded', () => {
  const disturbed = disturb(createPet(0), 100, 0);
  assert.equal(disturbed.disturbance, 10);
  assert.equal(disturbed.lastDisturbedAt, 0);

  const decayed = tick(disturbed, 25_000);
  assert.equal(decayed.disturbance, 5);

  const capped = disturb({ ...createPet(0), disturbance: 99 }, 100_000, 0);
  assert.equal(capped.disturbance, 100);
});

test('repeated dragging triggers a temporary irritated reaction with playful comments', () => {
  let pet = createPet(0);
  for (let drag = 0; drag < 10; drag += 1) pet = disturb(pet, 0, 60_000);

  assert.equal(pet.disturbance, 60);
  assert.equal(pet.mood, 'irritated');
  assert.equal(pet.reactionUntil, 72_000);
  assert.match(scriptedComment(pet, 'balanced', 60_000) ?? '', /gentler|scritching/i);

  const active = tick(pet, 71_999);
  assert.equal(active.mood, 'irritated');
  assert.equal(tick(active, 72_000).mood, 'idle');
});

test('invalid distances and dragging at home do not add disturbance', () => {
  const pet = createPet(0);

  assert.equal(disturb(pet, Number.NaN, 1_000), pet);
  assert.equal(disturb(pet, -1, 1_000), pet);
  assert.equal(disturb({ ...pet, atHome: true }, 50, 1_000).disturbance, 0);
});

test('petting calms disturbance substantially and feeding reduces it slightly', () => {
  const unsettled = { ...createPet(0), disturbance: 80 };

  assert.equal(care(unsettled, 'pet', 0).disturbance, 40);
  assert.equal(care(unsettled, 'feed', 0).disturbance, 72);
});

test('mimicking and irritated moods persist only through their reaction windows', () => {
  const mimicking = {
    ...createPet(0),
    mood: 'mimicking' as const,
    reactionUntil: 10_000,
  };

  assert.equal(tick(mimicking, 9_999).mood, 'mimicking');
  assert.equal(tick(mimicking, 10_000).mood, 'idle');
});

test('active time advances away and pauses at home', () => {
  const active = tick(createPet(0), 20 * 60 * 1_000);
  const atHome = setHome(active, true, 20 * 60 * 1_000);
  const stillHome = tick(atHome, 80 * 60 * 1_000);
  const restored = setHome(stillHome, false, 80 * 60 * 1_000);
  const resumed = tick(restored, 105 * 60 * 1_000);

  assert.equal(active.activeTimeMs, 20 * 60 * 1_000);
  assert.equal(stillHome.activeTimeMs, active.activeTimeMs);
  assert.equal(resumed.activeTimeMs, 45 * 60 * 1_000);
});

test('break reminders require 45 active minutes and obey home, setting, and comment cooldowns', () => {
  const duePet = tick(createPet(0), 45 * 60 * 1_000);
  assert.notEqual(breakReminder(duePet, true, 'balanced', 45 * 60 * 1_000), null);
  assert.equal(
    breakReminder({ ...duePet, activeTimeMs: duePet.activeTimeMs - 1 }, true, 'balanced', 45 * 60 * 1_000),
    null,
  );
  assert.equal(breakReminder({ ...duePet, atHome: true }, true, 'balanced', 45 * 60 * 1_000), null);
  assert.equal(breakReminder(duePet, false, 'balanced', 45 * 60 * 1_000), null);
  assert.equal(breakReminder(duePet, true, 'off', 45 * 60 * 1_000), null);
  assert.equal(
    breakReminder({ ...duePet, lastCommentAt: 45 * 60 * 1_000 - 59_999 }, true, 'balanced', 45 * 60 * 1_000),
    null,
  );
  assert.notEqual(
    breakReminder({ ...duePet, lastCommentAt: 45 * 60 * 1_000 - 60_000 }, true, 'balanced', 45 * 60 * 1_000),
    null,
  );
  assert.equal(
    breakReminder(
      { ...duePet, lastBreakReminderAt: duePet.activeTimeMs },
      true,
      'balanced',
      45 * 60 * 1_000,
    ),
    null,
  );
});
