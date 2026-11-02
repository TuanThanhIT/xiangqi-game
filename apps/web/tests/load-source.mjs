import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Dùng compiler đã có; chỉ nạp mã nguồn trong bộ nhớ, không tạo output hoặc thêm framework.
export function loader(mocks = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = { exports: {} }; cache.set(filename, loaded);
    const native = createRequire(filename);
    function requireSource(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith(".") || name.startsWith("@/")) {
        const base = name.startsWith("@/") ? path.resolve("apps/web/src", name.slice(2)) : path.resolve(path.dirname(filename), name);
        for (const candidate of [base, base + ".ts", base + ".tsx"]) {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return load(candidate);
        }
      }
      return native(name);
    }
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    new Function("require", "module", "exports", output)(requireSource, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}
