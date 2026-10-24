import { orbitThemeStyle, type OrbitTheme } from "../rendering/OrbitTheme";
import { useRef, useState } from "react";
import { Modal } from "../../ui/Modal";
import type { MeasureRange } from "../../rhythm/RhythmTiming";

/** 设置以草稿编辑；取消不改变当前关卡，应用后回到准备状态。 */
export function GameSettingsDialog({ bpm, defaultBpm, range, measureCount, theme, sections = [], about, onApply, onClose }: {
  about?: { title: string; credit: string; description: string };
  sections?: readonly { measure: number; title: string }[]; theme: OrbitTheme; bpm: number; defaultBpm: number; range: MeasureRange; measureCount: number;
  onApply: (bpm: number, range: MeasureRange) => void; onClose: () => void;
}) {
  const pixel = theme.material === "pixel";
  const [tempo, setTempo] = useState(String(bpm));
  const lastTempo = useRef(bpm);
  const [draft, setDraft] = useState(range);
  const measures = Array.from({ length: measureCount }, (_, index) => index);
  function normalizeTempo() {
    const value = tempo.trim() === "" ? lastTempo.current : Number(tempo);
    const normalized = Number.isFinite(value) ? Math.max(40, Math.min(240, Math.round(value))) : lastTempo.current;
    lastTempo.current = normalized;
    setTempo(String(normalized));
    return normalized;
  }
  const measureLabel = (index: number) => {
    const section = sections.find(section => section.measure === index);
    return section ?  `第 ${index + 1} 小节 · ${section.title}` : `第 ${index + 1} 小节`;
  };
  return <Modal style={pixel ? orbitThemeStyle(theme) : undefined} title="练习设置" initialFocus="heading" onClose={onClose} closeLabel="关闭练习设置">
    {close => <form className="orbit-settings-form" data-art={theme.material} style={pixel ? orbitThemeStyle(theme) : undefined} noValidate onSubmit={event => {
      event.preventDefault();
      onApply(normalizeTempo(), draft);
      close();
    }}>
      <div className="orbit-settings-body">
        <div className="orbit-setting-row">
          <label htmlFor="orbit-bpm">速度</label>
          <div className="orbit-tempo">
            <input id="orbit-bpm" aria-label="速度" type="number" inputMode="numeric" min={40} max={240} step={1} value={tempo} onChange={event => setTempo(event.target.value)} onBlur={normalizeTempo} />
            <span>BPM</span>
            <button type="button" className="orbit-tempo-reset" disabled={Number(tempo) === defaultBpm} onClick={() => { lastTempo.current = defaultBpm; setTempo(String(defaultBpm)); }}>恢复默认</button>
          </div>
        </div>
        <section className="orbit-setting-row" aria-labelledby="orbit-range-title">
          <h3 id="orbit-range-title">练习范围</h3>
          <div className="orbit-range-fields">
            <select aria-label="起始小节" value={draft.startMeasure} onChange={event => {
              const startMeasure = Number(event.target.value);
              setDraft({ startMeasure, endMeasure: Math.max(draft.endMeasure, startMeasure + 1) });
            }}>{measures.map(index => <option key={index} value={index}>{measureLabel(index)}</option>)}</select>
            <span aria-hidden="true">至</span><select aria-label="结束小节" value={draft.endMeasure} onChange={event => {
              const endMeasure = Number(event.target.value);
              setDraft({ startMeasure: Math.min(draft.startMeasure, endMeasure - 1), endMeasure });
            }}>{measures.map(index => <option key={index} value={index + 1}>{measureLabel(index)}</option>)}</select>
          </div>
        </section>
        {about && <section className="orbit-setting-row orbit-about" aria-labelledby="orbit-about-title"><h3 id="orbit-about-title">关于乐曲</h3><div><h4>{about.title}</h4><p>{about.credit}</p><p>{about.description}</p></div></section>}
      </div>
      <div className="app-dialog-footer"><button type="button" onClick={close}>取消</button><button className="app-dialog-primary" type="submit">应用设置</button></div>
    </form>}
  </Modal>;
}
