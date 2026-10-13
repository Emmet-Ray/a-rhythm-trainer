import type { ReactNode } from "react";

/** 主要操作在左、范围与速度设置在右；窄屏按组换行。 */
export default function PracticeFrame({ toolbar, settingsPanel, scopeControls, children }: {
  toolbar: ReactNode;
  settingsPanel?: ReactNode;
  scopeControls?: ReactNode;
  children: ReactNode;
}) {
  return <div className="practice-layout practice-layout--training design-system">
    <div className="practice-controls">
      <div className="practice-toolbar">{toolbar}</div>
      {(settingsPanel || scopeControls) && <div className="practice-settings-row">
        {scopeControls && <div className="practice-scope-controls">{scopeControls}</div>}
        {settingsPanel}
      </div>}
    </div>
    <div className="practice-body">
      <div className="practice-content">{children}</div>
    </div>
  </div>;
}
