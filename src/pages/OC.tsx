import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { OCAvatar } from '../components/OCAvatar';
import { OCBubble } from '../components/OCBubble';
import {
  createRandomOCParts,
  defaultOCParts,
  getFirstLine,
  getPartLabel,
  getPersonalityPreset,
  ocPresets,
} from '../lib/ocLines';
import { useGameStore } from '../store/gameStore';
import type { OCPartKind, OCParts, OCPersonality } from '../types';

const partKinds: { id: OCPartKind; label: string }[] = [
  { id: 'face', label: '脸型' },
  { id: 'hair', label: '发型' },
  { id: 'color', label: '配色' },
  { id: 'outfit', label: '服饰' },
];

const steps = ['性格', '声线', '外观', '确认'];

export default function OC() {
  const navigate = useNavigate();
  const savedOC = useGameStore((state) => state.oc);
  const saveOC = useGameStore((state) => state.saveOC);
  const [step, setStep] = useState(0);
  const [personality, setPersonality] = useState<OCPersonality | null>(savedOC?.personality ?? null);
  const [parts, setParts] = useState<OCParts>(savedOC?.parts ?? defaultOCParts);

  const preset = personality ? getPersonalityPreset(personality) : null;
  const previewOC = { personality: personality ?? 'calm', parts } as const;
  const firstLine = getFirstLine(previewOC);

  const updatePart = (kind: OCPartKind, index: number) => {
    setParts((current) => ({ ...current, [kind]: index }));
  };

  const handleConfirm = () => {
    if (!personality) {
      setStep(0);
      return;
    }
    saveOC(personality, parts);
    navigate('/');
  };

  return (
    <section className="oc-page shell">
      <header className="oc-head">
        <div>
          <p className="eyebrow">05 / CHARACTER ASSEMBLY</p>
          <h1>OC</h1>
        </div>
        <p className="oc-head-lede">不是挑一个头像。是确定谁会读完你的话，以及他会怎样回应。</p>
      </header>

      <ol className="oc-step-list" aria-label="OC 创建步骤">
        {steps.map((label, index) => (
          <li className={index === step ? 'is-current' : index < step ? 'is-done' : ''} key={label} aria-current={index === step ? 'step' : undefined}>
            <span>0{index + 1}</span>
            <strong>{label}</strong>
          </li>
        ))}
      </ol>

      <div className="oc-workbench">
        <div className="oc-preview">
          <p className="oc-preview-label">LIVE SPECIMEN / 实时拼装</p>
          <OCAvatar parts={parts} label="当前选择的 OC 外观预览" />
          <div className="oc-preview-caption">
            <span>{preset?.label ?? '等待性格'}</span>
            <span>{getPartLabel('color', parts.color)} / {getPartLabel('outfit', parts.outfit)}</span>
          </div>
        </div>

        <div className="oc-editor">
          {step === 0 && (
            <section className="oc-step" aria-labelledby="oc-personality-title">
              <p className="eyebrow">STEP 01 / PERSONALITY</p>
              <h2 id="oc-personality-title">他怎样听你说？</h2>
              <p className="oc-step-lede">先选回应世界的方式。性格会决定声线、第一句话和之后的挑刺语气。</p>
              <div className="oc-personality-options">
                {ocPresets.personalities.map((option, index) => (
                  <button
                    className="oc-personality-option"
                    type="button"
                    key={option.id}
                    aria-pressed={personality === option.id}
                    onClick={() => setPersonality(option.id)}
                  >
                    <span>0{index + 1}</span>
                    <strong>{option.label}</strong>
                    <small>{option.tagline}</small>
                  </button>
                ))}
              </div>
              {!personality && <p className="oc-required-note">选择一种性格后才能继续。</p>}
            </section>
          )}

          {step === 1 && preset && (
            <section className="oc-step" aria-labelledby="oc-voice-title">
              <p className="eyebrow">STEP 02 / VOICE</p>
              <h2 id="oc-voice-title">把语气调成{preset.label}。</h2>
              <blockquote className="oc-voice-sample">“{preset.tagline}”</blockquote>
              <dl className="oc-voice-spec">
                <div>
                  <dt>声线规则</dt>
                  <dd>{preset.voice}</dd>
                </div>
                <div>
                  <dt>第一句话预览</dt>
                  <dd>{firstLine}</dd>
                </div>
              </dl>
            </section>
          )}

          {step === 2 && (
            <section className="oc-step" aria-labelledby="oc-parts-title">
              <div className="oc-step-heading-row">
                <div>
                  <p className="eyebrow">STEP 03 / APPEARANCE</p>
                  <h2 id="oc-parts-title">拼出第一眼的印象。</h2>
                </div>
                <button className="button oc-randomize" type="button" onClick={() => setParts(createRandomOCParts())}>
                  随机搭配 ↗
                </button>
              </div>
              <div className="oc-part-groups">
                {partKinds.map((kind) => (
                  <fieldset className="oc-part-group" key={kind.id}>
                    <legend>{kind.label}</legend>
                    <div className="oc-part-options">
                      {ocPresets.parts[kind.id].map((option, index) => (
                        <button
                          className="oc-part-option"
                          type="button"
                          key={option.id}
                          aria-pressed={parts[kind.id] === index}
                          onClick={() => updatePart(kind.id, index)}
                        >
                          {kind.id === 'color' && <span className="oc-color-chip" style={{ backgroundColor: option.value }} aria-hidden="true" />}
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <button className="text-button oc-later" type="button" onClick={() => setStep(3)}>
                以后再改，先去确认 →
              </button>
            </section>
          )}

          {step === 3 && preset && (
            <section className="oc-step" aria-labelledby="oc-confirm-title">
              <p className="eyebrow">STEP 04 / FIRST ENCOUNTER</p>
              <h2 id="oc-confirm-title">你好，第一位读者。</h2>
              <OCBubble oc={previewOC} text={firstLine} />
              <dl className="oc-confirm-spec">
                <div><dt>性格</dt><dd>{preset.label}</dd></div>
                <div><dt>脸型</dt><dd>{getPartLabel('face', parts.face)}</dd></div>
                <div><dt>发型</dt><dd>{getPartLabel('hair', parts.hair)}</dd></div>
                <div><dt>穿著</dt><dd>{getPartLabel('color', parts.color)} · {getPartLabel('outfit', parts.outfit)}</dd></div>
              </dl>
            </section>
          )}

          <div className="oc-editor-actions">
            {step > 0 ? (
              <button className="button" type="button" onClick={() => setStep((current) => Math.max(0, current - 1))}>
                ← 上一步
              </button>
            ) : (
              <Link className="button" to="/">返回首页</Link>
            )}
            {step < 3 ? (
              <button
                className="button primary oc-next"
                type="button"
                disabled={step === 0 && !personality}
                onClick={() => setStep((current) => Math.min(3, current + 1))}
              >
                {step === 0 ? '确认性格' : step === 1 ? '选择外观' : '去确认'} →
              </button>
            ) : (
              <button className="button primary oc-confirm" type="button" onClick={handleConfirm}>
                {savedOC ? '保存改变' : '认识彼此'}，回到首页 →
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}