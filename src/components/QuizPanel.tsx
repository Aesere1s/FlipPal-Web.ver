import { useCallback, useEffect, useRef, useState } from 'react';
import type { Quiz } from '../types';

export const QUIZ_SECONDS = 60;

export interface QuizResult {
  correct: boolean;
  selectedIndex: number | null;
  timedOut: boolean;
}

export interface QuizPanelProps {
  quiz: Quiz;
  cardTitle: string;
  onFinish: (result: QuizResult) => void;
}

const TICK_MS = 250;

export function QuizPanel({ quiz, cardTitle, onFinish }: QuizPanelProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(QUIZ_SECONDS * 1000);
  const [result, setResult] = useState<QuizResult | null>(null);

  // 倒计时以「剩余毫秒 + 上次 tick 时间戳」推进，暂停时清空时间戳，避免漂移累加。
  const remainingRef = useRef(QUIZ_SECONDS * 1000);
  const lastTickRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selectedIndex;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const finish = useCallback((next: QuizResult) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setResult(next);
    onFinishRef.current(next);
  }, []);

  const timeout = useCallback(() => {
    finish({ correct: false, selectedIndex: selectedRef.current, timedOut: true });
  }, [finish]);

  useEffect(() => {
    if (finishedRef.current) return;

    let timer: number | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const advance = () => {
      if (finishedRef.current || lastTickRef.current === null) return;
      const now = performance.now();
      remainingRef.current = Math.max(0, remainingRef.current - (now - lastTickRef.current));
      lastTickRef.current = now;
      setRemainingMs(remainingRef.current);
      if (remainingRef.current <= 0) {
        clearTimer();
        timeout();
      }
    };

    const run = () => {
      if (finishedRef.current || lastTickRef.current !== null) return;
      lastTickRef.current = performance.now();
      clearTimer();
      timer = window.setInterval(advance, TICK_MS);
    };

    const pause = () => {
      if (lastTickRef.current === null) return;
      advance();
      lastTickRef.current = null;
      clearTimer();
      if (!finishedRef.current && remainingRef.current <= 0) timeout();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pause();
      else run();
    };

    if (document.visibilityState !== 'hidden') run();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', pause);
    window.addEventListener('focus', run);

    return () => {
      clearTimer();
      // StrictMode 会二次挂载 effect：若不清空时间戳，第二次 run() 会被判重跳过，倒计时永不启动。
      lastTickRef.current = null;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', pause);
      window.removeEventListener('focus', run);
    };
  }, [timeout, result]);

  const answerIndex = quiz.answer;
  const answerValid = answerIndex >= 0 && answerIndex < quiz.options.length;
  const answerText = answerValid ? quiz.options[answerIndex] : '（无）';

  const handleSelect = (index: number) => {
    if (finishedRef.current) return;
    setSelectedIndex(index);
  };

  const handleSubmit = () => {
    if (finishedRef.current || selectedIndex === null) return;
    finish({ correct: quiz.answer === selectedIndex, selectedIndex, timedOut: false });
  };

  return (
    <section className="quiz-panel" aria-label={`${cardTitle} 小测`}>
      <header className="quiz-panel-head">
        <h2 className="quiz-panel-title">小测</h2>
        <p className="quiz-panel-timer">剩余 {Math.ceil(remainingMs / 1000)} 秒</p>
      </header>

      <p className="quiz-panel-question">{quiz.question}</p>

      <div className="quiz-panel-options">
        {quiz.options.map((option, index) => {
          const selected = selectedIndex === index;
          return (
            <button
              key={index}
              type="button"
              className={selected ? 'quiz-panel-option is-selected' : 'quiz-panel-option'}
              aria-pressed={selected}
              onClick={() => handleSelect(index)}
              disabled={result !== null}
            >
              <span className="quiz-panel-option-mark" aria-hidden="true">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="quiz-panel-option-text">{option}</span>
            </button>
          );
        })}
      </div>

      {result === null ? (
        <button
          type="button"
          className="quiz-panel-submit"
          onClick={handleSubmit}
          disabled={selectedIndex === null}
        >
          提交
        </button>
      ) : (
        <div className={result.correct ? 'quiz-panel-feedback is-correct' : 'quiz-panel-feedback is-wrong'}>
          <h3 className="quiz-panel-feedback-title">{result.correct ? '回答正确' : '回答错误'}</h3>
          {result.timedOut ? <p className="quiz-panel-timeout">已超时，自动交卷</p> : null}
          <p className="quiz-panel-answer">正确答案：{answerText}</p>
          <p className="quiz-panel-evidence">依据：{quiz.evidence}</p>
        </div>
      )}
    </section>
  );
}