/** 谱面只展示预备拍，整体结果放在工具栏。 */
export default function PracticeCue(props: { countdown: number }) {
  return (
    <div className="trainer-countdown" role="img" aria-label={`预备拍：${props.countdown}`}>
      {props.countdown}
    </div>
  );
}
