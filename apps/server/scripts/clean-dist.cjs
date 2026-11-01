const { rmSync } = require("node:fs");
const { resolve, dirname } = require("node:path");

const serverRoot = resolve(__dirname, "..");
const output = resolve(serverRoot, "dist");
if (dirname(output) !== serverRoot) {
  throw new Error("Không xóa output nằm ngoài workspace server");
}
rmSync(output, { recursive: true, force: true });
