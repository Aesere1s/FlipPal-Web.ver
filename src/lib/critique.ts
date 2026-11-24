import { getPersonalityPreset } from './ocLines';
import type { Card, OCPersonality, RemakeFields } from '../types';

export const REMAKE_LIMITS: Record<keyof RemakeFields, number> = {
  front: 60,
  explanation: 600,
  example: 400,
  source: 120,
};

export type RemakeErrors = Partial<Record<keyof RemakeFields, string>>;
export type CritiqueSignal = 'copy' | 'personal' | 'complete' | 'ready';

export interface CritiqueResult {
  signal: CritiqueSignal;
  message: string;
  quote: string;
}

const fieldLabels: Record<keyof RemakeFields, string> = {
  front: '正面',
  explanation: '解释',
  example: '例子',
  source: '来源',
};

const readyLines: Record<OCPersonality, string> = {
  calm: '这版已经是你的表达了。解释、例子和来源都在，我们可以慢慢把它交给下一位读者。',
  curious: '这版有自己的解释，也有具体场景。我现在好奇：下一位读者会接着追问什么？',
  sharp: '这版能站住。不是原文的回声，例子和来源也齐全，可以寄出去。',
};

function textLength(value: string): number {
  return Array.from(value.trim()).length;
}

export function validateRemake(fields: RemakeFields): RemakeErrors {
  const errors: RemakeErrors = {};
  (Object.keys(REMAKE_LIMITS) as (keyof RemakeFields)[]).forEach((key) => {
    const value = fields[key].trim();
    if (!value) {
      errors[key] = `${fieldLabels[key]}不能为空。`;
    } else if (textLength(value) > REMAKE_LIMITS[key]) {
      errors[key] = `${fieldLabels[key]}最多 ${REMAKE_LIMITS[key]} 字，当前 ${textLength(value)} 字。`;
    }
  });
  return errors;
}

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function longestCommonSubstringLength(left: string, right: string): number {
  const a = normalizeForComparison(left);
  const b = normalizeForComparison(right);
  if (!a || !b) return 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  let longest = 0;

  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        longest = Math.max(longest, current[j]);
      }
    }
    previous = current;
  }
  return longest;
}

function hasPersonalContext(value: string): boolean {
  return /(我|我们|自己|本人|昨天|今天|上周|本周|早上|晚上|地铁|会议|课堂|工作|学习|排队|项目|考试|比如|例如|有一次|\d)/i.test(value);
}

function hasSpecificSource(value: string): boolean {
  const source = value.trim();
  if (!source || /^(未知|网上|网络|书|书籍|课本|课程|文章|视频)$/.test(source)) return false;
  if (/^《[^》]+》$/.test(source)) return false;
  return source.length >= 6 && /(第.{1,10}[章节讲集课]|\d|章节|课程|文章|论文|视频|播客|专栏|[:：·—-])/i.test(source);
}

function excerpt(value: string): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  const characters = Array.from(compact);
  return characters.length > 36 ? `${characters.slice(0, 36).join('')}…` : compact;
}

function stableIndex(value: string, length: number): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return length > 0 ? hash % length : 0;
}

export function critiqueRemake(
  fields: RemakeFields,
  card: Pick<Card, 'front' | 'back'>,
  personality: OCPersonality,
): CritiqueResult {
  const preset = getPersonalityPreset(personality);
  const original = `${card.front}\n${card.back}`;
  const explanationCopy = longestCommonSubstringLength(fields.explanation, original) >= 12;
  const exampleCopy = longestCommonSubstringLength(fields.example, original) >= 12;

  let signal: CritiqueSignal = 'ready';
  let quoteSource = fields.explanation;

  if (explanationCopy || exampleCopy) {
    signal = 'copy';
    quoteSource = explanationCopy ? fields.explanation : fields.example;
  } else if (!hasPersonalContext(fields.example)) {
    signal = 'personal';
    quoteSource = fields.example;
  } else if (!hasSpecificSource(fields.source)) {
    signal = 'complete';
    quoteSource = fields.source;
  }

  const quote = excerpt(quoteSource);
  if (signal === 'ready') {
    return { signal, message: readyLines[personality], quote };
  }

  const variants = preset.critique[signal];
  const message = variants[stableIndex(`${signal}:${quote}`, variants.length)];
  return { signal, message, quote };
}