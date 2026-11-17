import { freemem } from 'node:os';
import type { ModelStatus, PetState } from '../../shared/contracts.js';
import { MODEL_INFO } from './catalog.js';
import { downloadModel } from './downloader.js';
import { buildCatPrompt, CAT_PERSONALITY, cleanComment } from './prompt.js';
import { deleteModelFile, ensureModelDirectory, modelPaths, verifyInstalledModel } from './storage.js';

export { MODEL_INFO } from './catalog.js';

export class LocalAiService {
  private status: ModelStatus = { phase: 'not-installed', downloadedBytes: 0, totalBytes: MODEL_INFO.sizeBytes };
  private queue: Promise<void> = Promise.resolve();
  private maintenance = 0;
  private installed = false;
  private downloadController?: AbortController;
  private downloadTask?: Promise<void>;
  private inferenceController?: AbortController;
  private inferenceTask?: Promise<string | null>;

  constructor(
    private readonly modelDirectory: string,
    private readonly onStatus: (status: ModelStatus) => void,
  ) {}

  getStatus(): ModelStatus { return { ...this.status }; }

  private update(status: ModelStatus): void {
    this.status = status;
    try {
      this.onStatus(this.getStatus());
    } catch (error) {
      console.error('[Nooki AI] Optional status observer failed; core pet behavior continues.', error);
    }
  }

  private idle(): void {
    this.update({
      phase: this.installed ? 'ready' : 'not-installed',
      downloadedBytes: this.installed ? MODEL_INFO.sizeBytes : 0,
      totalBytes: MODEL_INFO.sizeBytes,
    });
  }

  private fail(error: unknown, fallback: string): void {
    const detail = error instanceof Error ? error.message : '';
    this.update({ ...this.status, phase: 'error', error: `${fallback}${detail ? ` ${detail.slice(0, 300)}` : ''}` });
  }

  private exclusive(operation: () => Promise<void>): Promise<void> {
    this.maintenance++;
    const task = this.queue.then(operation).finally(() => { this.maintenance--; });
    this.queue = task.catch((error: unknown) => {
      console.error('[Nooki AI] Optional model maintenance failed; core pet behavior continues.', error);
      this.fail(error, 'Local AI maintenance failed. Restart Nooki or remove the model; scripted behavior remains available.');
    });
    return task;
  }

  initialize(): Promise<void> {
    return this.exclusive(async () => {
      try {
        await ensureModelDirectory(this.modelDirectory);
        await deleteModelFile(modelPaths(this.modelDirectory).part);
        this.installed = await verifyInstalledModel(this.modelDirectory);
        this.idle();
      } catch (error) {
        this.installed = false;
        this.fail(error, 'Cannot verify local model. Remove it and download again.');
      }
    });
  }

  download(consent: boolean): Promise<void> {
    if (consent !== true) {
      if (!this.downloadTask) this.fail(null, 'Download requires explicit consent to the displayed model size, source and Apache-2.0 license.');
      return Promise.resolve();
    }
    if (this.downloadTask) return this.downloadTask;
    const controller = new AbortController();
    this.downloadController = controller;
    this.inferenceController?.abort();
    const task = this.exclusive(async () => {
      await this.inferenceTask;
      try {
        controller.signal.throwIfAborted();
        await ensureModelDirectory(this.modelDirectory);
        this.installed = false;
        if (await verifyInstalledModel(this.modelDirectory, controller.signal)) {
          this.installed = true;
          this.idle();
          return;
        }
        await deleteModelFile(modelPaths(this.modelDirectory).part);
        this.update({ phase: 'downloading', downloadedBytes: 0, totalBytes: MODEL_INFO.sizeBytes });
        await downloadModel(this.modelDirectory, controller.signal, (bytes) => {
          this.update({ phase: 'downloading', downloadedBytes: bytes, totalBytes: MODEL_INFO.sizeBytes });
        });
        this.installed = true;
        this.idle();
      } catch (error) {
        if (controller.signal.aborted) this.idle();
        else this.fail(error, 'Local model download failed. Check connection, storage permissions and free space, then retry.');
      }
    }).finally(() => {
      if (this.downloadController === controller) this.downloadController = undefined;
      if (this.downloadTask === task) this.downloadTask = undefined;
    });
    this.downloadTask = task;
    return task;
  }

  async cancelDownload(): Promise<void> {
    this.downloadController?.abort();
    await this.downloadTask;
  }

  remove(): Promise<void> {
    this.downloadController?.abort();
    this.inferenceController?.abort();
    return this.exclusive(async () => {
      await this.inferenceTask;
      try {
        await ensureModelDirectory(this.modelDirectory);
        const paths = modelPaths(this.modelDirectory);
        await deleteModelFile(paths.part);
        await deleteModelFile(paths.model);
        this.installed = false;
        this.idle();
      } catch (error) {
        this.installed = false;
        this.fail(error, 'Cannot remove local model. Close other users of the file and check storage permissions.');
      }
    });
  }

  generate(appName: string, pet: PetState): Promise<string | null> {
    // Main must first check aiEnabled and exact normalized membership of allowedApps.
    const prompt = buildCatPrompt(appName, pet);
    if (!prompt || this.maintenance || this.inferenceTask || !this.installed || this.status.phase !== 'ready') {
      return Promise.resolve(null);
    }
    const controller = new AbortController();
    this.inferenceController = controller;
    const task = this.infer(prompt, controller).finally(() => {
      if (this.inferenceController === controller) this.inferenceController = undefined;
      if (this.inferenceTask === task) this.inferenceTask = undefined;
    });
    this.inferenceTask = task;
    return task;
  }

  private async infer(prompt: string, controller: AbortController): Promise<string | null> {
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(new Error('Local inference timed out. Scripted comments remain available.')), 12_000);
    timeout.unref();
    const resources: Array<{ dispose(): void | Promise<void> }> = [];
    try {
      if (freemem() < 512 * 1024 * 1024) throw new Error('Free at least 512 MiB of RAM to use local comments.');
      this.update({ phase: 'loading', downloadedBytes: MODEL_INFO.sizeBytes, totalBytes: MODEL_INFO.sizeBytes });
      this.installed = false;
      if (!await verifyInstalledModel(this.modelDirectory, signal)) {
        throw new Error('Model file is missing. Download it again.');
      }
      this.installed = true;
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
      signal.throwIfAborted();
      const llama = await getLlama({
        build: 'never', skipDownload: true, gpu: false, maxThreads: 2,
        progressLogs: false, logger: () => {},
      });
      resources.unshift(llama);
      signal.throwIfAborted();
      const model = await llama.loadModel({
        modelPath: modelPaths(this.modelDirectory).model, gpuLayers: 0, loadSignal: signal,
      });
      resources.unshift(model);
      signal.throwIfAborted();
      const context = await model.createContext({
        contextSize: 512, batchSize: 64, sequences: 1, threads: 2, createSignal: signal,
      });
      resources.unshift(context);
      signal.throwIfAborted();
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: CAT_PERSONALITY,
        autoDisposeSequence: true,
      });
      resources.unshift(session);
      const result = await session.prompt(prompt, {
        signal, maxTokens: 48, temperature: 0.7, trimWhitespaceSuffix: true,
      });
      signal.throwIfAborted();
      return cleanComment(result);
    } catch (error) {
      if (!signal.aborted || signal.reason instanceof Error && signal.reason.name !== 'AbortError') {
        this.fail(error, 'Local comments unavailable. A compatible bundled CPU binary is required; scripted comments still work.');
      }
      return null;
    } finally {
      clearTimeout(timeout);
      for (const resource of resources) {
        try {
          await resource.dispose();
        } catch (error) {
          console.error('[Nooki AI] Failed to release optional inference resources; core pet behavior continues.', error);
          this.fail(error, 'Could not fully release local AI resources. Restart Nooki to reclaim them; scripted behavior remains available.');
        }
      }
      // No history, model, context or native backend is retained between requests.
      if (this.status.phase === 'loading') this.idle();
    }
  }

  // Reusable: main calls this on disable/home; enabling again may generate without re-downloading.
  dispose(): Promise<void> {
    this.downloadController?.abort();
    this.inferenceController?.abort();
    return this.exclusive(async () => {
      await this.inferenceTask;
      this.idle();
    });
  }
}
