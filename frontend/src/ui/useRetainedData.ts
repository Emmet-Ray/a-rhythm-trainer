import { useState } from "react";

/** 切换筛选时保持上次展示的完整结果，成功后一次替换；失败也不清空。
 * 仅保存本组件的展示快照，不请求、不缓存查询、不处理重试。
 * 不同资源应通过组件 key 隔离，结果必须携带自己的筛选／分页身份。
 */
export function useRetainedData<T>(data: T | undefined, updating: boolean): T | undefined {
  const [displayed, setDisplayed] = useState(data);
  if (!updating && data !== undefined && data !== displayed) setDisplayed(data);
  return !updating && data !== undefined ? data : displayed;
}
