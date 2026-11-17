import assert from 'node:assert/strict';
import test from 'node:test';
import { homeBeat, irritationBeat } from './reactions.js';

test('the harmless threat and affectionate reassurance are separate timed beats', () => {
  assert.equal(irritationBeat(0).mood, 'irritated');
  assert.doesNotMatch(irritationBeat(0).text, /teasing|safe/);
  assert.equal(irritationBeat(4999).mood, 'irritated');
  assert.equal(irritationBeat(5000).mood, 'purring');
  assert.match(irritationBeat(5000).text, /windows are safe/);
  assert.equal(irritationBeat(7199).done, false);
  assert.equal(irritationBeat(7200).done, true);
});

test('home first appears, then admits the pet, then leaves right before hiding', () => {
  assert.equal(homeBeat(0).state, 'home-arriving');
  assert.equal(homeBeat(500).state, 'home-entering');
  assert.equal(homeBeat(3499).done, false);
  assert.equal(homeBeat(3500).state, 'home-leaving');
  assert.equal(homeBeat(4299).done, false);
  assert.deepEqual(homeBeat(4300), { state: 'home-leaving', progress: 1, done: true });
});
