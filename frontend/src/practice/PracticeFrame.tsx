import type { ReactNode } from "react";

/** 设置先于谱面进入阅读/键盘顺序；宽屏放在右侧，窄屏自然排在上方，不重挂载。 */
export default function PracticeFrame({ toolbar, settingsPanel, children }: {
  toolbar: ReactNode;
  settingsPanel?: ReactNode;
  children: ReactNode;
}) {
  return <div className="practice-layout practice-layout--sidebar design-system">
    <div className="practice-toolbar">{toolbar}</div>
    <div className="practice-body">
      {settingsPanel}
      <div className="practice-content">{children}</div>
    </div>
  </div>;
}
