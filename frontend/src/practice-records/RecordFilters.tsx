import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { RecordFilter, RecordPeriod } from "./practiceRecords";

/** 同级筛选共用菜单样式；焦点、键盘与弹层定位由 Radix 管理。 */
export function RecordFilters({ mode, period, onModeChange, onPeriodChange }: {
  mode: RecordFilter; period: RecordPeriod;
  onModeChange: (mode: RecordFilter) => void; onPeriodChange: (period: RecordPeriod) => void;
}) {
  const filters = [
    { label: "练习模式", value: mode, change: (value: string) => onModeChange(value as RecordFilter),
      options: [["all", "全部模式"], ["tapping", "击拍练习"], ["dictation", "节奏听写"]] },
    { label: "时间范围", value: period, change: (value: string) => onPeriodChange(value as RecordPeriod),
      options: [["all", "全部时间"], ["week", "近 7 天"], ["month", "近 30 天"]] },
  ];
  return <div className="record-filters" role="group" aria-label="记录筛选">
    {filters.map(filter => <Select.Root key={filter.label} value={filter.value} onValueChange={filter.change}>
      <Select.Trigger className="record-filter-trigger" aria-label={filter.label}>
        <Select.Value /><Select.Icon asChild><ChevronDown size={16} aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal><Select.Content className="record-filter-menu" position="popper" align="end" sideOffset={6} collisionPadding={12}>
        <Select.Viewport>{filter.options.map(([value, label]) => <Select.Item key={value} value={value} className="record-filter-option">
          <Select.ItemText>{label}</Select.ItemText>
          <Select.ItemIndicator><Check size={16} aria-hidden="true" /></Select.ItemIndicator>
        </Select.Item>)}</Select.Viewport>
      </Select.Content></Select.Portal>
    </Select.Root>)}
  </div>;
}
