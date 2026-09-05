/**
 * 为本轮练习固定一个音频时钟上的正式起点，并提供两种时间读法。
 * 正式起点位于“创建时刻 + 调度余量 + 预备拍总时长”之后。
 * leadInMs 只给第一声预留排程时间；声音和判定共用同一起点，不会额外增加敲击误差。
 *
 * nowMs()：每次调用时读取最新音频时间，返回距离正式起点的毫秒数。
 *   起点为 0ms，预备拍期间为负数，正式开始后为非负数。
 * audioTimeAt(offsetMs)：把相对正式起点的毫秒数转换为音频时间轴上的秒数，
 *   用于 oscillator.start() 等音频排程；返回的是播放时刻，不是等待时长。
 *
 * 例如创建时音频时间为 10 秒，余量 100ms、预备拍 3000ms：
 * 正式起点为 13.1 秒，audioTimeAt(-3000) 为 10.1 秒；
 * 当音频时间走到 13.15 秒时，nowMs() 约为 50ms。
 */
export function createPracticeClock(
  context: Pick<AudioContext, "currentTime">,
  countInDurationMs: number,
  leadInMs = 100,
) {
  const practiceStartsAtSeconds =
    context.currentTime + (leadInMs + countInDurationMs) / 1000;

  return {
    nowMs: () => (context.currentTime - practiceStartsAtSeconds) * 1000,
    // 只有安排声音时，才把练习相对毫秒转换成音频绝对秒数。
    audioTimeAt: (offsetMs: number) =>
      practiceStartsAtSeconds + offsetMs / 1000,
  };
}

export type PracticeClock = ReturnType<typeof createPracticeClock>;

/** 提前安排一声预备拍提示音，并保留声源以便中途取消。 */
export function scheduleCountIn(
  context: AudioContext,
  startsAt: number,
  accent: boolean,
  sources: AudioScheduledSourceNode[],
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const duration = 0.035;
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(accent ? 1350 : 900, startsAt);
  gain.gain.setValueAtTime(accent ? 0.11 : 0.075, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startsAt + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
    const index = sources.indexOf(oscillator);
    if (index !== -1) sources.splice(index, 1);
  };
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.005);
  sources.push(oscillator);
}

/** 立即播放用户击拍音；每次调用产生一声，结束后释放节点。 */
export function playTapSound(context: AudioContext): void {
  scheduleTapSound(context, context.currentTime);
}

/** 试听与用户击拍共用这一音色；试听传入声源列表，以便停止时取消排程。 */
export function scheduleTapSound(
  context: AudioContext,
  startsAt: number,
  sources?: AudioScheduledSourceNode[],
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  const duration = 0.05; // 50ms 的短音

  // 使用比预备拍更低的音，便于区分自己的敲击。
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(600, startsAt);

  // 先快速起音，再衰减。
  gain.gain.setValueAtTime(0, startsAt);
  gain.gain.linearRampToValueAtTime(0.15, startsAt + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, startsAt + duration);

  oscillator.connect(gain).connect(context.destination);

  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
    if (sources) {
      const index = sources.indexOf(oscillator);
      if (index !== -1) sources.splice(index, 1);
    }
  };

  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration);
  sources?.push(oscillator);
}
