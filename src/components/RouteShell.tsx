import { Link, NavLink, Outlet } from 'react-router-dom';
import { ResetDemo } from './ResetDemo';

const routeIndex = [
  { to: '/', end: true, no: '00', en: 'HOME', label: '首页' },
  { to: '/draw', end: false, no: '01', en: 'DRAW', label: '抽卡' },
  { to: '/learn', end: false, no: '02', en: 'LEARN', label: '学卡' },
  { to: '/remake/preview', end: false, no: '03', en: 'REMAKE', label: '改卡' },
  { to: '/drift', end: false, no: '04', en: 'DRIFT', label: '漂流' },
  { to: '/oc', end: false, no: '05', en: 'OC', label: 'OC' },
  { to: '/about', end: false, no: '06', en: 'ABOUT', label: '关于' },
];

export function RouteShell() {
  return (
    <div className="site">
      <a className="skip-link" href="#main">
        跳到主内容
      </a>

      <div className="masthead-bar">
        <header className="masthead shell">
          <NavLink className="brand" to="/" aria-label="FlipPal 首页">
            <strong>FlipPal</strong>
            <span>理解交换所</span>
          </NavLink>
          <p className="edition">
            NO. 001
            <br />
            LOCAL LEARNING LEDGER
          </p>
          <ResetDemo />
        </header>
      </div>

      <div className="index-bar">
        <nav className="route-index shell" aria-label="页面索引">
          {routeIndex.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span>
                {item.no} / {item.en}
              </span>
              <b>{item.label}</b>
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="site-main" id="main">
        <Outlet />
      </main>

      <footer className="page-footer shell">
        <p>FLIPPAL / L0 工程基座 · 可运行 · 可重置</p>
        <p>
          本地运行 · 无需账号 · <Link to="/cards">卡池调试 24</Link>
        </p>
      </footer>
    </div>
  );
}