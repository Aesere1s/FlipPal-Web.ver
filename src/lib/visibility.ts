/**
 * 把「页面失焦 / 标签页隐藏」同步到 <html data-page-hidden>。
 * CSS transition 无法自行暂停，因此翻卡样式在该状态下直接禁用过渡，
 * 避免切窗口回来时补播动画（L3 关键实现：计时与动画失焦暂停）。
 */
export function attachVisibilityFlag(): void {
  const root = document.documentElement;

  const sync = () => {
    const hidden = document.visibilityState === 'hidden' || !document.hasFocus();
    if (hidden) {
      root.dataset.pageHidden = '';
    } else {
      delete root.dataset.pageHidden;
    }
  };

  sync();
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('blur', sync);
  window.addEventListener('focus', sync);
}