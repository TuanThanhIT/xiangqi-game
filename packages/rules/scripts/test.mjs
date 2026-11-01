import { readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, ".test-output");

// Đường dẫn cố định bên trong workspace rules; xóa trước mọi lần biên dịch.
if (dirname(output) !== root) throw new Error("Output test nằm ngoài workspace rules");
rmSync(output, { recursive: true, force: true });

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([require.resolve("typescript/bin/tsc"), "--project", "tsconfig.test.json"]);
const testsRoot = resolve(output, "tests");
const tests = readdirSync(testsRoot, { recursive: true })
  .filter((file) => file.endsWith(".test.js"))
  .map((file) => resolve(testsRoot, file));
if (tests.length === 0) throw new Error("Không tìm thấy test đã biên dịch");
run(["--test", ...tests]);
