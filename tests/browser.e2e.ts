import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
import { mkdir } from "node:fs/promises";
const suffix = randomUUID(),
  roomId = "browser-" + suffix,
  adminId = randomUUID(),
  memberId = randomUUID();
const username = "browser-" + suffix,
  password = "Browser-password-191";
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
if (!address || typeof address === "string") throw Error("address");
const base = `http://127.0.0.1:${address.port}`;
process.env.APP_ORIGIN = base;
const browser = await chromium.launch({
  ...(process.env.CI ? {} : { channel: "chrome" }),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  const hash = await hashPassword(password);
  await pool.query(
    "INSERT INTO users VALUES($1,$2,$3,$4,$5),($6,$7,$8,$4,$9)",
    [
      adminId,
      username,
      "验收管理员",
      hash,
      "admin",
      memberId,
      username + "-member",
      "验收员工",
      "member",
    ],
  );
  const data = (await pool.query("SELECT data FROM rooms WHERE id='r1'"))
    .rows[0].data;
  await pool.query("INSERT INTO rooms(id,data) VALUES($1,$2)", [
    roomId,
    JSON.stringify({
      ...data,
      id: roomId,
      name: "验收空间",
      code: "QA-01",
      rule: "approval",
      status: "enabled",
    }),
  ]);
  async function login(name: string) {
    await page.goto(base);
    await page.getByLabel("账号", { exact: true }).fill(name);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.locator("#userName")).toHaveText(
      name === username ? "验收管理员" : "验收员工",
    );
  }
  await login(username + "-member");
  await expect(
    page.getByRole("button", { name: "预订规则", exact: true }),
  ).toBeHidden();
  await page.locator(`[data-room="${roomId}"]`).click();
  await page
    .getByRole("button", { name: "＋ 预订会议室", exact: true })
    .click();
  await page.getByLabel("会议主题", { exact: true }).fill("浏览器验收预约");
  const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("使用日期", { exact: true }).fill(date);
  await page.getByLabel("联系方式", { exact: true }).fill("13800138000");
  await page.getByRole("button", { name: "提交审批", exact: true }).click();
  await expect(
    page.locator(".booking-item").filter({ hasText: "浏览器验收预约" }),
  ).toContainText("待审批");
  await page.reload();
  await page.getByRole("button", { name: "我的预订", exact: true }).click();
  await expect(
    page.locator(".booking-item").filter({ hasText: "浏览器验收预约" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login(username);
  await page.getByRole("button", { name: "预订审批", exact: true }).click();
  await page
    .locator(".booking-item")
    .filter({ hasText: "浏览器验收预约" })
    .getByRole("button", { name: "通过", exact: true })
    .click();
  await expect(
    page.locator(".booking-item").filter({ hasText: "浏览器验收预约" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "布局编辑器", exact: true }).click();
  await page.locator("#edit-room").selectOption(roomId);
  await page.locator('[data-add="chair"]').click();
  await page.locator("#prop-x").fill("220");
  await page.locator("#prop-x").dispatchEvent("change");
  await page.getByRole("button", { name: "✓ 保存布局", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("布局已保存");
  await page.reload();
  await page.getByRole("button", { name: "布局编辑器", exact: true }).click();
  await page.locator("#edit-room").selectOption(roomId);
  await expect(page.locator("#editorStage .shape")).toHaveCount(1);
  await expect(page.locator("#editorStage .shape")).toHaveAttribute(
    "transform",
    /translate\(220 /,
  );
  await page.getByRole("button", { name: "预订规则", exact: true }).click();
  await page.locator(`[data-rule="${roomId}"]`).selectOption("admin");
  await expect(page.locator("#toast")).toHaveText("规则已保存");
  await page.reload();
  await page.getByRole("button", { name: "预订规则", exact: true }).click();
  await expect(page.locator(`[data-rule="${roomId}"]`)).toHaveValue("admin");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login(username + "-member");
  await page.getByRole("button", { name: "我的预订", exact: true }).click();
  const item = page
    .locator(".booking-item")
    .filter({ hasText: "浏览器验收预约" });
  await expect(item).toContainText("已确认");
  await item.getByRole("button", { name: "取消预订" }).click();
  await expect(item).toContainText("已取消");
  await page.getByRole("button", { name: "空间发现", exact: true }).click();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/workspace.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.screenshot({ path: "test-results/mobile.png", fullPage: false });
  await page.locator(".room-card").last().scrollIntoViewIfNeeded();
  await expect(page.locator(".room-card").last()).toBeInViewport();
  await page.screenshot({
    path: "test-results/mobile-rooms.png",
    fullPage: false,
  });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Browser: login, role navigation, booking, reload, approval, layout persistence, policies, cancellation passed",
  );
} finally {
  await browser.close();
  await pool.query("DELETE FROM audit WHERE actor=ANY($1::uuid[])", [
    [adminId, memberId],
  ]);
  await pool.query("DELETE FROM bookings WHERE room_id=$1", [roomId]);
  await pool.query("DELETE FROM rooms WHERE id=$1", [roomId]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [adminId, memberId],
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [adminId, memberId],
  ]);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
}
