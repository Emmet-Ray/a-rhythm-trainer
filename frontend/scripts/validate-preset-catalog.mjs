import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const file = process.argv[2] ? resolve(process.argv[2]) : resolve(root, "../content/preset-exercises.json");
const server = await createServer({ root, configFile: false,
  server: { middlewareMode: true, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { parsePresetCatalog } = await server.ssrLoadModule("/src/exercises/presetCatalog.ts");
  const catalog = parsePresetCatalog(JSON.parse(await readFile(file, "utf8")));
  const questions = catalog.topics.flatMap(topic => topic.modes.flatMap(group => group.questions));
  console.log(`校验通过：${catalog.topics.length} 个主题，${questions.length} 道题。\n${file}`);
} catch (error) {
  console.error(`题库校验失败：${file}\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await server.close();
}
