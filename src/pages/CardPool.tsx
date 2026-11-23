import { useState } from 'react';
import { Link } from 'react-router-dom';
import cardsFile from '../data/cards.json';
import inboxFile from '../data/inbox.json';
import ocPresetsFile from '../data/ocPresets.json';
import {
  RARITY_LABELS,
  TRACKS,
  TRACK_LABELS,
  type Card,
  type InboxFile,
  type OCPresets,
  type Track,
} from '../types';

const cards = (cardsFile as unknown as { cards: Card[] }).cards;
const inbox = (inboxFile as unknown as InboxFile).items;
const ocPresets = ocPresetsFile as unknown as OCPresets;

const featured = TRACKS.map((track) => cards.find((card) => card.track === track)).filter(
  (card): card is Card => Boolean(card),
);

export default function CardPool() {
  const [activeTrack, setActiveTrack] = useState<Track | 'all'>('all');

  const visibleCards =
    activeTrack === 'all' ? cards : cards.filter((card) => card.track === activeTrack);
  const annotationCount = inbox.reduce((total, item) => total + item.annotations.length, 0);
  const partOptionCount = Object.values(ocPresets.parts).reduce(
    (total, options) => total + options.length,
    0,
  );

  return (
    <section className="card-pool shell">
      <header className="pool-head">
        <div>
          <p className="eyebrow">L1 / CONTENT ASSET / INTERNAL</p>
          <h1>
            卡池。
            <br />
            <em>
              24 张，
              <br />
              全部有出处。
            </em>
          </h1>
        </div>
        <div className="pool-head-copy">
          <p>
            三个方向各 8 张。每张卡都有正面问题、背面解释、来源、难度、稀有度和一道 4 选 1
            小测。
          </p>
          <p className="pool-head-note">内部调试页，不进入 7 条演示主路由。</p>
          <Link className="button" to="/">
            ← 返回首页
          </Link>
        </div>
      </header>

      <div className="pool-stats" aria-label="内容资产统计">
        <div className="pool-stat">
          <b>24</b>
          <span>CARDS</span>
        </div>
        <div className="pool-stat">
          <b>3</b>
          <span>TRACKS</span>
        </div>
        <div className="pool-stat">
          <b>2–4</b>
          <span>DIFFICULTY</span>
        </div>
        <div className="pool-stat">
          <b>3</b>
          <span>INBOX</span>
        </div>
        <div className="pool-stat">
          <b>{annotationCount}</b>
          <span>ANNOTATIONS</span>
        </div>
        <div className="pool-stat">
          <b>3×4</b>
          <span>OC PARTS</span>
        </div>
      </div>

      <section className="pool-feature-section" aria-labelledby="poolFeatureTitle">
        <header className="pool-section-head">
          <p className="eyebrow">ONE PER TRACK</p>
          <h2 id="poolFeatureTitle">三个方向，各翻开一张。</h2>
        </header>
        <div className="pool-feature">
          {featured.map((card, index) => (
            <article className="pool-feature-card" key={card.id}>
              <header>
                <span>
                  {String(index + 1).padStart(2, '0')} / {TRACK_LABELS[card.track]}
                </span>
                <span>
                  {RARITY_LABELS[card.rarity]} · 难度 {card.difficulty}
                </span>
              </header>
              <h3>{card.title}</h3>
              <p>{card.front}</p>
              <div className="pool-feature-answer">
                <span className="eyebrow">小测答案</span>
                <strong>{card.quiz.options[card.quiz.answer]}</strong>
              </div>
              <p className="pool-source">来源：{card.source}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pool-browser" aria-labelledby="poolBrowserTitle">
        <header className="pool-browser-head">
          <div>
            <p className="eyebrow">FULL CARD POOL</p>
            <h2 id="poolBrowserTitle">全部 24 张。</h2>
          </div>
          <p className="pool-browser-count" aria-live="polite">
            当前显示 {visibleCards.length} / 24
          </p>
        </header>
        <div className="pool-filter" role="group" aria-label="按方向筛选">
          <button type="button" aria-pressed={activeTrack === 'all'} onClick={() => setActiveTrack('all')}>
            全部 / 24
          </button>
          {TRACKS.map((track) => (
            <button
              key={track}
              type="button"
              aria-pressed={activeTrack === track}
              onClick={() => setActiveTrack(track)}
            >
              {TRACK_LABELS[track]} / 8
            </button>
          ))}
        </div>
        <div className="pool-grid">
          {visibleCards.map((card) => {
            const globalIndex = cards.findIndex((item) => item.id === card.id);
            return (
              <article className="pool-card" key={card.id} data-track={card.track}>
                <header>
                  <span>
                    {String(globalIndex + 1).padStart(2, '0')} / {TRACK_LABELS[card.track]}
                  </span>
                  <span>
                    {RARITY_LABELS[card.rarity]} · 难度 {card.difficulty}
                  </span>
                </header>
                <h3>{card.title}</h3>
                <p className="pool-front">{card.front}</p>
                <details>
                  <summary>展开背面与小测</summary>
                  <p>{card.back}</p>
                  <p className="pool-quiz">{card.quiz.question}</p>
                  <ol className="pool-options">
                    {card.quiz.options.map((option, optionIndex) => (
                      <li
                        key={option}
                        className={optionIndex === card.quiz.answer ? 'is-answer' : undefined}
                      >
                        {option}
                        {optionIndex === card.quiz.answer ? ' · 正确' : ''}
                      </li>
                    ))}
                  </ol>
                  <p className="pool-evidence">依据：{card.quiz.evidence}</p>
                </details>
                <p className="pool-source">来源：{card.source}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="pool-data" aria-labelledby="poolDataTitle">
        <header className="pool-section-head">
          <p className="eyebrow">OTHER ASSETS</p>
          <h2 id="poolDataTitle">不止卡片。</h2>
        </header>
        <div className="pool-data-grid">
          <article>
            <span className="eyebrow">INBOX</span>
            <strong>{inbox.length} 张预置收件卡</strong>
            <p>{annotationCount} 条逐句批注，全部绑定到具体句子索引。</p>
          </article>
          <article>
            <span className="eyebrow">OC PRESETS</span>
            <strong>
              {ocPresets.personalities.length} 种性格 / {partOptionCount} 个部件选项
            </strong>
            <p>沉静、好奇、犀利，各自有第一句话与挑刺话术。</p>
          </article>
          <article>
            <span className="eyebrow">VALIDATION</span>
            <strong>npm run validate:cards</strong>
            <p>字段、来源、答案索引、难度分布和批注定位都由脚本检查。</p>
          </article>
        </div>
      </section>
    </section>
  );
}