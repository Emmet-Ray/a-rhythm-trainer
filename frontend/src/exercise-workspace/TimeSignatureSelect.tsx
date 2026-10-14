import { useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { supportedBeats, type TimeSignature } from "../rhythm/RhythmModel";

/** 选择受支持的拍号；清空草稿等切换策略由拥有内容的工作区处理。 */
export function TimeSignatureSelect({ value, onChange }: {
  value: TimeSignature;
  onChange: (signature: TimeSignature) => void;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  return <Select.Root value={String(value.beats)} onValueChange={value => {
    const beats = supportedBeats.find(beats => String(beats) === value);
    if (beats !== undefined) onChange({ beats, beatType: 4 });
  }}>
    <Select.Trigger ref={setTrigger} className="record-filter-trigger" aria-label="拍号">
      <Select.Value /><Select.Icon asChild><ChevronDown size={16} aria-hidden="true" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal container={trigger?.closest("dialog") ?? undefined}>
      <Select.Content className="record-filter-menu" position="popper" align="start" sideOffset={6} collisionPadding={12}>
        <Select.Viewport>{supportedBeats.map(beats => <Select.Item key={beats} value={String(beats)} className="record-filter-option">
          <Select.ItemText>{beats}/4</Select.ItemText>
          <Select.ItemIndicator><Check size={16} aria-hidden="true" /></Select.ItemIndicator>
        </Select.Item>)}</Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
