import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import cardsFile from '../data/cards.json';
import { ProgressRing } from '../components/ProgressRing';
import { OCBubble } from '../components/OCBubble';
import { QuizPanel, type QuizResult } from '../components/QuizPanel';
import { getPersonalityPreset } from '../lib/ocLines';
import { countTodayLearned } from '../lib/progress';
import { useGameStore } from '../store/gameStore';
import { TRACK_LABELS, type Card, type Mastery } from '../types';

const cards = (cardsFile as unknown as { cards: Card[] }).cards;
const cardsById = new Map(cards.map((card) => [card.id, card]));

const MASTERY_LABELS: Record<Mastery, string> = {
  0: '未学',
  1: '已翻面',
  2: '已答对',
  3: '已熟练',
};

type Stage = 'front' | 'back' | 'result';

export default function Learn() {
  const { cardId = 'preview' } = useParams<{ cardId: string }>();
  const mastery = useGameStore((state) => state.mastery) ?? {};
  const todayDraw = useGameStore((state) => state.todayDraw);
  const learnedToday = useGameStore((state) => state.learnedToday) ?? [];
  const ensureDailyDraw = useGameStore((state) => state.ensureDailyDraw);
  const recordCardSeen = useGameStore((state) => state.recordCardSeen);
  const recordQuizResult = useGameStore((state) => state.recordQuizResult);
  const oc = useGameStore((state) => state.oc);

  const [stage, setStage] = useState<Stage>('front');
  const [result, setResult] = useState<QuizResult | null>(null);

  // 分享链接直接进入学卡时也补齐今日抽卡，保证进度环的 total 与首页一致。
  useEffect(() => {
    ensureDailyDraw();
  }, [ensureDailyDraw]);

  const card = cardsById.get(cardId);

  if (!card) {
    return (
      <section className="learn-page shell">
        <header className="learn-head">
          <p className="eyebrow">02 / LEARN</p>
          <h1>学卡 · 未找到这张卡。</h1>
          <p className="learn-lede">卡池里没有「{cardId}」这张卡。回到抽卡页，翻一张今天的卡再来。</p>
        </header>
        <nav className="learn-nav">
          <Link className="button primary" to="/draw">
            返回抽卡页
          </Link>
          <Link className="button" to="/">
            返回首页
          </Link>
        </nav>
      </section>
    );
  }

  const masteryValue: Mastery = mastery[card.id] ?? 0;
  const total = todayDraw?.cardIds.length ?? 3;
  const done = countTodayLearned(learnedToday, total);
  const answerText = card.quiz.options[card.quiz.answer] ?? '—';

  const handleFlip = () => {
    if (stage !== 'front') {
      return;
    }
    recordCardSeen(card.id);
    setStage('back');
  };

  const handleFinish = (next: QuizResult) => {
    recordQuizResult(card.id, next.correct);
    setResult(next);
    setStage('result');
  };

  return (
    <section className="learn-page shell">
      <header className="learn-head">
        <p className="eyebrow">02 / LEARN</p>
        <h1>学卡 · {card.title}</h1>
        <p className="learn-lede">
          先看正面的提问，翻到背面读解释，再用 60 秒小测确认自己真的讲得清。
        </p>
        <p className="learn-meta">
          <span>{TRACK_LABELS[card.track]}</span>
          <span>难度 {card.difficulty}</span>
          <span>
            掌握度 {masteryValue} / 3 · {MASTERY_LABELS[masteryValue]}
          </span>
        </p>
      </header>

      {oc && (
        <OCBubble
          className="learn-oc"
          oc={oc}
          text={stage === 'result'
            ? `${getPersonalityPreset(oc.personality).tagline} 小测已经结束，接下来试着把这张卡说成自己的版本。`
            : `${getPersonalityPreset(oc.personality).tagline} 先翻到背面，再告诉我哪里最难讲清楚。`}
        />
      )}

      {stage === 'result' && result ? (
        <section className="learn-result" aria-live="polite">
          <p className="learn-result-flag">
            {result.correct ? 'QUIZ / CORRECT' : result.timedOut ? 'QUIZ / TIMEOUT' : 'QUIZ / WRONG'}
          </p>
          <h2>{result.correct ? '答对。' : result.timedOut ? '时间到，按答错结算。' : '这次没答对。'}</h2>
          <p className="learn-result-answer">正确答案：{answerText}</p>
          <p className="learn-result-evidence">依据：{card.quiz.evidence}</p>

          <div className="learn-result-progress">
            <div className="learn-result-mastery">
              <span className="learn-result-mastery-value">{masteryValue} / 3</span>
              <span className="learn-result-mastery-label">
                当前掌握度 · {MASTERY_LABELS[masteryValue]}
              </span>
            </div>
            <ProgressRing done={done} total={total} />
          </div>

          <nav className="learn-nav">
            <Link className="button primary" to="/">
              返回首页
            </Link>
            <Link className="button" to="/draw">
              返回抽卡
            </Link>
            <Link className="button" to={`/remake/${card.id}`}>
              去改卡
            </Link>
          </nav>
        </section>
      ) : (
        <div className={`learn-flip${stage === 'back' ? ' is-flipped' : ''}`}>
          <div className="learn-flip-inner">
            <article
              className="learn-face learn-face-front"
              aria-hidden={stage !== 'front'}
            >
              <p className="learn-face-label">正面 / QUESTION</p>
              <h2 className="learn-question">{card.front}</h2>
              <button
                className="learn-flip-button"
                type="button"
                onClick={handleFlip}
                disabled={stage !== 'front'}
              >
                翻到背面 ↗
              </button>
            </article>

            <article
              className="learn-face learn-face-back"
              aria-hidden={stage === 'front'}
            >
              <p className="learn-face-label">背面 / EXPLANATION</p>
              <p className="learn-back">{card.back}</p>
              <p className="learn-source">来源：{card.source}</p>
              <QuizPanel
                quiz={card.quiz}
                cardTitle={card.title}
                active={stage !== 'front'}
                onFinish={handleFinish}
              />
            </article>
          </div>
        </div>
      )}

      <nav className="learn-nav">
        <Link className="button" to="/">
          返回首页
        </Link>
        <Link className="button" to="/draw">
          返回抽卡
        </Link>
      </nav>
    </section>
  );
}