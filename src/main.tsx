import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { consumeFreshDemoParam } from './lib/reset';
import './styles/tokens.css';
import './styles/global.css';
import './styles/home-island.css';
import './styles/card-pool.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('缺少 #root 挂载节点');
}

if (!consumeFreshDemoParam()) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}