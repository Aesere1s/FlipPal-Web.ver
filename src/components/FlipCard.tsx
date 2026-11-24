import { Link } from 'react-router-dom';
import { RARITY_LABELS, type Card } from '../types';

interface FlipCardProps {
  card: Card;
  index: number;
  revealed: boolean;
  onReveal: () => void;
}

export function FlipCard({ card, index, revealed, onReveal }: FlipCardProps) {
  const order = String(index + 1).padStart(2, '0');

  return (
    <article className={revealed ? 'flip-card is-flipped' : 'flip-card'} data-rarity={card.rarity}>
      <div className="flip-card-inner">
        <div className="flip-card-face flip-card-back" aria-hidden={revealed}>
          <button
            type="button"
            className="flip-card-back-button"
            onClick={onReveal}
            disabled={revealed}
            aria-label={`翻开第 ${index + 1} 张卡`}
          >
            <span className="flip-card-no">NO. {order}</span>
            <span className="flip-card-back-mark" aria-hidden="true">
              ✦
            </span>
            <span className="flip-card-back-hint">点击翻牌</span>
          </button>
        </div>

        <div className="flip-card-face flip-card-front" aria-hidden={!revealed}>
          <header className="flip-card-meta">
            <span>NO. {order}</span>
            <span className="flip-card-rarity">{RARITY_LABELS[card.rarity]}</span>
          </header>
          <h2 className="flip-card-title">{card.title}</h2>
          <p className="flip-card-front-text">{card.front}</p>
          <p className="flip-card-difficulty">难度 {card.difficulty}</p>
          <p className="flip-card-source">{card.source}</p>
          <Link className="flip-card-link" to={`/learn/${card.id}`}>
            进入学卡 →
          </Link>
        </div>
      </div>
    </article>
  );
}