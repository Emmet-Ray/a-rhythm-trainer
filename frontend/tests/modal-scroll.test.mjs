import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
const { lockModalScroll } = await server.ssrLoadModule('/src/ui/modalScroll.ts');
await server.close();

test('嵌套弹窗按任意顺序关闭，最后一层释放滚动锁；重复清理不破坏下一轮', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const body = { style: { overflow: 'auto' } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'document', previous) : delete globalThis.document);
  const outer = lockModalScroll(), inner = lockModalScroll();
  assert.equal(body.style.overflow, 'hidden');
  outer(); outer();
  assert.equal(body.style.overflow, 'hidden');
  inner();
  assert.equal(body.style.overflow, 'auto');
  const next = lockModalScroll();
  inner();
  assert.equal(body.style.overflow, 'hidden');
  next();
  assert.equal(body.style.overflow, 'auto');
});
