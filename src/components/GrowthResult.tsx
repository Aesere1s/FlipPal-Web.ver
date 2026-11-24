import { useEffect, useMemo, useRef, useState } from 'react';
import { OCBubble } from './OCBubble';
import { getGrowthLine, getRelationTitle } from '../lib/ocLines';
import {
  MAX_RELATION_LEVEL,
  RELATION_THRESHOLDS,
  relationProgress,
  type GrowthSettlement,
} from '../lib/growth';
import type { OCState } from '../types';

interface GrowthResultProps {
  settlement: GrowthSettlement;
  cardTitle: string;
  oc: Pick<OCState, 'personality' | 'parts'>;
  onClose: () => void;
}

const KIND_LABELS: Record<GrowthSettlement['kind'], string> = {
  learn: '学卡结算',
  remake: '改卡结算',
  annotate: '批注结算',
};

const ROLL_DURATION = 900;

export function GrowthResult({ settlement, cardTitle, oc, onClose }: GrowthResultProps) {
  const [progress, setProgress] = useState(0);
  const frameRef = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const done = progress >= 1;

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setProgress(1);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const value = Math.min(1, (now - start) / ROLL_DURATION);
      setProgress(value);
      if (value < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const skip = () => {
    cancelAnimationFrame(frameRef.current);
    setProgress(1);
  };

  const shown = progress >= 1
    ? settlement.gained
    : Math.round(settlement.gained * (1 - Math.pow(1 - progress, 3)) * 2) / 2;
  const shownText = Number.isInteger(shown) ? String(shown) : shown.toFixed(1);
  const relation = useMemo(() => relationProgress(settlement.totalExp), [settlement.totalExp]);
  const title = getRelationTitle(settlement.personality, settlement.level);

  const line = useMemo(() => {
    const key = settlement.levelUp ? 'levelUp' : settlement.unlocks.length > 0 ? 'unlock' : 'gain';
    return getGrowthLine(
      settlement.personality,
      key,
      {
        title,
        gained: settlement.gained,
        level: settlement.level,
        ability: settlement.unlocks[0]?.name ?? '',
      },
      settlement.totalExp,
    );
  }, [settlement, title]);

  return (
    <div className="growth-overlay" data-level-up={settlement.levelUp ? 'true' : 'false'}>
      <section
        className="growth-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="growthTitle"
      >
        <header className="growth-head">
          <p className="growth-flag">GROWTH / 05 · {KIND_LABELS[settlement.kind]}</p>
          <button
            className="growth-skip"
            type="button"
            onClick={skip}
            disabled={done}
          >
            {done ? '动画已结束' : '跳过动画 →'}
          </button>
        </header>

        <h2 id="growthTitle" className="growth-title">
          {settlement.levelUp ? '你走进下一层了。' : '这一次，被记住了。'}
        </h2>
        <p className="growth-source">{cardTitle}</p>

        <div className="growth-gain" aria-live="polite">
          <span className="growth-gain-plus" aria-hidden="true">+</span>
          <span className="growth-gain-value">{shownText}</span>
          <span className="growth-gain-unit">EXP</span>
        </div>

        <div
          className="growth-track"
          aria-label={`关系等级 ${relation.level} / ${MAX_RELATION_LEVEL}`}
        >
          {RELATION_THRESHOLDS.map((threshold, index) => {
            const level = index + 1;
            const state = level < relation.level ? 'done' : level === relation.level ? 'current' : 'locked';
            return (
              <span className="growth-track-seg" data-state={state} key={threshold}>
                <b>L{level}</b>
                <small>{threshold}</small>
              </span>
            );
          })}
        </div>

        <div className="growth-relation">
          <span className="growth-relation-level">关系 Lv.{settlement.level}</span>
          {settlement.levelUp && (
            <span className="growth-relation-from">从 Lv.{settlement.previousLevel}</span>
          )}
          <strong className="growth-relation-title">{title}</strong>
          <span className="growth-relation-exp">{settlement.totalExp} EXP</span>
        </div>

        {settlement.unlocks.length > 0 && (
          <div className="growth-unlocks">
            <p className="eyebrow">NEW ABILITY / 新能力</p>
            {settlement.unlocks.map((ability, index) => (
              <article className="growth-ability" key={ability.id}>
                <span className="growth-ability-index" aria-hidden="true">0{index + 1}</span>
                <div>
                  <h3>{ability.name}</h3>
                  <p>{ability.note}</p>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="growth-oc">
          <OCBubble oc={oc} text={line} />
        </div>

        <button
          className="button primary growth-close"
          type="button"
          onClick={onClose}
          ref={closeRef}
        >
          收下这次成长 →
        </button>
      </section>
    </div>
  );
}