import { createCatModel } from './cat-model.js';
import { createQuadrupedModel } from './quadruped-model.js';
import { createOctopusModel } from './octopus-model.js';
import type { PetModel } from './pet-model.js';
import type { SpeciesId } from '../shared/species.js';

const factories: Record<SpeciesId, () => PetModel> = {
  cat: createCatModel,
  dog: () => createQuadrupedModel('dog'),
  panda: () => createQuadrupedModel('panda'),
  octopus: createOctopusModel,
};

export function createPetModel(species: SpeciesId): PetModel {
  const factory = factories[species];
  if (!factory) throw new Error(`No artwork is installed for species: ${species}`);
  return factory();
}
