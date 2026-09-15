/** 谱面遮罩内容；计时与完成条件归调用方所有，点击结果只关闭提示。 */
export default function PracticeCue(props:
  | { countdown: number }
  | { passed: boolean; onDismiss: () => void }
) {
  if ("countdown" in props) return (
    <div className="trainer-countdown" role="img" aria-label={`预备拍：${props.countdown}`}>
      {props.countdown}
    </div>
  );
  return (
    <section className="trainer-result-layer" aria-label="练习结果" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); props.onDismiss(); }
    }}>
      <button type="button" className="trainer-result-dismiss" aria-label="关闭练习结果" onClick={props.onDismiss}>
        <span className="trainer-result" role="status" data-passed={props.passed}>
          <span aria-hidden="true">{props.passed ? "✓" : "×"}</span>
          {props.passed ? "通过" : "未通过"}
        </span>
      </button>
    </section>
  );
}
