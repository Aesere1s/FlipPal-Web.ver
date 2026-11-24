import presetsFile from '../data/ocPresets.json';
import type { OCPartKind, OCParts, OCPersonality, OCPersonalityPreset, OCPresets, OCState } from '../types';

export const ocPresets = presetsFile as OCPresets;

export const defaultOCParts: OCParts = {
  face: 0,
  hair: 0,
  color: 0,
  outfit: 0,
};

export function getPersonalityPreset(personality: OCPersonality): OCPersonalityPreset {
  return ocPresets.personalities.find((preset) => preset.id === personality) ?? ocPresets.personalities[0];
}

export function getPartLabel(kind: OCPartKind, index: number): string {
  const options = ocPresets.parts[kind];
  return (options[index] ?? options[0]).label;
}

export function getFirstLine(oc: Pick<OCState, 'personality' | 'parts'>): string {
  const preset = getPersonalityPreset(oc.personality);
  const lineIndex = (oc.parts.face + oc.parts.hair + oc.parts.color + oc.parts.outfit) % preset.firstLines.length;
  const template = preset.firstLines[lineIndex];

  return template
    .replaceAll('{color}', getPartLabel('color', oc.parts.color))
    .replaceAll('{outfit}', getPartLabel('outfit', oc.parts.outfit))
    .replaceAll('{personality}', preset.label);
}

export function createRandomOCParts(random: () => number = Math.random): OCParts {
  return {
    face: Math.floor(random() * ocPresets.parts.face.length),
    hair: Math.floor(random() * ocPresets.parts.hair.length),
    color: Math.floor(random() * ocPresets.parts.color.length),
    outfit: Math.floor(random() * ocPresets.parts.outfit.length),
  };
}