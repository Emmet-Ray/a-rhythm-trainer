import type { ReactNode } from "react";

/** 播放、调速和辅助操作组成顶部控制区；谱面与作答使用工作区宽度排列。 */
export default function PracticeFrame({ toolbar, settingsPanel, utilities, children }: {
  toolbar: ReactNode;
  settingsPanel?: ReactNode;
  utilities?: ReactNode;
  children: ReactNode;
}) {
  return <div className="practice-layout practice-layout--training design-system">
    <div className="practice-controls">
      <div className="practice-toolbar">{toolbar}</div>
      {settingsPanel}
      {utilities && <div className="practice-utilities">{utilities}</div>}
    </div>
    <div className="practice-body">
      <div className="practice-content">{children}</div>
    </div>
  </div>;
}
