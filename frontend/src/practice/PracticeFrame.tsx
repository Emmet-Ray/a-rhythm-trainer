import type { ReactNode } from "react";

/** 共用练习布局：顶部通栏、主内容和设置侧栏；不持有练习或播放状态。 */
export default function PracticeFrame({ toolbar, settingsPanel, children }: {
  toolbar: ReactNode;
  settingsPanel?: ReactNode;
  children: ReactNode;
}) {
  return <div className="practice-layout practice-layout--sidebar design-system">
    <div className="practice-toolbar">{toolbar}</div>
    <div className="practice-body">
      <div className="practice-content">{children}</div>
      {settingsPanel}
    </div>
  </div>;
}
