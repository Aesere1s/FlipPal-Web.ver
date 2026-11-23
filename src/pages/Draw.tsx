import { useEffect } from 'react';
import cardsFile from '../data/cards.json';
import { FlipCard } from '../components/FlipCard';
import { DRAW_COUNT } from '../lib/draw';
import { useGameStore } from '../store/gameStore';
import type { Card } from '../types';

const cards = (cardsFile as unknown as { cards: Card[] }).cards;
const cardsById = new Map(cards.map((card) => [card.id, card]));

export default function Draw() {
  const todayDraw = useGameStore((state) => state.todayDraw);
  const ensureDailyDraw = useGameStore((state) => state.ensureDailyDraw);
  const revealTodayCard = useGameStore((state) => state.revealTodayCard);
  const useRedraw = useGameStore((state) => state.useRedraw);

  useEffect(() => {
    ensureDailyDraw();
  }, [ensureDailyDraw]);

  const cardIds = todayDraw?.cardIds ?? [];
  const revealed = todayDraw?.revealed ?? [];
  const allRevealed = cardIds.length > 0 && revealed.length >= cardIds.length;
  const redrawDisabled = !todayDraw || todayDraw.redrawUsed || allRevealed;

  return (
    <section className="draw-page shell">
      <header className="draw-head">
        <p className="eyebrow">01 / DAILY DRAW</p>
        <h1>今日抽卡。</h1>
        <p className="draw-lede">
          每天三张，顺序固定。翻开一张，就多一条可以讲清楚的知识。不翻开的位置，今天还能重抽一次。
        </p>
      </header>

      <p className="draw-progress">
        今日已翻开 {revealed.length} / {DRAW_COUNT}
      </p>

      {todayDraw ? (
        <div className="draw-grid">
          {cardIds.map((cardId, index) => {
            const card = cardsById.get(cardId);
            if (!card) {
              return null;
            }
            return (
              <FlipCard
                key={cardId}
                card={card}
                index={index}
                revealed={revealed.includes(cardId)}
                onReveal={() => revealTodayCard(cardId)}
              />
            );
          })}
        </div>
      ) : (
        <p className="draw-dealing">正在发牌…</p>
      )}

      <div className="draw-actions">
        <button className="draw-redraw" type="button" disabled={redrawDisabled} onClick={useRedraw}>
          重抽未翻开的卡
        </button>
        <span className="draw-actions-note">
          {todayDraw?.redrawUsed ? '今日重抽已使用' : '每日一次，只替换尚未翻开的位置'}
        </span>
      </div>
    </section>
  );
}