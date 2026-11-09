import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const accountId = "6b477683-312d-4c43-812d-c9ae45a14b75";
async function open(page, route) {
  if (route.startsWith("/verify-email")) {
    // Layout-only fixture: no account creation, OTP generation or mail delivery.
    await page.route("**/api/auth/verification/status", (request) => request.fulfill({ json: {
      status: "pending_verification", accountId, maskedEmail: "t***@example.test",
      pendingExpiresAt: new Date(Date.now() + 86400000).toISOString(), otpExpiresAt: new Date(Date.now() + 300000).toISOString(),
      resendAt: new Date(Date.now() + 60000).toISOString(), delivery: "not_sent",
    } }));
  }
  await page.goto(route);
  await page.getByRole("button", { name: route === "/register" ? "Tạo tài khoản" : route === "/login" ? "Đăng nhập" : "Xác minh", exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function metrics(page) {
  return page.evaluate(() => {
    const box = (selector) => { const rect = document.querySelector(selector).getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, height: rect.height }; };
    return { viewport: innerHeight, document: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      width: innerWidth, documentWidth: document.documentElement.scrollWidth, scrollY, header: box("header"), main: box("main"), card: box("main section") };
  });
}
async function fullyVisible(page, locator) {
  // boundingBox only reads geometry; unlike click/focus it does not scroll the control into view.
  const box = await locator.boundingBox(), height = await page.evaluate(() => innerHeight);
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
}
for (const size of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  test(`Auth mặc định hiện trọn ${size.width}×${size.height} không cuộn`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "Desktop sizes are checked in the desktop project.");
    await page.setViewportSize(size);
    for (const [route, button, link, name] of [
      ["/register", "Tạo tài khoản", "Đăng nhập", "register"],
      ["/login", "Đăng nhập", "Đăng ký", "login"],
      [`/verify-email?account=${accountId}`, "Xác minh", "Về đăng nhập", "otp"],
    ]) {
      await open(page, route);
      const data = await metrics(page);
      expect(data.scrollY).toBe(0);
      expect(data.document).toBeLessThanOrEqual(size.height);
      expect(data.documentWidth).toBeLessThanOrEqual(size.width);
      await fullyVisible(page, page.getByRole("button", { name: button, exact: true }));
      await fullyVisible(page, page.getByRole("link", { name: link, exact: true }));
      expect(await page.evaluate(() => scrollY)).toBe(0);
      const directory = resolve(process.env.AUTH_SCREENSHOTS_DIR ?? "../../docs/design/screenshots/auth-layout");
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: resolve(directory, `${name}-after-${size.width}x${size.height}.png`), fullPage: true });
      console.log(`${name} ${size.width}x${size.height}: ${JSON.stringify(data)}`);
    }
  });
}

test("Auth mobile: lỗi form, focus và nút gửi luôn tiếp cận được khi chiều cao giảm", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "Mobile only.");
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, "/register");
  const initial = await metrics(page);
  expect(initial.document).toBeLessThanOrEqual(812);
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(page.getByLabel("Biệt danh", { exact: true })).toBeFocused();
  await expect(page.getByText("Biệt danh cần từ 1 đến 30 ký tự.", { exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Mật khẩu", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Hiện mật khẩu", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  const send = page.getByRole("button", { name: "Tạo tài khoản", exact: true });
  await expect(send).toBeFocused();
  await fullyVisible(page, send);
  const directory = resolve(process.env.AUTH_SCREENSHOTS_DIR ?? "../../docs/design/screenshots/auth-layout");
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, "register-error-after-375x812.png"), fullPage: true });
  // Reduced viewport models lost vertical space, not a real OS virtual keyboard.
  await page.setViewportSize({ width: 375, height: 460 });
  await page.getByLabel("Biệt danh", { exact: true }).focus();
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await expect(send).toBeFocused(); await fullyVisible(page, send);
  const reduced = await metrics(page);
  expect(reduced.document).toBeGreaterThan(reduced.viewport);
  expect(reduced.scrollY).toBeGreaterThan(0);
  expect(reduced.documentWidth).toBeLessThanOrEqual(375);
  const overflow = await page.evaluate(() => [document.body, document.documentElement].map((node) => getComputedStyle(node).overflowY));
  expect(overflow.every((value) => !["hidden", "clip"].includes(value))).toBe(true);
  console.log(`mobile error/reduced: ${JSON.stringify(reduced)}`);
  await page.screenshot({ path: resolve(directory, "register-focus-after-375x460.png") });
});
