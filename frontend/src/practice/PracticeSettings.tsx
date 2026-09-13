import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type PracticeSettingsValue = { bpm: number; metronomeEnabled: boolean };

const MIN_BPM = 40;
const MAX_BPM = 240;

function parseBpm(value: string): number | null {
  const next = Number(value);
  return value.trim() !== "" && Number.isInteger(next) && next >= MIN_BPM && next <= MAX_BPM
    ? next : null;
}

/**
 * 统一拥有速度输入、校验、生效值和节拍器开关，以 children 提供给具体工作区。
 * 调用方不维护第二份设置状态；重建此组件才重置设置，子级换题不重置。
 * BPM 默认 60、范围 40–240。拖动只更新草稿，松手提交；键盘/辅助技术调整即时提交。
 * 数字输入失焦或回车提交；无效或相同值不打断播放，取消拖动恢复生效值。
 */
export default function PracticeSettings({ children }: {
  children: (settings: PracticeSettingsValue) => ReactNode;
}) {
  const inputId = useId();
  const errorId = useId();
  const [bpm, setBpm] = useState(60);
  const [metronomeEnabled, setMetronomeEnabled] = useState(true);
  const [bpmInput, setBpmInput] = useState("60");
  const [hasBpmError, setHasBpmError] = useState(false);
  const dragRef = useRef<{ pointerId: number; originalBpm: number; value: string } | null>(null);
  // 两种控件共用草稿；输入不完整或越界时，滑块继续显示原生效值。
  const sliderBpm = parseBpm(bpmInput) ?? bpm;

  const applyBpm = useCallback((value: string) => {
    const nextBpm = parseBpm(value);
    if (nextBpm === null) {
      setHasBpmError(true);
      return;
    }
    setHasBpmError(false);
    setBpm(nextBpm);
    setBpmInput(String(nextBpm));
  }, []);

  const cancelDrag = useCallback(() => {
    const drag = dragRef.current;
    if (drag === null) return;
    dragRef.current = null;
    setBpmInput(String(drag.originalBpm));
    setHasBpmError(false);
  }, []);

  useEffect(() => {
    // 原生 range 自己管理指针捕获；失去捕获/焦点不代表用户取消。
    // 在窗口收尾，移出轨道松手也提交一次，不依赖 React 尚未提交的草稿 state。
    function finishDrag(event: PointerEvent) {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      applyBpm(drag.value);
    }
    function handleCancel(event: PointerEvent) {
      if (dragRef.current?.pointerId === event.pointerId) cancelDrag();
    }
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", handleCancel);
    window.addEventListener("blur", cancelDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", handleCancel);
      window.removeEventListener("blur", cancelDrag);
    };
  }, [applyBpm, cancelDrag]);

  return (
    <>
      <section className="practice-settings design-system" aria-label="练习设置">
        <form
          className="tempo-settings"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            applyBpm(bpmInput);
          }}
        >
          <div className="tempo-slider">
            <span className="tempo-endpoint" aria-hidden="true" title="慢">🐢</span>
            <input
              type="range"
              min={MIN_BPM}
              max={MAX_BPM}
              step={1}
              value={sliderBpm}
              aria-label="速度滑块"
              aria-valuetext={`${sliderBpm} BPM`}
              style={{ "--tempo-progress": `${(sliderBpm - MIN_BPM) / (MAX_BPM - MIN_BPM) * 100}%` } as CSSProperties}
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0) return;
                dragRef.current = { pointerId: event.pointerId, originalBpm: bpm, value: event.currentTarget.value };
              }}
              onChange={(event) => {
                setBpmInput(event.currentTarget.value);
                setHasBpmError(false);
                // 原生 range 的键盘与辅助技术操作没有指针拖动，直接生效。
                if (dragRef.current === null) applyBpm(event.currentTarget.value);
                else dragRef.current.value = event.currentTarget.value;
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") cancelDrag();
              }}
            />
            <span className="tempo-endpoint" aria-hidden="true" title="快">🐇</span>
          </div>
          <div className="tempo-value">
            <input
              id={inputId}
              type="number"
              min={MIN_BPM}
              max={MAX_BPM}
              step={1}
              required
              value={bpmInput}
              aria-label="速度 BPM"
              aria-invalid={hasBpmError || undefined}
              aria-describedby={hasBpmError ? errorId : undefined}
              onChange={(event) => {
                setBpmInput(event.target.value);
                setHasBpmError(false);
              }}
              onBlur={(event) => applyBpm(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                applyBpm(event.currentTarget.value);
              }}
            />
            <label htmlFor={inputId} className="unit">BPM</label>
          </div>
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
