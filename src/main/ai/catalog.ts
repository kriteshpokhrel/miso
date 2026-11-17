import type { ModelInfo } from '../../shared/contracts.js';

// Hugging Face model API (including LFS metadata) verified 2026-11-17.
export const MODEL_REVISION = '09816acd5d99df7be770d85ea30822623dab342c';
export const MODEL_FILENAME = 'SmolLM2-135M-Instruct-Q4_K_M.gguf';
export const MODEL_SHA256 = '2e8040ceae7815abe0dcb3540b9995eaa1fa0d2ca9e797d0a635ae4433c68c2d';
export const MODEL_INFO: ModelInfo = Object.freeze({
  id: 'smollm2-135m-instruct-q4-k-m',
  name: 'SmolLM2 135M Instruct (Q4_K_M)',
  sizeBytes: 105_454_432,
  license: 'Apache-2.0',
  licenseUrl: 'https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/blob/12fd25f77366fa6b3b4b768ec3050bf629380bac/README.md',
  sourceUrl: `https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/${MODEL_REVISION}/${MODEL_FILENAME}`,
  resourceNote: 'Optional 105.5 MB download (100.6 MiB). Apache-2.0. CPU only; at most 2 threads, 512-token context and 48 output tokens. Download needs about 133 MiB free disk; inference checks for 512 MiB free RAM. Actual process memory varies, not a hard memory cap. Small English model: comments may be inaccurate. Requires a bundled compatible native binary; Windows/macOS support depends on architecture and packaging. No runtime builds or binary downloads.',
});
