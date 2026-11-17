export type Mood = 'idle' | 'walking' | 'hungry' | 'playing' | 'purring' | 'sleeping' | 'home' | 'mimicking' | 'irritated';
export type CareAction = 'feed' | 'pet' | 'play';
export type CommentFrequency = 'off' | 'quiet' | 'balanced' | 'chatty';
export type CoatPattern = 'single' | 'dual';
export interface CoatColors {
  coatPattern: CoatPattern;
  coatColor: string;
  accentColor: string;
}

export interface PetState {
  species: 'cat';
  hunger: number;
  energy: number;
  mood: Mood;
  atHome: boolean;
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
  launchAtLogin: boolean;
  commentFrequency: CommentFrequency;
  allowedApps: string[];
  aiEnabled: boolean;
  reducedMotion: boolean;
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
  attention: Attention;
}

export interface Attention {
  x: number;
  y: number;
  nearby: boolean;
}

export interface NookiApi {
  getSnapshot(): Promise<Snapshot>;
  care(action: CareAction): Promise<Snapshot>;
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
  openPetMenu(): Promise<void>;
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void;
  onAttention(listener: (attention: Attention) => void): () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  launchAtLogin: true,
  commentFrequency: 'quiet',
  allowedApps: [],
  aiEnabled: false,
  reducedMotion: false,
  petSize: 1,
  breakReminders: true,
  coatPattern: 'dual',
  coatColor: '#bda6df',
  accentColor: '#fff0d9',
};
