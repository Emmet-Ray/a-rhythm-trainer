type Visit = { key: string; path: string };

/** 仅保存本次应用会话内显式声明的页面状态，不做跨刷新持久化。
 * 历史记录以 key 区分同一地址的多次访问；未知历史不推测返回距离。
 */
export class PageVisits {
  private history: Visit[] = [];
  private index = -1;
  private values = new Map<string, unknown>();
  private positions = new Map<string, number>();

  enter(visit: Visit, action: "POP" | "PUSH" | "REPLACE") {
    if (this.history[this.index]?.key === visit.key) return;
    const known = this.history.findIndex(item => item.key === visit.key);
    if (action === "POP" && known >= 0) this.index = known;
    else if (action === "REPLACE" && this.index >= 0) this.history[this.index] = visit;
    else if (action === "PUSH") {
      this.history = this.history.slice(0, this.index + 1);
      this.history.push(visit);
      this.index++;
    } else {
      this.history = [visit];
      this.index = 0;
    }
  }

  backDistance(path: string): number | undefined {
    for (let index = this.index - 1; index >= 0; index--) {
      if (this.history[index].path === path) return index - this.index;
    }
  }

  read<T>(key: string, field: string, initial: T): T {
    return this.values.has(`${key}:${field}`) ? this.values.get(`${key}:${field}`) as T : initial;
  }

  write<T>(key: string, field: string, value: T) {
    this.values.set(`${key}:${field}`, value);
  }

  /** 异步保存成功时只清除提交的版本，不丢弃离开后再次编辑产生的新版本。 */
  forget<T>(key: string, field: string, expected: T) {
    const id = `${key}:${field}`;
    if (this.values.get(id) === expected) this.values.delete(id);
  }

  position(key: string) { return this.positions.get(key) ?? 0; }
  savePosition(key: string, top: number) { this.positions.set(key, top); }
}
