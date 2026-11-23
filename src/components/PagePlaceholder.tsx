import { Link } from 'react-router-dom';

interface PagePlaceholderProps {
  no: string;
  label: string;
  en: string;
  layer: string;
  note: string;
}

export function PagePlaceholder({ no, label, en, layer, note }: PagePlaceholderProps) {
  return (
    <section className="placeholder shell">
      <p className="placeholder-index" aria-hidden="true">
        {no}
      </p>
      <div className="placeholder-body">
        <p className="placeholder-label">
          <span>{en} / ROUTE READY</span>
          <span>L0 空壳</span>
        </p>
        <h1>{label}</h1>
        <p>{note}</p>
        <div className="placeholder-actions">
          <Link className="button primary" to="/">
            ← 返回首页
          </Link>
          <span className="placeholder-layer">计划层级：{layer}</span>
        </div>
      </div>
    </section>
  );
}