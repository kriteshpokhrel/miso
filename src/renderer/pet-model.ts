import type { Object3D } from 'three';
import type { Attention, CoatColors, Mood, PetMotion } from '../shared/contracts.js';

export interface CharacterPose {
  mood: Mood;
  moving: boolean;
  speaking: boolean;
  reducedMotion: boolean;
  attention: Attention;
  motion?: PetMotion;
}

export interface PetModel {
  root: Object3D;
  pose(state: CharacterPose, elapsed: number, delta?: number): void;
  setAppearance(colors: CoatColors): void;
  diagnostics(): { lookX: number; lookY: number; facing: number; color: string; accent: string; foodVisible: boolean; homeVisible: boolean };
  dispose(): void;
}
