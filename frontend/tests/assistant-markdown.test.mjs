import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { AssistantMarkdown } = await server.ssrLoadModule('/src/assistant/AssistantMarkdown.tsx');
const render = text => renderToStaticMarkup(createElement(AssistantMarkdown, { text }));

test('基础格式使用语义元素，标题保持聊天层级', () => {
  const html = render('# 建议\n\n**稳住**，*慢练*，`60 BPM`。\n\n1. 听题\n2. 击拍\n\n- 四分音符\n\n> 保持均匀\n\n```text\n1 & 2 &\n```\n\n[资料](https://example.com)');
  for (const fragment of ['<h3>建议</h3>', '<strong>稳住</strong>', '<em>慢练</em>', '<code>60 BPM</code>', '<ol>', '<ul>', '<blockquote>', '<pre>', 'href="https://example.com"', 'rel="noopener noreferrer"']) assert.ok(html.includes(fragment), fragment);
  assert.ok(!html.includes('<h1>'));
});

test('不执行 HTML 或危险链接，不加载图片；代码里的 HTML 仍按文本显示', () => {
  const html = render('<script>alert(1)</script>\n\n[危险](javascript:alert%281%29)\n\n![谱面](https://example.com/track.png)\n\n`<button>按钮</button>`');
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('track.png'));
  assert.ok(html.includes('谱面'));
  assert.ok(html.includes('&lt;button&gt;'));
});

test('未闭合流式片段和最终格式都能渲染，不丢失内容', () => {
  const pieces = ['建议 **慢', '建议 **慢练**\n\n1. 听', '建议 **慢练**\n\n1. 听题\n2. 击拍\n\n```text\n1 &'];
  for (const text of pieces) assert.ok(render(text).includes('建议'));
  assert.ok(render(pieces[1]).includes('<strong>慢练</strong>'));
  assert.ok(render(pieces[2]).includes('<pre>'));
});
