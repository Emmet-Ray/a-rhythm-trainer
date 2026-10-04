/** 同组播放器互斥；停止包含声音准备阶段，旧播放器释放不会误停新播放器。 */
export class PlaybackGroup {
  private current: { stop: () => void } | null = null;

  acquire(stop: () => void): () => void {
    this.stop();
    const owner = { stop };
    this.current = owner;
    return () => { if (this.current === owner) this.current = null; };
  }

  stop(): void {
    const owner = this.current;
    this.current = null;
    owner?.stop();
  }
}
