import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { todayKey } from '../lib/draw';
import { useGameStore } from '../store/gameStore';

export default function LearnIndex() {
  const todayDraw = useGameStore((state) => state.todayDraw);
  const ensureDailyDraw = useGameStore((state) => state.ensureDailyDraw);

  useEffect(() => {
    ensureDailyDraw();
  }, [ensureDailyDraw]);

  const isCurrent = todayDraw !== null && todayDraw.date === todayKey();
  const firstCardId = isCurrent && todayDraw ? todayDraw.cardIds[0] : undefined;

  if (firstCardId) {
    return <Navigate to={`/learn/${firstCardId}`} replace />;
  }

  return (
    <section className="learn-page shell">
      <header className="learn-head">
        <p className="eyebrow">02 / LEARN</p>
        <h1>学卡 · 正在发牌。</h1>
        <p className="learn-lede">
          今日卡片正在准备中。如果长时间没有跳转，回到抽卡页翻一张卡再来。
        </p>
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