import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../src/', import.meta.url));
// Only constrain modules intended for independent reuse; application assembly may connect features.
const dependencies = {
  rhythm: new Set(['rhythm']),
  practice: new Set(['practice', 'rhythm', 'ui', 'settings']),
  'practice-records': new Set(['practice-records', 'practice', 'rhythm', 'ui', 'settings', 'navigation', 'query']),
  exercises: new Set(['exercises', 'rhythm']),
  ui: new Set(['ui']),
};
const errors = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(filename); continue; }
    if (!/\.tsx?$/.test(filename)) continue;
    const source = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const owner = path.relative(root, filename).split(path.sep)[0];
    function check(node) {
      const ref = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (ref && ts.isStringLiteral(ref)) {
        const target = ref.text.startsWith('.') ? path.relative(root, path.resolve(path.dirname(filename), ref.text)).split(path.sep)[0] : undefined;
        const forbidden = target && dependencies[owner] && !dependencies[owner].has(target)
          || owner === 'assistant' && target === 'pages'
          || owner === 'practice' && ref.text === 'react-router';
        if (forbidden) {
          const { line } = source.getLineAndCharacterOfPosition(ref.getStart(source));
          errors.push(`${path.relative(root, filename)}:${line + 1}: ${owner} must not depend on ${ref.text}`);
        }
      }
      ts.forEachChild(node, check);
    }
    check(source);
  }
}
await inspect(root);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Module boundaries verified: rhythm, practice, records, exercises, UI and assistant/page separation.');
