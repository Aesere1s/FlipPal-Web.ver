import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import islandHero from '../../assets/hero-learning-island.svg';
import islandRoute from '../../assets/growth-learning-map.svg';
import { ProgressRing } from '../components/ProgressRing';
import { countTodayLearned } from '../lib/progress';
import { SCHEMA_VERSION, useGameStore } from '../store/gameStore';


const routeSteps = [
  { no: '01', label: '抽卡', x: 8.2, y: 55.2 },
  { no: '02', label: '学卡', x: 31.1, y: 50.5 },
  { no: '03', label: '改卡', x: 50.2, y: 61.5 },
  { no: '04', label: '漂流', x: 68.2, y: 54.2 },
  { no: '05', label: '成长', x: 88.3, y: 54.0 },
];

export default function Home() {
  const navigate = useNavigate();

  const mastery = useGameStore((state) => state.mastery);
  const learnedToday = useGameStore((state) => state.learnedToday);
  const remakes = useGameStore((state) => state.remakes);
  const sent = useGameStore((state) => state.sent);
  const oc = useGameStore((state) => state.oc);
  const todayDraw = useGameStore((state) => state.todayDraw);
  const revealedToday = todayDraw?.revealed.length ?? 0;
  const drawTotal = todayDraw?.cardIds.length ?? 3;


  const completed = [
    revealedToday > 0 || learnedToday.length > 0,
    Object.keys(mastery).length > 0,
    remakes.length > 0,
    sent.length > 0,
    Boolean(oc && oc.relationExp > 0),
  ];
  const currentStep = completed.findIndex((value) => !value);

  return (
    <section className="home">
      <div className="home-hero shell">
        <p className="home-overline eyebrow">
          <span>LOCAL LEARNING ISLAND</span>
          <span>01 / 从抽卡开始</span>
        </p>

        <h1 className="home-title home-story-title">
          把理解
          <br />
          <span className="title-cut">翻出来。</span>
        </h1>

        <div className="home-lower">
          <div className="home-intro">
            <p className="home-sub">
              一张卡，一次表达，
              <br />
              一位会记住你说过什么的 OC。
            </p>
            <p className="home-lede">
              抽一张、读进去、用自己的话重写，再把它交给另一位读者。成长不是翻过多少张，
              而是你真的讲明白了什么。
            </p>
            <button
              className="draw-trigger"
              type="button"
              onClick={() => navigate('/draw')}
            >
              <span>抽一张</span>
              <small>
                今日已翻开 {revealedToday} / {drawTotal}
              </small>
            </button>

            <ProgressRing
              done={countTodayLearned(todayDraw?.cardIds, mastery)}
              total={todayDraw?.cardIds.length ?? 3}
            />
          </div>

          <article className="island-sample" aria-labelledby="islandSampleTitle">
            <figure className="island-sample-figure">
              <img
                src={islandHero}
                width="1200"
                height="760"
                alt="浅绿色小岛上，读者在卡亭抽卡、在树下读卡，并把写好的卡片折成纸飞机寄出。弯曲小路连接这三处地点。"
              />
            </figure>
            <div className="island-sample-head eyebrow">
              <span>今日场景 / LEARNING ISLAND</span>
              <span>01 / 03</span>
            </div>
            <div className="island-sample-body">
              <h2 id="islandSampleTitle">已经付出的成本，为什么不该决定下一步？</h2>
              <div>
                <p className="island-sample-kicker eyebrow">答案线索</p>
                <p>先放下“已经花了多少”，只比较从现在开始，继续与停下各自还要付出什么。</p>
              </div>
            </div>
          </article>
        </div>
      </div>

      <section className="learning-route shell" aria-labelledby="routeTitle">
        <header className="learning-route-head">
          <div>
            <p className="eyebrow">05 STOPS / ONE ROUTE</p>
            <h2 id="routeTitle">学习不是一条进度条，<br />而是一条走过的路。</h2>
          </div>
          <p className="learning-route-note">
            抽到、读懂、讲清楚、寄出去，再带回一条批注。每完成一步，岛上的下一盏灯才会亮。
          </p>
        </header>

        <figure className="learning-map">
          <div className="learning-map-canvas">
            <img
              src={islandRoute}
              width="1200"
              height="520"
              alt="抽卡亭、读卡桌、改写台、漂流信箱和成长树沿一条弯曲小路分布在河岸上。"
            />
            {routeSteps.map((step, index) => {
              const done = completed[index];
              const status = done ? 'done' : index === currentStep ? 'current' : 'locked';
              const markerStyle = {
                left: `${step.x}%`,
                top: `${step.y}%`,
              } satisfies CSSProperties;
              return (
                <span
                  className="island-marker"
                  data-status={status}
                  style={markerStyle}
                  key={step.no}
                  aria-label={`${step.label}：${done ? '已完成' : index === currentStep ? '当前步骤' : '尚未到达'}`}
                >
                  <b>{step.no}</b>
                  <small>{step.label}</small>
                </span>
              );
            })}
          </div>
          <figcaption>
            <span><b>01—03</b> 抽卡、读卡、改写</span>
            <span><b>04</b> 把版本寄给另一位读者</span>
            <span><b>05</b> 带着批注回到成长树</span>
          </figcaption>
        </figure>
      </section>

      <div className="home-status shell">
        <p>
          <strong>ENGINE</strong> Vite + React + TypeScript
        </p>
        <p>
          <strong>STATE</strong> 空状态树 / schemaVersion {SCHEMA_VERSION}
        </p>
        <p>
          <strong>RESET</strong> 右上角 / ?demo=fresh
        </p>
      </div>
    </section>
  );
}