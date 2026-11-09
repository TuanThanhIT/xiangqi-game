// Run from repo root with local web/backend running. Uses existing Chrome, no npm dependency.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const web = "http://localhost:3000", backend = "http://localhost:3001";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await pause(150);
  }
  throw new Error(`Timeout: ${label}`);
}
async function httpChecks() {
  const health = await fetch(backend + "/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  assert.match(health.headers.get("x-request-id"), uuid);
  const post = (url, nickname, id = randomUUID()) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", "x-request-id": id }, body: JSON.stringify({ nickname }),
  });
  const id = randomUUID();
  const created = await post(web + "/api/rooms", "Base HTTP Đỏ", id);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("x-request-id"), id);
  const session = await created.json();
  assert.deepEqual(Object.keys(session).sort(), ["nickname", "roomCode", "seat", "seatToken"]);
  assert.equal(session.seat, "red");
  const joined = await post(web + `/api/rooms/${session.roomCode}/join`, "Base HTTP Đen");
  assert.equal(joined.status, 200);
  assert.equal((await joined.json()).seat, "black");
  const errorId = randomUUID();
  const failed = await post(web + `/api/rooms/${session.roomCode}/join`, "Base HTTP Khác", errorId);
  const direct = await post(backend + `/rooms/${session.roomCode}/join`, "Base HTTP Khác", errorId);
  assert.equal(failed.status, 409);
  assert.equal(direct.status, failed.status);
  assert.equal(failed.headers.get("x-request-id"), errorId);
  assert.equal(direct.headers.get("x-request-id"), errorId);
  assert.deepEqual(await failed.json(), await direct.json());
  console.log(`PASS HTTP: health 200; proxy create 201 (${id}); join 200; ROOM_FULL 409 (${errorId}), body/status/ID khớp NestJS.`);
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("close", () => {
    for (const task of pending.values()) task.reject(new Error("CDP connection closed"));
    pending.clear();
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (!message.id) return;
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error("CDP command failed")); else task.done(message.result);
  });
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      return new Promise((done, reject) => {
        const id = ++sequence;
        pending.set(id, { done, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function browserChecks() {
  const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  if (!chrome) throw new Error("Không tìm thấy Chrome/Edge local.");
  const profile = mkdtempSync(join(tmpdir(), "xiangqi-base-"));
  const child = spawn(chrome, ["--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  const connections = [];
  let browser;
  try {
    const portFile = join(profile, "DevToolsActivePort");
    await until(() => existsSync(portFile), "Chrome debugging port");
    const [port, path] = readFileSync(portFile, "utf8").trim().split(/\r?\n/);
    browser = await connect(`ws://127.0.0.1:${port}${path}`);
    async function page(url) {
      const { browserContextId } = await browser.send("Target.createBrowserContext");
      const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const client = await connect(targets.find((target) => target.id === targetId).webSocketDebuggerUrl);
      connections.push(client);
      const evaluate = async (expression) => {
        const result = await client.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error("Browser evaluation failed");
        return result.result.value;
      };
      await client.send("Page.navigate", { url });
      await client.send("Page.bringToFront");
      return { evaluate, wait: (expression) => until(() => evaluate(expression), expression) };
    }
    const red = await page(web + "/play?mode=create");
    await red.wait('!!document.querySelector("#room-nickname:not(:disabled)")');
    const fill = (selector, value) => `(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`;
    await red.evaluate(fill("#room-nickname", "Base Browser Đỏ"));
    await red.evaluate('document.querySelector("form button[type=submit]").click()');
    await red.wait('document.body.innerText.includes("Đã giữ ghế · online")');
    console.log("Chrome: đã tạo phòng và xác thực ghế Đỏ.");
    const code = await red.evaluate('JSON.parse(localStorage.getItem("xiangqi.room.v1")).roomCode');
    const black = await page(web + "/play?mode=join");
    await black.wait('!!document.querySelector("#room-code:not(:disabled)")');
    await black.evaluate(fill("#room-nickname", "Base Browser Đen"));
    await black.evaluate(fill("#room-code", code));
    await black.evaluate('document.querySelector("form button[type=submit]").click()');
    for (const player of [red, black]) await player.wait('document.querySelectorAll(".board-intersection").length === 90 && document.body.innerText.includes("Base Browser Đỏ") && document.body.innerText.includes("Base Browser Đen")');
    console.log("Chrome: đã vào phòng và đồng bộ hai bàn.");
    const local = await page(web + "/local");
    await local.wait('document.querySelectorAll(".board-intersection").length === 90 && !!document.querySelector(".xq-turn")');
    await local.wait('Object.keys(document.querySelector(".board-intersection")).some(key => key.startsWith("__reactProps$"))');
    await local.evaluate('document.querySelectorAll(".board-intersection")[54].dispatchEvent(new MouseEvent("click", { bubbles: true }))');
    await local.wait('document.querySelectorAll(".board-intersection")[54].getAttribute("aria-pressed") === "true"');
    await local.evaluate('document.querySelectorAll(".board-intersection")[45].dispatchEvent(new MouseEvent("click", { bubbles: true }))');
    await local.wait('document.querySelector(".xq-turn").innerText.includes("Đen")');
    const portal = await page(web + "/");
    await portal.wait('document.body.innerText.includes("Khai cuộc")');
    console.log("PASS Chrome headless: tạo/vào phòng bằng hai browser context, Socket.IO đồng bộ bàn 90 giao điểm; local đi Tốt và chuyển lượt Đen; cổng Khai cuộc tải được.");
  } finally {
    for (const client of connections) client.close();
    if (browser) { await browser.send("Browser.close").catch(() => {}); browser.close(); }
    if (child.exitCode === null) child.kill();
    await pause(500);
    if (resolve(profile).startsWith(resolve(tmpdir()) + "\\") || resolve(profile).startsWith(resolve(tmpdir()) + "/")) {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  }
}

try { await httpChecks(); await browserChecks(); }
catch (error) { console.error("FAIL Base smoke:", error.message); process.exitCode = 1; }
