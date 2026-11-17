import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PetState, Settings } from '../shared/contracts.js';
import { validatePet, validateSettings } from './validation.js';

export interface SavedState { version: 1; settings: Settings; pet: PetState }

export class StateStore {
  private readonly file: string;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {
    this.file = path.join(directory, 'state.json');
  }

  async load(): Promise<{ state: SavedState | null; error: string | null }> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: null, error: null };
      throw error;
    }
    try {
      const decoded: unknown = JSON.parse(raw);
      if (typeof decoded !== 'object' || decoded === null) throw new Error('Invalid saved state.');
      const value = decoded as Record<string, unknown>;
      if (value.version !== 1) throw new Error('Unsupported settings version.');
      return {
        state: { version: 1, settings: validateSettings(value.settings), pet: validatePet(value.pet) },
        error: null,
      };
    } catch (error) {
      const backup = `state.corrupt-${Date.now()}.json`;
      await rename(this.file, path.join(this.directory, backup));
      console.error('Miso preserved unreadable state:', error);
      return { state: null, error: `Saved settings could not be read. The original was preserved as ${backup}; defaults were restored.` };
    }
  }

  save(state: SavedState): Promise<void> {
    const data = JSON.stringify(state, null, 2);
    const operation = this.pending.then(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await writeFile(`${this.file}.tmp`, data, { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
    });
    this.pending = operation.catch((error: unknown) => {
      console.error('Miso state write failed:', error);
    });
    return operation;
  }
}
