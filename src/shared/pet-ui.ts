export const CARE_WIDTH = 430;
export const CARE_HEIGHT = 270;
export const CARE_RADIUS = 166;
export const CARE_CENTER_Y = 195;
export const SPEECH_WIDTH = 280;
export const SPEECH_HEIGHT = 104;
export interface UiRect { x: number; y: number; width: number; height: number }

export function careOrbit(index: number, count: number, width = CARE_WIDTH): { x: number; y: number } {
  const radius = Math.min(CARE_RADIUS, (width - 88) / 2);
  const angle = Math.PI + index * Math.PI / (count - 1);
  return { x: width / 2 + Math.cos(angle) * radius, y: CARE_CENTER_Y + Math.sin(angle) * radius };
}

export function petUiBounds(pet: UiRect, area: UiRect, size: number, topInset: number) {
  const center = pet.x + pet.width / 2;
  const head = pet.y + topInset * size;
  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(Math.max(min, max), value));
  const place = (x: number, y: number, width: number, height: number): UiRect => {
    width = Math.min(width, area.width);
    height = Math.min(height, area.height);
    return { x: Math.round(clamp(x, area.x, area.x + area.width - width)),
      y: Math.round(clamp(y, area.y, area.y + area.height - height)), width, height };
  };
  const care = place(center - CARE_WIDTH / 2, head + 96 * size - CARE_CENTER_Y, CARE_WIDTH, CARE_HEIGHT);
  const belowY = pet.y + (topInset + 236) * size + 8;
  const speechBelow = head - SPEECH_HEIGHT - 6 < area.y
    || topInset < 63.99 && belowY + SPEECH_HEIGHT <= area.y + area.height;
  const speech = place(center - SPEECH_WIDTH / 2, speechBelow ? belowY : head - SPEECH_HEIGHT - 6, SPEECH_WIDTH, SPEECH_HEIGHT);
  return { care, speech, speechBelow, speechAnchor: clamp(center - speech.x, 18, speech.width - 18) };
}
