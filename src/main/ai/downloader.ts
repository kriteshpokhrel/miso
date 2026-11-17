import { createHash } from 'node:crypto';
import { open, rename, statfs } from 'node:fs/promises';
import { MODEL_INFO, MODEL_SHA256 } from './catalog.js';
import { deleteModelFile, ensureModelDirectory, modelPaths } from './storage.js';

const DOWNLOAD_HOSTS = new Set([
  'huggingface.co',
  'us.aws.cdn.hf.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.huggingface.co',
  'cas-bridge.xethub.hf.co',
]);
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const DISK_MARGIN_BYTES = 32 * 1024 * 1024;
export type FetchModel = (url: string, init: RequestInit) => Promise<Response>;

export function validateDownloadUrl(input: string): URL {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password ||
      (url.port && url.port !== '443') || !DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new Error('Model download redirected to an untrusted source. Retry later.');
  }
  return url;
}

export async function fetchModelResponse(
  signal: AbortSignal,
  fetchModel: FetchModel = fetch,
): Promise<Response> {
  let url = validateDownloadUrl(MODEL_INFO.sourceUrl);
  for (let redirects = 0; redirects <= 5; redirects++) {
    signal.throwIfAborted();
    const response = await fetchModel(url.href, {
      redirect: 'manual',
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'Accept-Encoding': 'identity' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location || redirects === 5) throw new Error('Too many or invalid model redirects. Retry later.');
      url = validateDownloadUrl(new URL(location, url).href);
      continue;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`Model server returned HTTP ${response.status}. Check your connection and retry.`);
    }
    return response;
  }
  throw new Error('Model redirect limit exceeded.');
}

// Small synthetic bodies can exercise the exact production write/verify/promote path.
// Neither URL nor destination filename can come from these expectations.
export async function writeVerifiedModel(
  directory: string,
  response: Response,
  expected: { sizeBytes: number; sha256: string },
  signal: AbortSignal,
  onProgress: (bytes: number) => void = () => {},
): Promise<void> {
  const { model, part } = modelPaths(directory);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let ownsPart = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const abortReader = () => { void reader?.cancel().catch(() => {}); };
  try {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(expected.sizeBytes) || expected.sizeBytes <= 0 ||
        expected.sizeBytes > MODEL_INFO.sizeBytes || !/^[a-f0-9]{64}$/.test(expected.sha256)) {
      throw new Error('Invalid model integrity expectations.');
    }
    const encoding = response.headers.get('content-encoding');
    const length = response.headers.get('content-length');
    if ((encoding && encoding !== 'identity') || !length || !/^\d+$/.test(length) ||
        Number(length) !== expected.sizeBytes || !response.body) {
      throw new Error('Model length or encoding is invalid. No model was installed; retry later.');
    }
    await ensureModelDirectory(directory);
    signal.throwIfAborted();
    // Exclusive create rejects existing files, hardlinks and symlinks.
    handle = await open(part, 'wx', 0o600);
    ownsPart = true;
    reader = response.body.getReader();
    signal.addEventListener('abort', abortReader, { once: true });
    signal.throwIfAborted();
    const hash = createHash('sha256');
    let bytes = 0;
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > expected.sizeBytes) throw new Error('Model exceeds the disclosed download size. Download rejected.');
      hash.update(value);
      let written = 0;
      while (written < value.byteLength) {
        signal.throwIfAborted();
        const result = await handle.write(value, written, value.byteLength - written);
        if (result.bytesWritten === 0) throw new Error('Cannot write model. Check available disk space.');
        written += result.bytesWritten;
      }
      onProgress(bytes);
    }
    if (bytes !== expected.sizeBytes || hash.digest('hex') !== expected.sha256) {
      throw new Error('Model integrity check failed. Nothing installed; check your connection and retry.');
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    signal.throwIfAborted();
    await rename(part, model);
    ownsPart = false;
  } finally {
    signal.removeEventListener('abort', abortReader);
    await reader?.cancel().catch(() => {});
    if (!reader) await response.body?.cancel().catch(() => {});
    await handle?.close();
    if (ownsPart) await deleteModelFile(part);
  }
}

export async function downloadModel(
  directory: string,
  signal: AbortSignal,
  onProgress: (bytes: number) => void,
): Promise<void> {
  await ensureModelDirectory(directory);
  const disk = await statfs(directory);
  if (disk.bavail * disk.bsize < MODEL_INFO.sizeBytes + DISK_MARGIN_BYTES) {
    throw new Error('Not enough disk space. Free at least 133 MiB in application storage and retry.');
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(() => controller.abort(new Error('Download timed out after 15 minutes. Retry on a faster connection.')), DOWNLOAD_TIMEOUT_MS);
  timeout.unref();
  try {
    const response = await fetchModelResponse(controller.signal);
    await writeVerifiedModel(directory, response, {
      sizeBytes: MODEL_INFO.sizeBytes,
      sha256: MODEL_SHA256,
    }, controller.signal, onProgress);
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
