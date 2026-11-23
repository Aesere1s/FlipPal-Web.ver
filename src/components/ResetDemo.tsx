import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { resetDemo } from '../lib/reset';

export function ResetDemo() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();

  const openDialog = () => {
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const confirmReset = () => {
    resetDemo();
    closeDialog();
    navigate('/');
  };

  return (
    <>
      <button className="text-button" type="button" onClick={openDialog}>
        重置演示 <span aria-hidden="true">↺</span>
      </button>
      <dialog
        ref={dialogRef}
        className="reset-dialog"
        aria-labelledby="reset-dialog-title"
      >
        <div className="reset-panel">
          <span className="eyebrow">RESET / 清空演示</span>
          <h2 id="reset-dialog-title">清空这次演示？</h2>
          <p>
            抽卡、学习、改写、漂流与 OC 成长会一起回到 L0 初始态。这个动作不能撤销。
          </p>
          <div className="reset-actions">
            <button className="button" type="button" onClick={closeDialog}>
              再想想
            </button>
            <button className="button danger" type="button" onClick={confirmReset}>
              确认清空
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}