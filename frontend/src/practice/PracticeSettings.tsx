import { useId, useState, type ReactNode } from "react";

export type PracticeSettingsValue = { bpm: number; metronomeEnabled: boolean };

const MIN_BPM = 40;
const MAX_BPM = 240;

/**
 * 统一拥有速度输入、校验、生效值和节拍器开关，以 children 提供给具体工作区。
 * 调用方不维护第二份设置状态；重建此组件才重置设置，子级换题不重置。
 * 生效 BPM 默认 60、范围 40–240；只编辑或提交相同值不打断播放。
 */
export default function PracticeSettings({ children, settingsClassName = "" }: {
  settingsClassName?: string;
  children: (settings: PracticeSettingsValue) => ReactNode;
}) {
  const inputId = useId();
  const errorId = useId();
  const pendingId = useId();
  const [bpm, setBpm] = useState(60);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [bpmInput, setBpmInput] = useState("60");
  const [hasBpmError, setHasBpmError] = useState(false);
  // 未应用状态由草稿与生效值直接得出，不另存一份状态。
  const hasPendingBpm = Number(bpmInput) !== bpm;

  return (
    <>
      <section className={`practice-settings ${settingsClassName}`.trim()} aria-label="练习设置">
        <form
          className="tempo-settings"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const nextBpm = Number(bpmInput);
            if (
              !Number.isInteger(nextBpm) ||
              nextBpm < MIN_BPM ||
              nextBpm > MAX_BPM
            ) {
              setHasBpmError(true);
              return;
            }
            setHasBpmError(false);
            setBpm(nextBpm);
            setBpmInput(String(nextBpm));
          }}
        >
          <label htmlFor={inputId}>
            速度 <span className="unit">BPM</span>
          </label>
          <input
            id={inputId}
            type="number"
            min={MIN_BPM}
            max={MAX_BPM}
            step={1}
            required
            value={bpmInput}
            aria-invalid={hasBpmError || undefined}
            aria-describedby={
              hasBpmError
                ? errorId
                : hasPendingBpm
                  ? pendingId
                  : undefined
            }
            onChange={(event) => {
              setBpmInput(event.target.value);
              setHasBpmError(false);
            }}
          />
          <button type="submit">应用速度</button>
          {hasPendingBpm && !hasBpmError && (
            <span id={pendingId} className="bpm-pending">
              未应用
            </span>
          )}
          {hasBpmError && (
            <p id={errorId} className="bpm-error" role="alert">
              请输入 {MIN_BPM}–{MAX_BPM} 之间的整数。
            </p>
          )}
        </form>
        <label className="metronome-toggle">
          <input type="checkbox" checked={metronomeEnabled} onChange={event => setMetronomeEnabled(event.target.checked)} />
          节拍器
        </label>
      </section>
      {children({ bpm, metronomeEnabled })}
    </>
  );
}
