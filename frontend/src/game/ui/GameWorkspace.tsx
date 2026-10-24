import { useContext, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { orbitThemeStyle } from "../rendering/OrbitTheme";
import { DEFAULT_ORBIT_THEME, getOrbitTheme, orbitThemes, pixelAssets, sampleBank } from "../catalog";
import { GameIcon } from "./GameIcon";
import { Link } from "react-router";
import { createLevelTrack, type GameLevel } from "../core/GameLevel";
import { PlaybackContext } from "../../practice/PlaybackGroup";
import { getSoundPreferences } from "../../settings/soundPreferences";
import { getTappingTimingWindows } from "../../settings/tappingPrecision";
import { useBrowsingState } from "../../navigation/usePageNavigation";
import { selectOrbitRange } from "../core/OrbitTrack";
import type { MeasureRange } from "../../rhythm/RhythmTiming";
import { GameSettingsDialog } from "./GameSettingsDialog";
import { ORBIT_EARLY_TAP_LIMIT, READY_ORBIT } from "../core/OrbitRound";
import type { OrbitGame } from "../rendering/OrbitGame";
import type { OrbitMode, OrbitPlaybackSnapshot } from "../runtime/OrbitSession";
import "./OrbitGame.css";
import "./OrbitPixel.css";

import { exercisePosterExamples } from "../rendering/RhythmPosters";

const READY_GAME: OrbitPlaybackSnapshot = { ...READY_ORBIT, mode: "challenge" };

export function GameWorkspace({ level }: { level: GameLevel }) {
  const [fullTrack] = useState(() => createLevelTrack(level));
  const [range, setRange] = useBrowsingState<MeasureRange>(`game:${level.id}:range`, fullTrack.range);
  const track = useMemo(() => selectOrbitRange(fullTrack, range), [fullTrack, range]);
  const targetCount = track.targets.length;
  const playback = useContext(PlaybackContext);
  const stage = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const game = useRef<OrbitGame | null>(null);
  const [snapshot, setSnapshot] = useState<OrbitPlaybackSnapshot>(READY_GAME);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultBpm = level.music?.recommendedBpm ?? 60;
  const [bpmOverride, setBpmOverride] = useBrowsingState<number | null>(`game:${level.id}:bpm`, null);
  const bpm = bpmOverride ?? defaultBpm;
  const theme = useMemo(() => {
    const base = level.visualTheme ?? getOrbitTheme(DEFAULT_ORBIT_THEME);
    if (base.material !== "pixel" || !base.pixelEnvironment.posters || !level.exercise || level.category !== "rhythm") return base;
    const examples = exercisePosterExamples(level.exercise);
    return { ...base, pixelEnvironment: { ...base.pixelEnvironment,
      posters: base.pixelEnvironment.posters.map((poster, index) => ({ ...poster, elements: examples[index] })),
    } };
  }, [level]);
  const pixel = theme.material === "pixel";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const active = ["loading", "count-in", "playing", "finishing", "failing"].includes(snapshot.phase);
  const preview = snapshot.mode === "preview";

  function applySettings(tempo: number, nextRange: MeasureRange) {
    game.current?.stop();
    if (range.startMeasure !== nextRange.startMeasure || range.endMeasure !== nextRange.endMeasure) {
      setReady(false);
      setSnapshot(READY_GAME);
      setRange(nextRange);
    }
    setBpmOverride(tempo === defaultBpm ? null : tempo);
    setError(null);
  }

  const initialTheme = useEffectEvent(() => theme);
  useEffect(() => {
    let cancelled = false;
    void import("../rendering/OrbitGame").then(({ createOrbitGame }) => {
      if (cancelled || !canvasHost.current) return;
      game.current = createOrbitGame({
        parent: canvasHost.current,
        theme: initialTheme(),
        themes: orbitThemes,
        pixelAssets,
        sampleBank,
        track,
        music: level.music,
        visualTimeline: level.visualTimeline,
        onChange: setSnapshot,
        onReady: () => setReady(true),
        acquirePlayback: stop => playback?.acquire(stop) ?? (() => {}),
      });
    }).catch(() => { if (!cancelled) setError("游戏加载失败，请刷新页面重试。"); });
    return () => {
      cancelled = true;
      game.current?.dispose();
      game.current = null;
    };
  }, [playback, track, level.music, level.visualTimeline]);

  // 游戏进行时焦点可能回到正文（例如路由焦点恢复）。
  // 按键属于当前游戏页面，不要求 activeElement 必须恰好是舞台本身。
  const handleGameKey = useEffectEvent((event: KeyboardEvent) => {
    if (!active || event.defaultPrevented || event.isComposing || event.repeat
      || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
      || document.querySelector("dialog:modal, [popover]:popover-open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      game.current?.stop();
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest("button, a, input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='combobox'], [role='listbox'], [role='menu'], [role='slider'], [role='spinbutton']")) return;
    if (event.code === "Space") {
      event.preventDefault();
      game.current?.tap(event.timeStamp);
    }
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => handleGameKey(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function start(mode: OrbitMode = "challenge") {
    if (!game.current || active) return;
    setError(null);
    stage.current?.focus({ preventScroll: true });
    try { await game.current.start(bpm, getSoundPreferences(), getTappingTimingWindows(), mode); }
    catch (error) { setError(error instanceof Error ? error.message : "声音加载失败，请重试。"); }
  }
  const failed = snapshot.phase === "failed";
  const completed = snapshot.phase === "completed";
  const title = failed ? snapshot.failure === "late" ? "错过了这一拍" : "提前误敲过多" : completed && !preview ? "完成" : level.title;

  return <section className="design-system orbit-page orbit-workspace" data-art={theme.material} style={pixel ? orbitThemeStyle(theme) : undefined} aria-labelledby="orbit-heading">
    <title>{`${level.title} · 节奏游戏`}</title>
    <header className="orbit-heading">
      <div className="orbit-heading-identity">
        <Link className="orbit-return" aria-label="关卡列表" to="/game" onClick={() => game.current?.stop()}><GameIcon name="back" pixel={pixel} /><span>关卡列表</span></Link>
        <h1 id="orbit-heading">{level.title}</h1>
      </div>
      <div className="orbit-heading-actions">
          <button type="button" className={`orbit-start${active && !preview ? " orbit-end" : ""}`} disabled={!ready || active && preview} onClick={() => active ? game.current?.stop() : void start()}>
            {active && !preview ? <GameIcon name="stop" pixel={pixel} size={16} /> : failed || (completed && !preview) ? <GameIcon name="retry" pixel={pixel} size={16} /> : <GameIcon name="play" pixel={pixel} size={16} />}
            {active ? preview ? "开始游戏" : "结束本局" : failed ? "再试一次" : completed && !preview ? "再来一次" : "开始游戏"}
          </button>
          <button type="button" className="orbit-secondary orbit-preview" disabled={!ready || active && !preview} onClick={() => active ? game.current?.stop() : void start("preview")}><GameIcon name={active && preview ? "stop" : "play"} pixel={pixel} size={16} />{active && preview ? "停止示范" : "看示范"}</button>
        <button type="button" className="orbit-settings-button" aria-label="练习设置" disabled={active} onClick={() => setSettingsOpen(true)}><GameIcon name="settings" pixel={pixel} /><span>设置</span></button>
      </div>
    </header>
    <div className="orbit-stage-frame">
    <div ref={stage} className="orbit-stage" tabIndex={-1} role="region" aria-label="节奏游戏区域" aria-describedby="orbit-instructions"
      data-phase={snapshot.phase} data-mode={snapshot.mode} data-visual-theme={theme.id} style={orbitThemeStyle(theme)}
      onPointerDown={event => {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) return;
        event.currentTarget.focus({ preventScroll: true });
        game.current?.tap(event.timeStamp);
      }}>
      <div ref={canvasHost} className="orbit-canvas" aria-hidden="true" />
      <div className="sr-only">
        <div className="orbit-progress-group">
          <span className="orbit-progress sr-only" aria-label={`${preview ? "示范进度" : "完成"} ${snapshot.hits} / ${targetCount}`}>{snapshot.hits}<span> / {targetCount}</span></span>
          <span className="orbit-feedback" aria-live="off">{snapshot.phase === "playing" ? snapshot.feedback : ""}</span>
          {snapshot.phase === "playing" && snapshot.earlyTaps > 0 && <span className="orbit-early-count" role="status">本目标提前误敲 {snapshot.earlyTaps} / {ORBIT_EARLY_TAP_LIMIT}</span>}
        </div>
      </div>
      {snapshot.phase === "count-in" && <div className="orbit-count" role="status" key={snapshot.countIn}><strong>{snapshot.countIn || "…"}</strong></div>}
      <span className="sr-only" role="status">{failed ? `${title}，完成 ${snapshot.hits} 次` : completed ? preview ? "示范结束" : `完成，${targetCount} 次全部命中` : ""}</span>
    </div>
    {(failed || completed && !preview) && <div className="orbit-overlay" data-result={failed ? "failed" : "completed"}>
      <div className="orbit-control-info">
        <h2>{title}</h2>
      </div>

    </div>}
    </div>
    <p id="orbit-instructions" className="sr-only">按空格键或点击游戏区域敲击，按 Esc 结束。</p>
    {error && <p className="orbit-error" role="alert">{error}</p>}
    {settingsOpen && <GameSettingsDialog about={level.music ? { title: level.title, credit: level.music.credit ?? "原创音乐", description: level.description } : undefined} sections={level.music?.sections} theme={theme} bpm={bpm} defaultBpm={defaultBpm} range={range} measureCount={fullTrack.range.endMeasure} onApply={applySettings} onClose={() => setSettingsOpen(false)} />}
  </section>;
}
