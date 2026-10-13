import { useContext, useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { practiceSounds, metronomeSounds } from "../rhythm/SoundSamples";
import { prepareTapSound, prepareMetronomeSound, scheduleTapSound, scheduleCountIn } from "../rhythm/RhythmAudio";
import { PlaybackContext } from "../practice/PlaybackGroup";
import { useAssistantPageSection } from "../assistant/assistantContext";
import { DEFAULT_SOUNDS, getSoundPreferences, selectSounds } from "./soundPreferences";

export default function SoundSettings() {
  const [preference, setPreference] = useState(getSoundPreferences);
  const [message, setMessage] = useState("");
  const playback = useContext(PlaybackContext);
  const preview = useRef<{ context: AudioContext; release: () => void } | null>(null);
  useAssistantPageSection("sound", { practice: preference.practice, metronome: preference.metronome });
  function stop() {
    const active = preview.current;
    preview.current = null;
    if (active) { active.release(); void active.context.close(); }
  }
  useEffect(() => () => {
    const active = preview.current;
    preview.current = null;
    if (active) { active.release(); void active.context.close(); }
  }, []);

  async function listen(kind: "practice" | "metronome", selected: ReturnType<typeof getSoundPreferences>) {
    stop();
    setMessage("");
    const context = new AudioContext();
    const active = { context, release: playback?.acquire(stop) ?? (() => {}) };
    preview.current = active;
    try {
      await Promise.all([context.resume(), kind === "practice"
        ? prepareTapSound(context, selected.practice)
        : prepareMetronomeSound(context, selected.metronome)]);
      if (preview.current !== active) return;
      const at = context.currentTime + 0.05;
      const sources: AudioScheduledSourceNode[] = [];
      for (let beat = 0; beat < 4; beat++) {
        if (kind === "practice") scheduleTapSound(context, at + beat, at + beat + 1, sources);
        else scheduleCountIn(context, at + beat, beat === 0, sources);
      }
      // Retire the preview context only after its final source has naturally ended.
      const last = sources.at(-1)!;
      const cleanup = last.onended;
      last.onended = event => {
        cleanup?.call(last, event);
        if (preview.current === active) stop();
      };
    } catch {
      if (preview.current !== active) return;
      stop();
      setMessage("声音加载失败，请重试。");
    }
  }
  return (
    <section className="settings-section sound-settings" aria-labelledby="sound-heading">
      <h2 id="sound-heading">声音</h2>
      {(["practice", "metronome"] as const).map(kind => (
        <div className="sound-setting" key={kind}>
          <label id={kind + "-sound-label"}>{kind === "practice" ? "练习音色" : "节拍器音色"}</label>
          <Select.Root value={preference[kind]} onValueChange={value => {
            const selected = selectSounds({ ...preference, [kind]: value });
            setPreference(selected);
            void listen(kind, selected);
          }}>
            <Select.Trigger className="record-filter-trigger" aria-labelledby={kind + "-sound-label"}>
              <Select.Value /><Select.Icon asChild><ChevronDown size={16} aria-hidden="true" /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="record-filter-menu" position="popper" align="start" sideOffset={6} collisionPadding={12}>
                <Select.Viewport>
                  {(kind === "practice" ? practiceSounds : metronomeSounds).map(sound => (
                    <SoundOption key={sound.id} value={sound.id} label={sound.label}
                      onReselect={sound.id === preference[kind] ? () => void listen(kind, preference) : undefined} />
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
      ))}
      <div className="settings-actions">
        <button type="button" onClick={() => { stop(); setMessage(""); setPreference(selectSounds(DEFAULT_SOUNDS)); }}>恢复默认</button>
      </div>
      <p className="settings-message" role="status">{message || (!preference.storageAvailable && "浏览器存储不可用，本次选择仍会生效，但刷新后可能恢复默认。")}</p>
    </section>
  );
}


// Radix only emits onValueChange for a different value. Replaying the selected
// option follows its mouse/touch/keyboard activation paths, never hover or focus.
function SoundOption({ value, label, onReselect }: { value: string; label: string; onReselect?: () => void }) {
  const pointer = useRef("touch");
  return <Select.Item value={value} className="record-filter-option"
    onPointerDown={event => { pointer.current = event.pointerType; }}
    onPointerMove={event => { pointer.current = event.pointerType; }}
    onPointerUp={() => { if (pointer.current === "mouse") onReselect?.(); }}
    onClick={() => { if (pointer.current !== "mouse") onReselect?.(); }}
    onKeyDown={event => {
      if ((event.key === "Enter" || event.key === " ") && !event.repeat) onReselect?.();
    }}>
    <Select.ItemText>{label}</Select.ItemText>
    <Select.ItemIndicator><Check size={16} aria-hidden="true" /></Select.ItemIndicator>
  </Select.Item>;
}
