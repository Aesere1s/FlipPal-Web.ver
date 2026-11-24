import type { ReactNode } from 'react';
import type { OCState } from '../types';
import { getPersonalityPreset } from '../lib/ocLines';
import { OCAvatar } from './OCAvatar';

interface OCBubbleProps {
  oc: Pick<OCState, 'personality' | 'parts'>;
  text: string;
  action?: ReactNode;
  className?: string;
}

export function OCBubble({ oc, text, action, className = '' }: OCBubbleProps) {
  const preset = getPersonalityPreset(oc.personality);

  return (
    <aside className={`oc-bubble ${className}`.trim()} aria-live="polite">
      <OCAvatar parts={oc.parts} className="oc-bubble-avatar" label={`${preset.label}性格的 OC 头像`} />
      <div className="oc-bubble-body">
        <p className="oc-bubble-label">OC / {preset.label} · 第一个读者</p>
        <p className="oc-bubble-text">{text}</p>
        {action}
      </div>
    </aside>
  );
}