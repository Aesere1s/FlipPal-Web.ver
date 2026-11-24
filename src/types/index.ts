export const TRACKS = ['thinking', 'coding', 'expression'] as const;

export type Track = (typeof TRACKS)[number];

export const TRACK_LABELS: Record<Track, string> = {
  thinking: '认知与思维',
  coding: '编程与工具',
  expression: '表达与沟通',
};

export const RARITIES = ['common', 'rare', 'cross'] as const;

export type Rarity = (typeof RARITIES)[number];

export const RARITY_LABELS: Record<Rarity, string> = {
  common: '普通',
  rare: '稀有',
  cross: '跨界',
};

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type CardType = 'official' | 'remake';

export type Mastery = 0 | 1 | 2 | 3;

export interface Quiz {
  question: string;
  options: string[];
  answer: number;
  evidence: string;
}

export interface Card {
  id: string;
  track: Track;
  title: string;
  front: string;
  back: string;
  source: string;
  difficulty: Difficulty;
  rarity: Rarity;
  type: CardType;
  quiz: Quiz;
}

export interface Annotation {
  line: number;
  quote: string;
  text: string;
  author: string;
}

export interface DriftContent {
  title: string;
  track: Track;
  lines: string[];
  source: string;
}

export interface DriftItem {
  id: string;
  cardRef: string;
  from: 'me' | 'stranger';
  content?: DriftContent;
  annotations: Annotation[];
  reply?: string;
  receivedAt?: string;
}

export type RemakeStatus = 'draft' | 'submitted' | 'annotated';

export interface Remake {
  id: string;
  cardRef: string;
  front: string;
  explanation: string;
  example: string;
  source: string;
  status: RemakeStatus;
  createdAt: string;
  updatedAt: string;
}

export type RemakeFields = Pick<Remake, 'front' | 'explanation' | 'example' | 'source'>;

export type OCPersonality = 'calm' | 'curious' | 'sharp';

export type OCPartKind = 'face' | 'hair' | 'color' | 'outfit';

export interface OCPartOption {
  id: string;
  label: string;
  shape?: string;
  value?: string;
}

export interface OCParts {
  face: number;
  hair: number;
  color: number;
  outfit: number;
}

export interface OCGrowthLines {
  gain: string[];
  levelUp: string[];
  unlock: string[];
}

export type RelationLineKey = keyof OCGrowthLines;

export interface OCPersonalityPreset {
  id: OCPersonality;
  label: string;
  tagline: string;
  voice: string;
  firstLines: string[];
  critique: {
    copy: string[];
    personal: string[];
    complete: string[];
  };
  relationTitles: string[];
  growth: OCGrowthLines;
}

export interface OCPresets {
  version: number;
  personalities: OCPersonalityPreset[];
  parts: Record<OCPartKind, OCPartOption[]>;
}

export interface OCState {
  personality: OCPersonality;
  parts: OCParts;
  relationLevel: number;
  relationExp: number;
  abilities: string[];
}


export interface InboxFile {
  version: number;
  items: DriftItem[];
}