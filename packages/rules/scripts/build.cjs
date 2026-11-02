const { rmSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const output = resolve(root, "dist");
if (dirname(output) !== root) throw new Error("Output build nằm ngoài rules");
rmSync(output, { recursive: true, force: true });
const result = spawnSync(process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json"],
  { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
