/** 品牌节拍器：沿用功能控件的外框，省略刻度与底座；不连接播放状态。 */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="80" height="92" viewBox="0 0 80 92" fill="none" aria-hidden="true" focusable="false">
      <path d="M26 8 Q27 5 30 5 H50 Q53 5 54 8 L68 79 Q69 84 64 84 H16 Q11 84 12 79 Z"
        stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <g transform="rotate(10 40 76)">
        <path d="M40 76 V14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <rect x="34" y="29" width="12" height="16" rx="3" fill="currentColor" />
      </g>
      <circle cx="40" cy="76" r="4" fill="currentColor" />
    </svg>
  );
}
