import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('src/renderer');
const destination = path.resolve('dist/renderer');
await mkdir(destination, { recursive: true });
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.name.endsWith('.ts') || entry.name.endsWith('.md')) continue;
  await cp(path.join(source, entry.name), path.join(destination, entry.name), { recursive: true });
}
