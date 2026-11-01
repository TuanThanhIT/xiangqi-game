const { rmSync, readdirSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { spawnSync } = require("node:child_process");
const root = resolve(__dirname, "..");
const output = resolve(root, ".test-output");
if (dirname(output) !== root) throw new Error("Output test nằm ngoài server");
rmSync(output, { recursive: true, force: true });
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run([require.resolve("typescript/bin/tsc"), "-p", "tsconfig.test.json"]);
const testRoot = resolve(output, "tests");
const files = readdirSync(testRoot, { recursive: true }).filter((file) => file.endsWith(".test.js"))
  .map((file) => resolve(testRoot, file));
if (!files.length) throw new Error("Không tìm thấy test");
run(["--test", ...files]);
