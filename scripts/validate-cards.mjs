import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TRACKS = ['thinking', 'coding', 'expression'];
const RARITIES = ['common', 'rare', 'cross'];
const PERSONALITIES = ['calm', 'curious', 'sharp'];
const PART_KINDS = ['face', 'hair', 'color', 'outfit'];

const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(relativePath, label) {
  try {
    return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    fail(`${label} 无法解析：${error.message}`);
    return null;
  }
}

function text(value) {
  return typeof value === 'string' ? [...value.trim()] : [];
}

function requireText(value, label, min, max) {
  const characters = text(value);
  if (characters.length === 0) {
    fail(`${label} 不能为空`);
    return;
  }
  if (min !== undefined && characters.length < min) {
    fail(`${label} 过短：${characters.length} 字（至少 ${min}）`);
  }
  if (max !== undefined && characters.length > max) {
    fail(`${label} 过长：${characters.length} 字（最多 ${max}）`);
  }
}

const cardsFile = readJson('src/data/cards.json', 'cards.json');
const inboxFile = readJson('src/data/inbox.json', 'inbox.json');
const ocFile = readJson('src/data/ocPresets.json', 'ocPresets.json');

const cards = cardsFile?.cards;
const cardIds = new Set();
const byTrack = Object.fromEntries(TRACKS.map((track) => [track, 0]));
const byDifficulty = new Map();
const byRarity = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0]));

if (!Array.isArray(cards)) {
  fail('cards.json 的 cards 必须是数组');
} else {
  if (cards.length !== 24) {
    fail(`卡片总数应为 24，当前为 ${cards.length}`);
  }

  cards.forEach((card, index) => {
    const label = `cards[${index}]${card?.id ? `(${card.id})` : ''}`;

    requireText(card?.id, `${label}.id`, 2, 48);
    if (card?.id && !/^[a-z0-9-]+$/.test(card.id)) {
      fail(`${label}.id 只能使用小写字母、数字和连字符`);
    }
    if (card?.id && cardIds.has(card.id)) {
      fail(`${label}.id 重复：${card.id}`);
    }
    if (card?.id) {
      cardIds.add(card.id);
    }

    if (!TRACKS.includes(card?.track)) {
      fail(`${label}.track 不在枚举内：${card?.track}`);
    } else {
      byTrack[card.track] += 1;
    }

    requireText(card?.title, `${label}.title`, 1, 12);
    requireText(card?.front, `${label}.front`, 1, 60);
    requireText(card?.back, `${label}.back`, 150, 220);
    requireText(card?.source, `${label}.source`, 4);

    if (![1, 2, 3, 4, 5].includes(card?.difficulty)) {
      fail(`${label}.difficulty 必须是 1-5`);
    } else {
      byDifficulty.set(card.difficulty, (byDifficulty.get(card.difficulty) ?? 0) + 1);
    }

    if (!RARITIES.includes(card?.rarity)) {
      fail(`${label}.rarity 不在枚举内：${card?.rarity}`);
    } else {
      byRarity[card.rarity] += 1;
    }

    if (!['official', 'remake'].includes(card?.type)) {
      fail(`${label}.type 不在枚举内：${card?.type}`);
    }

    requireText(card?.quiz?.question, `${label}.quiz.question`, 4);
    const options = card?.quiz?.options;
    if (!Array.isArray(options) || options.length !== 4) {
      fail(`${label}.quiz.options 必须恰好包含 4 个选项`);
    } else {
      options.forEach((option, optionIndex) => {
        requireText(option, `${label}.quiz.options[${optionIndex}]`, 1, 80);
      });
      if (new Set(options).size !== 4) {
        fail(`${label}.quiz.options 存在重复项`);
      }
    }

    if (!Number.isInteger(card?.quiz?.answer) || card?.quiz?.answer < 0 || card?.quiz?.answer > 3) {
      fail(`${label}.quiz.answer 必须是 0-3 的整数`);
    }

    requireText(card?.quiz?.evidence, `${label}.quiz.evidence`, 6);
    if (card?.quiz?.evidence && card?.back && !card.back.includes(card.quiz.evidence)) {
      fail(`${label}.quiz.evidence 不是 back 的连续子串，答错时无法回指原文`);
    }
  });
}

for (const track of TRACKS) {
  if (byTrack[track] !== 8) {
    fail(`方向 ${track} 应有 8 张卡，当前为 ${byTrack[track]}`);
  }
}

for (const difficulty of [2, 3, 4]) {
  if (!(byDifficulty.get(difficulty) > 0)) {
    fail(`难度 ${difficulty} 没有卡片，24 张卡必须覆盖 2-4 档`);
  }
}

for (const track of TRACKS) {
  const difficulties = new Set(cards?.filter((card) => card.track === track).map((card) => card.difficulty));
  for (const difficulty of [2, 3, 4]) {
    if (!difficulties.has(difficulty)) {
      fail(`方向 ${track} 缺少难度 ${difficulty} 的卡片`);
    }
  }
}

if (byDifficulty.get(1) || byDifficulty.get(5)) {
  fail('L1 卡池只应出现 2-4 难度的卡片');
}

const inbox = inboxFile?.items;
let annotationCount = 0;

if (inboxFile?.version !== 1) {
  fail('inbox.json 的 version 必须为 1');
}

if (!Array.isArray(inbox) || inbox.length !== 3) {
  fail('inbox.json 必须包含 3 张预置收件卡');
} else {
  const inboxIds = new Set();
  inbox.forEach((item, index) => {
    const label = `inbox[${index}]${item?.id ? `(${item.id})` : ''}`;

    requireText(item?.id, `${label}.id`, 2);
    if (item?.id && inboxIds.has(item.id)) {
      fail(`${label}.id 重复：${item.id}`);
    }
    if (item?.id) {
      inboxIds.add(item.id);
    }

    if (item?.from !== 'stranger') {
      fail(`${label}.from 必须是 stranger`);
    }
    if (item?.cardRef && !cardIds.has(item.cardRef)) {
      fail(`${label}.cardRef 未指向 cards.json 中的卡片：${item.cardRef}`);
    }
    if (!item?.content) {
      fail(`${label}.content 缺失`);
      return;
    }

    requireText(item.content.title, `${label}.content.title`, 1, 40);
    if (!TRACKS.includes(item.content.track)) {
      fail(`${label}.content.track 不在枚举内：${item.content.track}`);
    }
    requireText(item.content.source, `${label}.content.source`, 4);

    const lines = item.content.lines;
    if (!Array.isArray(lines) || lines.length < 3) {
      fail(`${label}.content.lines 至少需要 3 句`);
      return;
    }
    lines.forEach((line, lineIndex) => {
      requireText(line, `${label}.content.lines[${lineIndex}]`, 8, 160);
    });

    const annotations = item.annotations;
    if (!Array.isArray(annotations) || annotations.length < 2) {
      fail(`${label}.annotations 至少需要 2 条具体批注`);
      return;
    }
    const annotatedLines = new Set();
    annotations.forEach((annotation, annotationIndex) => {
      const annotationLabel = `${label}.annotations[${annotationIndex}]`;
      if (!Number.isInteger(annotation?.line) || annotation.line < 0 || annotation.line >= lines.length) {
        fail(`${annotationLabel}.line 越界：${annotation?.line}`);
      }
      requireText(annotation?.quote, `${annotationLabel}.quote`, 4);
      if (
        typeof annotation?.quote === 'string' &&
        Number.isInteger(annotation?.line) &&
        lines[annotation.line] &&
        !lines[annotation.line].includes(annotation.quote)
      ) {
        fail(`${annotationLabel}.quote 不是第 ${annotation.line} 句的子串`);
      }
      requireText(annotation?.text, `${annotationLabel}.text`, 12);
      requireText(annotation?.author, `${annotationLabel}.author`, 1);
      if (Number.isInteger(annotation?.line)) {
        annotatedLines.add(annotation.line);
      }
      annotationCount += 1;
    });

    if (annotatedLines.size < 2) {
      fail(`${label} 的批注至少要落在 2 个不同句子上`);
    }

    if (item.receivedAt && Number.isNaN(Date.parse(item.receivedAt))) {
      fail(`${label}.receivedAt 不是合法日期`);
    }
  });
}

if (ocFile?.version !== 1) {
  fail('ocPresets.json 的 version 必须为 1');
}

const personalities = ocFile?.personalities;
if (!Array.isArray(personalities) || personalities.length !== 3) {
  fail('ocPresets.json 必须包含 3 种性格');
} else {
  const ids = new Set(personalities.map((personality) => personality?.id));
  for (const id of PERSONALITIES) {
    if (!ids.has(id)) {
      fail(`缺少性格预设：${id}`);
    }
  }

  personalities.forEach((personality, index) => {
    const label = `personalities[${index}]${personality?.id ? `(${personality.id})` : ''}`;
    if (!PERSONALITIES.includes(personality?.id)) {
      fail(`${label}.id 不在枚举内`);
    }
    requireText(personality?.label, `${label}.label`, 1);
    requireText(personality?.tagline, `${label}.tagline`, 4);
    requireText(personality?.voice, `${label}.voice`, 4);

    const firstLines = personality?.firstLines;
    if (!Array.isArray(firstLines) || firstLines.length < 2) {
      fail(`${label}.firstLines 至少需要 2 条`);
    } else {
      firstLines.forEach((line, lineIndex) => {
        requireText(line, `${label}.firstLines[${lineIndex}]`, 8);
        if (typeof line === 'string' && (!line.includes('{color}') || !line.includes('{outfit}'))) {
          fail(`${label}.firstLines[${lineIndex}] 必须同时引用 {color} 和 {outfit}`);
        }
      });
    }

    for (const signal of ['copy', 'personal', 'complete']) {
      const lines = personality?.critique?.[signal];
      if (!Array.isArray(lines) || lines.length < 2) {
        fail(`${label}.critique.${signal} 至少需要 2 种表达`);
      } else {
        lines.forEach((line, lineIndex) => {
          requireText(line, `${label}.critique.${signal}[${lineIndex}]`, 8);
        });
      }
    }
  });
}

const parts = ocFile?.parts;
if (!parts || typeof parts !== 'object') {
  fail('ocPresets.json 缺少 parts');
} else {
  for (const kind of PART_KINDS) {
    const options = parts[kind];
    if (!Array.isArray(options) || options.length !== 4) {
      fail(`parts.${kind} 必须包含 4 个选项`);
      continue;
    }
    const optionIds = new Set();
    options.forEach((option, index) => {
      const label = `parts.${kind}[${index}]`;
      requireText(option?.id, `${label}.id`, 1);
      requireText(option?.label, `${label}.label`, 1);
      if (option?.id && optionIds.has(option.id)) {
        fail(`${label}.id 重复：${option.id}`);
      }
      if (option?.id) {
        optionIds.add(option.id);
      }
      if (kind === 'color') {
        if (!/^#[0-9a-f]{6}$/i.test(option?.value ?? '')) {
          fail(`${label}.value 必须是 6 位十六进制色值`);
        }
      } else {
        requireText(option?.shape, `${label}.shape`, 1);
      }
    });
  }
}

if (errors.length > 0) {
  console.error(`CARD ASSET VALIDATION FAILED（${errors.length} 个错误）`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('CARD ASSET VALIDATION PASSED');
console.log(`cards  ${cards.length} | thinking ${byTrack.thinking} / coding ${byTrack.coding} / expression ${byTrack.expression}`);
console.log(`difficulty  2:${byDifficulty.get(2) ?? 0} 3:${byDifficulty.get(3) ?? 0} 4:${byDifficulty.get(4) ?? 0}`);
console.log(`rarity  common:${byRarity.common} rare:${byRarity.rare} cross:${byRarity.cross}`);
console.log(`inbox  ${inbox.length} 张 / ${annotationCount} 条批注`);
console.log('oc  3 性格 / 4 类部件 × 4 选项');
console.log('0 errors');