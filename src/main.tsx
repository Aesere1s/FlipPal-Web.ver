import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { consumeFreshDemoParam } from './lib/reset';
import { attachVisibilityFlag } from './lib/visibility';
import './styles/tokens.css';
import './styles/global.css';
import './styles/home-island.css';
import './styles/card-pool.css';
import './styles/draw.css';
import './styles/flip-card.css';
import './styles/learn.css';
import './styles/quiz.css';
import './styles/progress-ring.css';
import './styles/oc.css';
import './styles/remake.css';
import './styles/growth.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('缺少 #root 挂载节点');
}

// ?demo=fresh 与重置按钮共用 resetDemo()；这里只清状态并抹掉参数，不再整页跳转。
consumeFreshDemoParam();

// 失焦/隐藏标签页时冻结翻卡过渡，避免回来补播动画。
attachVisibilityFlag();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);