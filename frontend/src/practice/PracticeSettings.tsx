import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  createMetronomePlayback,
  getMetronomeAngle,
  MetronomePlaybackContext,
} from "./MetronomePlayback";

export type PracticeSettingsValue = { bpm: number; metronomeEnabled: boolean };

const MIN_BPM = 40;
const MAX_BPM = 240;

function parseBpm(value: string): number | null {
  const next = Number(value);
  return value.trim() !== "" &&
    Number.isInteger(next) &&
    next >= MIN_BPM &&
    next <= MAX_BPM
    ? next
    : null;
}

/**
 * 统一拥有速度输入、校验、生效值和节拍器开关，以 children 提供给具体工作区。
 * initialValue 仅在挂载时恢复设置；onChange 只报告已生效值，供调用方保存快照。
 * 编辑中的输入、拖动和播放连接仍由本组件拥有，子级换题不重置。
 * BPM 默认 60、范围 40–240。拖动只更新草稿，松手提交；键盘/辅助技术调整即时提交。
 * 数字输入失焦或回车提交；无效或相同值不打断播放，取消拖动恢复生效值。
 * sidebar 由调用方放置第二个参数 settingsPanel；仍只创建一套设置与播放连接。
 */
export default function PracticeSettings({
  children,
  layout = "stacked",
  initialValue,
  onChange,
  extraControls,
}: {
  children: (settings: PracticeSettingsValue, settingsPanel: ReactNode) => ReactNode;
  layout?: "stacked" | "sidebar";
  initialValue?: PracticeSettingsValue;
  onChange?: (value: PracticeSettingsValue) => void;
  /** 工作区专属设置，置于节拍器和速度之后，不参与速度状态管理。 */
  extraControls?: ReactNode;
}) {
  const inputId = useId();
  const errorId = useId();
  const [bpm, setBpm] = useState(initialValue?.bpm ?? 60);
  const [metronomeEnabled, setMetronomeEnabled] = useState(initialValue?.metronomeEnabled ?? true);
  const [bpmInput, setBpmInput] = useState(String(initialValue?.bpm ?? 60));
  const [hasBpmError, setHasBpmError] = useState(false);
  const [metronomePlayback] = useState(createMetronomePlayback);
  const dragRef = useRef<{
    pointerId: number;
    originalBpm: number;
    value: string;
  } | null>(null);
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
    if (nextBpm !== bpm) onChange?.({ bpm: nextBpm, metronomeEnabled });
  }, [bpm, metronomeEnabled, onChange]);

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

  const settingsPanel = (
    <section
      className="practice-settings design-system"
      aria-label="练习设置"
    >
      <MechanicalMetronome
        enabled={metronomeEnabled}
        onToggle={() => {
          setMetronomeEnabled(!metronomeEnabled);
          onChange?.({ bpm, metronomeEnabled: !metronomeEnabled });
        }}
        playback={metronomePlayback}
      />
      <form
        className="tempo-settings"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          applyBpm(bpmInput);
        }}
      >
        <div className="tempo-slider">
          <span className="tempo-endpoint" aria-hidden="true" title="慢">
            🐢
          </span>
          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            step={1}
            value={sliderBpm}
            aria-label="速度滑块"
            aria-valuetext={`${sliderBpm} BPM`}
            style={
              {
                "--tempo-progress": `${((sliderBpm - MIN_BPM) / (MAX_BPM - MIN_BPM)) * 100}%`,
              } as CSSProperties
            }
            onPointerDown={(event) => {
              if (!event.isPrimary || event.button !== 0) return;
              dragRef.current = {
                pointerId: event.pointerId,
                originalBpm: bpm,
                value: event.currentTarget.value,
              };
            }}
            onChange={(event) => {
              setBpmInput(event.currentTarget.value);
              setHasBpmError(false);
              // 原生 range 的键盘与辅助技术操作没有指针拖动，直接生效。
              if (dragRef.current === null)
                applyBpm(event.currentTarget.value);
              else dragRef.current.value = event.currentTarget.value;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") cancelDrag();
            }}
          />
          <span className="tempo-endpoint" aria-hidden="true" title="快">
            🐇
          </span>
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
          <label htmlFor={inputId} className="unit">
            BPM
          </label>
        </div>
        {hasBpmError && (
          <p id={errorId} className="bpm-error" role="alert">
            请输入 {MIN_BPM}–{MAX_BPM} 之间的整数。
          </p>
        )}
      </form>
      {extraControls}
    </section>
  );

  return (
    <MetronomePlaybackContext.Provider value={metronomePlayback}>
      {layout === "sidebar" ? children({ bpm, metronomeEnabled }, settingsPanel) : (
        <div className="practice-layout practice-layout--stacked design-system">
          {settingsPanel}
          {children({ bpm, metronomeEnabled }, settingsPanel)}
        </div>
      )}
    </MetronomePlaybackContext.Provider>
  );
}

/** 只消费只读播放视图；SVG 帧更新不经过 React，也不安排任何声音。 */
function MechanicalMetronome({
  enabled,
  onToggle,
  playback,
}: {
  enabled: boolean;
  onToggle: () => void;
  playback: ReturnType<typeof createMetronomePlayback>;
}) {
  const source = useSyncExternalStore(
    playback.subscribe,
    playback.getSnapshot,
    () => null,
  );
  const pendulumRef = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const pendulum = pendulumRef.current;
    if (!pendulum) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame: number | null = null;
    function stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pendulum!.setAttribute("transform", "rotate(0 40 76)");
    }
    function update() {
      if (!source) return;
      const time = source.readTimeMs();
      pendulum!.setAttribute(
        "transform",
        `rotate(${getMetronomeAngle(time, source)} 40 76)`,
      );
      if (time < source.durationMs) frame = requestAnimationFrame(update);
      else frame = null;
    }
    function configure() {
      stop();
      if (enabled && source && !motion.matches) update();
    }
    configure();
    motion.addEventListener("change", configure);
    return () => {
      stop();
      motion.removeEventListener("change", configure);
    };
  }, [enabled, source]);

  return (
    <button
      type="button"
      className="mechanical-metronome"
      aria-label="节拍器"
      aria-pressed={enabled}
      title={enabled ? "关闭节拍器（预备拍保留）" : "开启节拍器（随练习播放）"}
      onClick={onToggle}
    >
      <svg viewBox="0 0 80 92" aria-hidden="true" focusable="false">
        <path
          className="metronome-case"
          d="M26 8 Q27 5 30 5 H50 Q53 5 54 8 L68 79 Q69 84 64 84 H16 Q11 84 12 79 Z"
        />
        <path
          className="metronome-scale"
          d="M34 22 H46 M32 32 H48 M30 42 H50 M28 52 H52 M26 62 H54"
        />
        <g
          ref={pendulumRef}
          className="metronome-pendulum"
          transform="rotate(0 40 76)"
        >
          <path d="M40 76 V14" />
          <rect x="34" y="29" width="12" height="16" rx="3" />
        </g>
        <circle className="metronome-pivot" cx="40" cy="76" r="4" />
        <path className="metronome-base" d="M12 85 H68" />
      </svg>
    </button>
  );
}
