import { DEFAULT_SPECIES, type SpeciesId } from './species.js';

export type Mood = 'idle' | 'walking' | 'hungry' | 'eating' | 'playing' | 'purring' | 'sleeping' | 'relaxing' | 'yawning' | 'home' | 'mimicking' | 'irritated';
export type CareAction = 'feed' | 'pet' | 'play';
export type CommentFrequency = 'off' | 'quiet' | 'balanced' | 'chatty';
export type CoatPattern = 'single' | 'dual';
export type MotionLevel = 'still' | 'gentle' | 'lively';
export interface PetMotion {
  state: 'idle' | 'walking' | 'hopping' | 'falling' | 'dragging' | 'home-arriving' | 'home-entering' | 'home-leaving';
  direction: -1 | 1;
  speed: number;
  progress: number;
  topInset?: number;
}
export const IDLE_MOTION: Readonly<PetMotion> = Object.freeze({ state: 'idle', direction: 1, speed: 0, progress: 0 });
export interface CoatColors {
  coatPattern: CoatPattern;
  coatColor: string;
  accentColor: string;
}

export interface PetState {
  species: SpeciesId;
  hunger: number;
  energy: number;
  mood: Mood;
  atHome: boolean;
  manualSleep: boolean;
  lastTickAt: number;
  lastInteractionAt: number;
  lastCommentAt: number;
  reactionUntil: number;
  disturbance: number;
  lastDisturbedAt: number;
  activeTimeMs: number;
  lastBreakReminderAt: number;
}

export interface Settings extends CoatColors {
  petSpecies: SpeciesId;
  launchAtLogin: boolean;
  commentFrequency: CommentFrequency;
  allowedApps: string[];
  aiEnabled: boolean;
  motionLevel: MotionLevel;
  followWindow: boolean;
  stayPut: boolean;
  petSize: number;
  breakReminders: boolean;
}

export type ModelPhase = 'not-installed' | 'downloading' | 'ready' | 'loading' | 'error';
export interface ModelStatus {
  phase: ModelPhase;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}
export interface ModelInfo {
  id: string;
  name: string;
  sizeBytes: number;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  resourceNote: string;
}

export interface Snapshot {
  pet: PetState;
  settings: Settings;
  model: ModelStatus;
  modelInfo: ModelInfo;
  comment: string | null;
  error: string | null;
  platform: string;
  packaged: boolean;
  moving: boolean;
  careMenuOpen: boolean;
  speechBelow: boolean;
  speechAnchor: number;
  attention: Attention;
  motion: PetMotion;
  systemReducedMotion: boolean;
  windowFollowing: string;
}

export interface Attention {
  x: number;
  y: number;
  nearby: boolean;
}

export interface MisoApi {
  getSnapshot(): Promise<Snapshot>;
  care(action: CareAction): Promise<Snapshot>;
  setSleeping(asleep: boolean): Promise<Snapshot>;
  setCareMenuOpen(open: boolean, restoreFocus?: boolean): Promise<void>;
  setStayPut(stay: boolean): Promise<Snapshot>;
  setFollowing(follow: boolean): Promise<Snapshot>;
  goHome(): Promise<void>;
  restore(): Promise<void>;
  openSettings(): Promise<void>;
  updateSettings(settings: Settings): Promise<Snapshot>;
  downloadModel(consent: boolean): Promise<void>;
  cancelModelDownload(): Promise<void>;
  removeModel(): Promise<void>;
  startDrag(): Promise<void>;
  dragPet(): Promise<void>;
  endDrag(): Promise<void>;
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void;
  onAttention(listener: (attention: Attention) => void): () => void;
  onMotion(listener: (motion: PetMotion) => void): () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  petSpecies: DEFAULT_SPECIES,
  launchAtLogin: true,
  commentFrequency: 'quiet',
  allowedApps: [],
  aiEnabled: false,
  motionLevel: 'gentle',
  followWindow: true,
  stayPut: false,
  petSize: 1,
  breakReminders: true,
  coatPattern: 'dual',
  coatColor: '#bda6df',
  accentColor: '#fff0d9',
};
