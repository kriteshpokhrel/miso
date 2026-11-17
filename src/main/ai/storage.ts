import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, unlink } from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { MODEL_FILENAME, MODEL_INFO, MODEL_SHA256 } from './catalog.js';

export function modelPaths(directory: string): { model: string; part: string } {
  if (!isAbsolute(directory) || resolve(directory) === parse(directory).root) {
    throw new Error('Choose a dedicated absolute model directory in the application data folder.');
  }
  return { model: join(directory, MODEL_FILENAME), part: join(directory, `${MODEL_FILENAME}.part`) };
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

export async function ensureModelDirectory(directory: string): Promise<void> {
  modelPaths(directory);
  const root = parse(resolve(directory)).root;
  const parts = relative(root, resolve(directory)).split(sep);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('Model storage must be a real directory, not a symlink or junction.');
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (creationError) {
        if ((creationError as NodeJS.ErrnoException)?.code !== 'EEXIST') throw creationError;
      }
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('Unsafe model storage directory; select a private application data folder.');
      }
    }
  }
}

export async function deleteModelFile(path: string): Promise<void> {
  try {
    // unlink removes a link itself, never its target. Never recursively delete storage.
    await unlink(path);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

export async function verifyInstalledModel(directory: string, signal?: AbortSignal): Promise<boolean> {
  const { model } = modelPaths(directory);
  let info;
  try {
    info = await lstat(model);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || info.size !== MODEL_INFO.sizeBytes) {
    throw new Error('Installed model is unsafe or incomplete. Remove it and download again.');
  }
  const handle = await open(model, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (opened.dev !== info.dev || opened.ino !== info.ino || opened.size !== info.size) {
      throw new Error('Model changed during verification. Remove it and download again.');
    }
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(256 * 1024);
    let bytes = 0;
    while (true) {
      signal?.throwIfAborted();
      const result = await handle.read(buffer, 0, buffer.length, null);
      if (result.bytesRead === 0) break;
      bytes += result.bytesRead;
      if (bytes > MODEL_INFO.sizeBytes) throw new Error('Installed model is oversized. Remove it and retry.');
      hash.update(buffer.subarray(0, result.bytesRead));
    }
    signal?.throwIfAborted();
    if (bytes !== MODEL_INFO.sizeBytes || hash.digest('hex') !== MODEL_SHA256) {
      throw new Error('Model integrity check failed. Remove it and download again.');
    }
    return true;
  } finally {
    await handle.close();
  }
}
