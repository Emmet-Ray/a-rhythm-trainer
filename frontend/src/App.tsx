import { useState } from "react";
import "./App.css";

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [BPM, setBPM] = useState<number>(60);
  const [currentBeat, setCurrentBeat] = useState<number | null>(null);

  function handlePlay() {
    if (isPlaying) {
      setIsPlaying(false);
      setCurrentBeat(null);
    } else {
      setIsPlaying(true);
      setCurrentBeat(0);
    }
  }

  return (
    <>
      <h1>节奏训练器</h1>
      <p>击拍练习</p>
      {/* 这里先是示意的bpm，后面也要调整成动态调整的 */}
      <div>BPM: {BPM}</div>

      {/* 先写死，写成固定的一小节4/4拍的四分音符的节奏
          这里先用抽象的符号来表示

          todo: 这里后面要改成动态的当前练习的节奏片段
          todo：后面要使用具体的五线谱/其他节奏表示符号的库吧，vexflow等等
      */}
      <div className="beats">
        {[0, 1, 2, 3].map((beat) => (
          <span
            key={beat}
            className={currentBeat == beat ? "beat active" : "beat"}
          >
            {beat + 1}
          </span>
        ))}
      </div>
      <div>{isPlaying ? `current beat: ${currentBeat}` : "尚未开始"}</div>

      <div>
        {/* 点击开始之后，该按钮变为停止状态，先播放预备拍，用户敲击键盘进行击拍练习 */}
        <button type="button" onClick={handlePlay}>
          {isPlaying ? "停止" : "开始"}
        </button>
        {/* 点击试听之后，该按钮变为停止状态，先播放预备拍，然后系统自动播放击拍，高亮当前击拍音符，播放声音 */}
        <div>试听</div>
      </div>
    </>
  );
}

export default App;
