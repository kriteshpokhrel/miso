import type { Mood, PetState } from '../../shared/contracts.js';
import { getSpecies, isSpeciesId, type SpeciesId } from '../../shared/species.js';
import { MAX_SPEECH_LENGTH } from '../../shared/speech.js';

const MOODS: readonly Mood[] = ['idle', 'walking', 'hungry', 'eating', 'playing', 'purring', 'sleeping', 'relaxing', 'yawning', 'home', 'mimicking', 'irritated'];
export function petPersonality(species: SpeciesId): string {
  const definition = getSpecies(species);
  return `You are Miso, a pet ${definition.label.toLowerCase()}. Your personality is ${definition.personality}. Write one gentle English sentence, at most ${MAX_SPEECH_LENGTH} characters, about the app name or your own needs. Never give advice or claim to read files, titles, messages or documents. Return only the sentence, without formatting.`;
}

export function normalizeAppName(appName: unknown): string | null {
  if (typeof appName !== 'string') return null;
  const normalized = appName.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9 ._+-]{0,62}$/.test(normalized) || normalized.includes('..')) return null;
  return normalized;
}

export function buildPetPrompt(appName: string, pet: PetState): string | null {
  const app = normalizeAppName(appName);
  if (!app || !pet || !isSpeciesId(pet.species) || pet.atHome !== false ||
      !MOODS.includes(pet.mood) || pet.mood === 'home' ||
      !Number.isFinite(pet.hunger) || !Number.isFinite(pet.energy)) return null;
  // Deliberately project individual scalar fields. Never serialize the caller's object.
  return JSON.stringify({
    app,
    species: pet.species,
    mood: pet.mood,
    hunger: Math.round(Math.max(0, Math.min(100, pet.hunger))),
    energy: Math.round(Math.max(0, Math.min(100, pet.energy))),
  });
}

function commentWords(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+(?:[.'’-][\p{L}\p{N}]+)*/gu) ?? [];
}

function hasRepeatedPhrase(words: string[]): boolean {
  for (let size = 1; size <= Math.floor(words.length / 2); size++) {
    const repetitions = size === 1 ? 3 : 2;
    for (let start = 0; start + size * repetitions <= words.length; start++) {
      let matches = true;
      for (let offset = size; offset < size * repetitions; offset++) {
        if (words[start + offset] !== words[start + offset % size]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }
  }
  return false;
}

function hasAssistantBoilerplate(text: string): boolean {
  return /^(?:assistant|system(?: prompt)?|user|human|developer|instructions?|response|answer)\s*:/i.test(text) ||
    /\b(?:ai[- ]assistant|(?:large )?language model|artificial intelligence|chatgpt|llm)\b/i.test(text) ||
    /\b(?:i['’]m|i am|as)\s+(?:an?\s+)?(?:(?:virtual|digital|helpful|ai(?:-powered)?)\s+)?assistant\b/i.test(text) ||
    /\b(?:i['’]m|i am|as)\s+(?:an?\s+)?ai\b/i.test(text) ||
    /\b(?:how (?:can|may) i (?:help|assist) you|assist(?:ing)? users|provid(?:e|ing) helpful information|answer(?:ing)? your (?:questions|inquiries))\b/i.test(text);
}

export function cleanComment(value: string): string | null {
  if (/<\|(?:im_start|im_end|start_header_id|end_header_id|assistant|system|user)\|>|\[\/?INST\]|<<\/?SYS>>/i.test(value)) return null;
  const plain = value.replace(/<[^>]*>/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[*`#_[\]]/g, '');
  const lines = plain.split('\n').map((line) => commentWords(line).join(' ')).filter(Boolean);
  if (new Set(lines).size !== lines.length) return null;
  let text = plain.replace(/\s+/g, ' ').trim();
  // Reject rather than truncate: a cut-off quote/phrase is not a successful comment.
  if (!text || text.length > MAX_SPEECH_LENGTH || !/\p{L}/u.test(text) ||
      /([\p{L}\p{N}!?.,])\1{7,}/iu.test(text) ||
      (text.match(/"/g)?.length ?? 0) % 2 !== 0 ||
      (text.match(/“/g)?.length ?? 0) !== (text.match(/”/g)?.length ?? 0) ||
      (text.startsWith("'") && !text.endsWith("'"))) return null;
  const words = commentWords(text);
  if (hasRepeatedPhrase(words) || words.length >= 8 && new Set(words).size / words.length <= 0.4) return null;
  if ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith('“') && text.endsWith('”')) ||
      (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  if (hasAssistantBoilerplate(text)) return null;
  return text || null;
}
