import { useEffect, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import islandTown from '../../assets/hero-learning-town.webp';
import islandRoute from '../../assets/growth-learning-map.svg';
import { ProgressRing } from '../components/ProgressRing';
import { OCBubble } from '../components/OCBubble';
import { todayKey } from '../lib/draw';
import { getFirstLine } from '../lib/ocLines';
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
  const refreshDailyDraw = useGameStore((state) => state.refreshDailyDraw);

  // 跨天打开首页时刷新已过期的抽卡；空状态（刚重置）不在这里生成新卡。
  useEffect(() => {
    refreshDailyDraw();
  }, [refreshDailyDraw]);

  const todayIsCurrent = todayDraw !== null && todayDraw.date === todayKey();
  const revealedToday = todayIsCurrent && todayDraw ? todayDraw.revealed.length : 0;
  const drawTotal = todayIsCurrent && todayDraw ? todayDraw.cardIds.length : 3;
  const learnedCount = countTodayLearned(todayIsCurrent ? learnedToday : [], drawTotal);

  const completed = [
    revealedToday > 0 || learnedCount > 0,
    Object.keys(mastery).length > 0,
    remakes.some((remake) => remake.status === 'submitted' || remake.status === 'annotated'),
    sent.length > 0,
    Boolean(oc && oc.relationExp > 0),
  ];
  const currentStep = completed.findIndex((value) => !value);

  return (
    <section className="home">
      <div className="home-hero shell">
        <p className="home-overline eyebrow">
          <span>不是收藏答案，是交换理解</span>
          <span>3 分钟 / 1 次完整循环</span>
        </p>

        <figure className="home-hero-visual">
          <img
            src={islandTown}
            width="1774"
            height="887"
            alt="温馨的欧式小镇广场：有人在长椅和桌边读书思考，有人伏案写卡片，也有人把卡片递给同伴。"
          />
        </figure>

        <div className="home-hero-intro">
          <h1 className="home-title home-story-title">
            把理解
            <br />
            <span className="title-cut">翻出来。</span>
          </h1>

          <div className="home-hero-copy">
            <p className="home-sub">
              一张卡，一次表达，
              <br />
              一位会记住你说过什么的 OC。
            </p>
            <p className="home-lede">
              抽卡开始，翻卡理解，用自己的话重写，再把它寄给另一位读者。成长不是打卡次数，
              而是你真的讲明白了一件事。
            </p>
            <div className="home-hero-actions">
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
              <ProgressRing done={learnedCount} total={drawTotal} />
            </div>
          </div>
        </div>
      </div>

      <section className="home-oc shell" aria-labelledby="homeOCTitle">
        <div className="home-oc-intro">
          <p className="eyebrow">YOUR FIRST READER / OC</p>
          <h2 id="homeOCTitle">有人等你，<br />把话说完。</h2>
          <p>OC 会记住你的外观选择，也会用自己的性格读你的每一次改写。</p>
        </div>
        {oc ? (
          <OCBubble
            oc={oc}
            text={getFirstLine(oc)}
            action={<Link className="oc-bubble-action" to="/oc">重新调整 OC ↗</Link>}
          />
        ) : (
          <div className="home-oc-empty">
            <p>还没有第一位读者。用四步，拼出会认真回应你的 OC。</p>
            <Link className="button primary" to="/oc">创建我的 OC →</Link>
          </div>
        )}
      </section>

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