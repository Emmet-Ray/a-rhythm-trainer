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
    const relative = path.relative(root, filename);
    const owner = relative.split(path.sep)[0];
    function check(node) {
      const ref = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (ref && ts.isStringLiteral(ref)) {
        const target = ref.text.startsWith('.') ? path.relative(root, path.resolve(path.dirname(filename), ref.text)).split(path.sep)[0] : undefined;
        const targetPath = ref.text.startsWith('.') ? path.relative(root, path.resolve(path.dirname(filename), ref.text)) : '';
        const from = relative.split(path.sep), to = targetPath.split(path.sep);
        const typeOnly = ts.isImportDeclaration(node) && (node.importClause?.isTypeOnly ||
          (!node.importClause?.name && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
            && node.importClause.namedBindings.elements.every(e => e.isTypeOnly))) || ts.isExportDeclaration(node) && node.isTypeOnly;
        const engine = from[0] === 'game' && ['core', 'audio', 'runtime', 'rendering'].includes(from[1]);
        const allowedEngine = { core: ['core'], audio: ['core', 'audio'], runtime: ['core', 'audio', 'runtime'], rendering: ['core', 'audio', 'runtime', 'rendering'] };
        const gameViolation = target && (engine && !(target === 'rhythm' || target === 'game' &&
          (allowedEngine[from[1]].includes(to[1]) || typeOnly && ['core', 'audio', 'runtime', 'rendering'].includes(to[1])))
          || from[0] === 'game-content' && !(target === 'rhythm' || target === 'game-content' || target === 'game' &&
            (['core', 'audio'].includes(to[1]) || typeOnly && to[1] === 'rendering'))
          || from[0] === 'game-content' && to[0] === 'game-content' && to[1] === 'levels' &&
            (from[1] !== 'levels' || from[2] !== to[2]));
        const forbidden = gameViolation || target && dependencies[owner] && !dependencies[owner].has(target)
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
else console.log('Module boundaries verified: rhythm, practice, records, exercises, UI, game engine/content ownership and assistant/page separation.');
