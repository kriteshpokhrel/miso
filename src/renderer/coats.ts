import { DEFAULT_SETTINGS } from '../shared/contracts.js';
import type { CoatColors } from '../shared/contracts.js';

export const COAT_PALETTES: ReadonlyArray<{ id: string; name: string } & Omit<CoatColors, 'coatPattern'>> = [
  { id: 'lilac', name: 'Lilac cream', coatColor: DEFAULT_SETTINGS.coatColor, accentColor: DEFAULT_SETTINGS.accentColor },
  { id: 'cocoa', name: 'Cocoa cream', coatColor: '#79584f', accentColor: '#f4dfc3' },
  { id: 'peach', name: 'Peach milk', coatColor: '#d99576', accentColor: '#fff0d9' },
  { id: 'cloud', name: 'Storm cloud', coatColor: '#565e70', accentColor: '#d8deea' },
];
