import { useState } from "react";
import type { RhythmExercise } from "./RhythmModel";
import RhythmTrainer from "./RhythmTrainer";
import "./App.css";

const PRESETS: {
  id: string;
  title: string;
  description: string;
  exercise: RhythmExercise;
}[] = [
  {
    id: "quarters",
    title: "练习 1：四分音符",
    description: "4/4 拍 · 四个均匀的四分音符，练习保持稳定速度。",
    exercise: {
      timeSignature: { beats: 4, beatType: 4 },
      events: [
        { kind: "note", noteValue: "quarter" },
        { kind: "note", noteValue: "quarter" },
        { kind: "note", noteValue: "quarter" },
        { kind: "note", noteValue: "quarter" },
      ],
    },
  },
  {
    id: "eighths",
    title: "练习 2：加入八分音符",
    description: "4/4 拍 · 三个四分音符后接两个八分音符，练习细分节拍。",
    exercise: {
      timeSignature: { beats: 4, beatType: 4 },
      events: [
        { kind: "note", noteValue: "quarter" },
        { kind: "note", noteValue: "quarter" },
        { kind: "note", noteValue: "quarter" },
        { kind: "note", noteValue: "eighth" },
        { kind: "note", noteValue: "eighth" },
      ],
    },
  },
  {
    id: "rests",
    title: "练习 3：音符与休止符",
    description: "4/4 拍 · 加入四分和八分休止符，练习在停顿中保持节奏。",
    exercise: {
      timeSignature: { beats: 4, beatType: 4 },
      events: [
        { kind: "note", noteValue: "quarter" },
        { kind: "rest", noteValue: "quarter" },
        { kind: "note", noteValue: "eighth" },
        { kind: "rest", noteValue: "eighth" },
        { kind: "note", noteValue: "quarter" },
      ],
    },
  },
  {
    id: "halves",
    title: "练习 4：二分音符",
    description: "4/4 拍 · 两个二分音符，每隔两拍敲一次。",
    exercise: {
      timeSignature: { beats: 4, beatType: 4 },
      events: [
        { kind: "note", noteValue: "half" },
        { kind: "note", noteValue: "half" },
      ],
    },
  },
  {
    id: "whole",
    title: "练习 5：全音符",
    description: "4/4 拍 · 起点只敲一次，保持四拍，不要重复敲击。",
    exercise: {
      timeSignature: { beats: 4, beatType: 4 },
      events: [{ kind: "note", noteValue: "whole" }],
    },
  },
];

const MIN_BPM = 40;
const MAX_BPM = 240;

function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [bpm, setBpm] = useState(60);
  // 输入草稿与生效配置分开，避免输入到一半时反复停止练习。
  const [bpmInput, setBpmInput] = useState("60");
  const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[0];

  return (
    <>
      <h1>节奏训练器</h1>
      <section className="exercise-settings" aria-label="练习设置">
        <label className="exercise-field">
          节奏练习
          <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
            {PRESETS.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </label>
        <p>{preset.description}</p>
        <form
          className="tempo-settings"
          onSubmit={(event) => {
            event.preventDefault();
            const nextBpm = Number(bpmInput);
            if (!Number.isInteger(nextBpm) || nextBpm < MIN_BPM || nextBpm > MAX_BPM) return;
            setBpm(nextBpm);
            setBpmInput(String(nextBpm));
          }}
        >
          <label className="exercise-field">
            BPM
            <input
              type="number"
              min={MIN_BPM}
              max={MAX_BPM}
              step={1}
              required
              value={bpmInput}
              aria-describedby="tempo-help"
              onChange={(event) => setBpmInput(event.target.value)}
            />
          </label>
          <button type="submit">应用速度</button>
        </form>
        <p id="tempo-help" className="settings-hint">
          BPM 支持 40–240。点击“应用速度”或按回车生效；切换练习或应用新速度会停止当前轮。
        </p>
      </section>
      {/* 生效配置变化即卸载旧一轮，复用训练组件已有的音频与监听清理。 */}
      <RhythmTrainer key={`${preset.id}:${bpm}`} exercise={preset.exercise} bpm={bpm} />
    </>
  );
}

export default App;
