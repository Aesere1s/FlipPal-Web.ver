import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import cardsFile from '../data/cards.json';
import { OCBubble } from '../components/OCBubble';
import { GrowthResult } from '../components/GrowthResult';
import { critiqueRemake, REMAKE_LIMITS, validateRemake, type CritiqueResult, type RemakeErrors } from '../lib/critique';
import { fingerprintOf, type GrowthSettlement } from '../lib/growth';
import { getPersonalityPreset } from '../lib/ocLines';
import { useGameStore } from '../store/gameStore';
import type { Card, Remake, RemakeFields } from '../types';

const cards = (cardsFile as unknown as { cards: Card[] }).cards;
const cardsById = new Map(cards.map((card) => [card.id, card]));
const emptyFields: RemakeFields = { front: '', explanation: '', example: '', source: '' };

const fieldConfigs: { id: keyof RemakeFields; label: string; hint: string }[] = [
  { id: 'front', label: '正面', hint: '用一个问题或场景开头，不超过 60 字。' },
  { id: 'explanation', label: '解释', hint: '用自己的话说清楚，不要复述原卡。' },
  { id: 'example', label: '例子', hint: '写一个你遇到的场景、具体时间或数字。' },
  { id: 'source', label: '来源', hint: '写到具体章节、文章、课程或视频。' },
];

function toFields(remake: Remake): RemakeFields {
  return {
    front: remake.front,
    explanation: remake.explanation,
    example: remake.example,
    source: remake.source,
  };
}

export default function Remake() {
  const { cardId = 'preview' } = useParams<{ cardId: string }>();
  const card = cardsById.get(cardId);
  const oc = useGameStore((state) => state.oc);
  const remakes = useGameStore((state) => state.remakes);
  const saveRemakeDraft = useGameStore((state) => state.saveRemakeDraft);
  const submitRemake = useGameStore((state) => state.submitRemake);
  const settleGrowth = useGameStore((state) => state.settleGrowth);
  const existing = remakes.find((remake) => remake.cardRef === cardId);
  const [fields, setFields] = useState<RemakeFields>(existing ? toFields(existing) : emptyFields);
  const [errors, setErrors] = useState<RemakeErrors>({});
  const [feedback, setFeedback] = useState<CritiqueResult | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [growth, setGrowth] = useState<GrowthSettlement | null>(null);

  if (!card) {
    return (
      <section className="remake-page shell">
        <header className="remake-head">
          <p className="eyebrow">03 / REMAKE</p>
          <h1>改卡</h1>
        </header>
        <div className="remake-empty">
          <h2>{cardId === 'preview' ? '先选一张已经读过的卡。' : '没有找到这张原卡。'}</h2>
          <p>从学卡结果页进入改卡，就能把真实卡面和你的改写关联起来。</p>
          <Link className="button primary" to="/learn">去学卡 →</Link>
        </div>
      </section>
    );
  }

  const updateField = (key: keyof RemakeFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setDraftSaved(false);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateRemake(fields);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean) || !oc) return;
    const nextFeedback = critiqueRemake(fields, card, oc.personality);
    submitRemake(card.id, fields);
    setFeedback(nextFeedback);
    setDraftSaved(false);

    if (nextFeedback.signal === 'ready') {
      const settlement = settleGrowth({
        kind: 'remake',
        cardRef: card.id,
        difficulty: card.difficulty,
        fingerprint: fingerprintOf(fields),
      });
      if (settlement) {
        setGrowth(settlement);
      }
    }
  };

  const handleSaveDraft = () => {
    saveRemakeDraft(card.id, fields);
    setDraftSaved(true);
  };

  const isDirty = !existing || fieldConfigs.some(({ id }) => fields[id] !== existing[id]);

  return (
    <section className="remake-page shell">
      <header className="remake-head">
        <p className="eyebrow">03 / REMAKE · OWN YOUR WORDS</p>
        <h1>改卡 · {card.title}</h1>
        <p>原卡只是起点。把你的问题、解释、例子和来源留在同一张新卡里。</p>
      </header>

      <div className="remake-layout">
        <aside className="remake-original" aria-labelledby="remakeOriginalTitle">
          <p className="eyebrow">ORIGINAL / 原卡摘要</p>
          <h2 id="remakeOriginalTitle">{card.front}</h2>
          <blockquote>{card.back}</blockquote>
          <p className="remake-original-source">来源：{card.source}</p>
        </aside>

        <div className="remake-workspace">
          <form className="remake-form" onSubmit={handleSubmit} noValidate>
            <div className="remake-form-head">
              <div>
                <p className="eyebrow">YOUR VERSION / 四个槽位</p>
                <h2>说出来。</h2>
              </div>
              <span className="remake-status">{existing?.status === 'submitted' || existing?.status === 'annotated' ? '已提交' : existing ? '草稿' : '新改写'}</span>
            </div>

            {fieldConfigs.map((field, index) => (
              <div className="remake-field" key={field.id}>
                <div className="remake-field-label">
                  <label htmlFor={`remake-${field.id}`}><span>0{index + 1}</span>{field.label}</label>
                  <span className={Array.from(fields[field.id].trim()).length > REMAKE_LIMITS[field.id] ? 'is-over' : ''}>
                    {Array.from(fields[field.id].trim()).length} / {REMAKE_LIMITS[field.id]}
                  </span>
                </div>
                <textarea
                  id={`remake-${field.id}`}
                  name={field.id}
                  value={fields[field.id]}
                  onChange={(event) => updateField(field.id, event.target.value)}
                  aria-invalid={Boolean(errors[field.id])}
                  aria-describedby={`remake-${field.id}-hint${errors[field.id] ? ` remake-${field.id}-error` : ''}`}
                  rows={field.id === 'front' ? 2 : 4}
                />
                <p className="remake-field-hint" id={`remake-${field.id}-hint`}>{field.hint}</p>
                {errors[field.id] && <p className="remake-field-error" id={`remake-${field.id}-error`} role="alert">{errors[field.id]}</p>}
              </div>
            ))}

            <div className="remake-actions">
              <button className="button" type="button" onClick={handleSaveDraft}>保存草稿</button>
              <button className="button primary remake-submit" type="submit" disabled={!oc}>让 OC 读一遍 →</button>
            </div>
            <p className="remake-save-note" aria-live="polite">
              {draftSaved ? '草稿已保存，刷新后仍在。' : existing && !isDirty ? '当前内容已保存。' : '有尚未保存的修改。'}
            </p>
          </form>

          {oc ? (
            <div className="remake-critique" data-signal={feedback?.signal ?? 'waiting'}>
              <OCBubble
                oc={oc}
                text={feedback
                  ? `${feedback.message} 我读到了你写的“${feedback.quote}”。`
                  : `${getPersonalityPreset(oc.personality).tagline} 我还在等你的版本。写完四格，我会指出最值得改的一处。`}
              />
            </div>
          ) : (
            <div className="remake-oc-empty">
              <p>你可以先保存草稿；创建 OC 后，再获得性格化挑刺。</p>
              <Link className="button primary" to="/oc">先创建 OC →</Link>
            </div>
          )}
        </div>
      </div>

      {growth && oc && (
        <GrowthResult
          settlement={growth}
          cardTitle={card.title}
          oc={oc}
          onClose={() => setGrowth(null)}
        />
      )}
    </section>
  );
}