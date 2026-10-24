import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
import { mkdir } from "node:fs/promises";
const tag = randomUUID(),
  userId = randomUUID(),
  password = "Features-password-123";
let buildingId = "",
  floorId = "",
  roomId = "",
  templateId = "";
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const address = server.address();
if (!address || typeof address === "string") throw Error("address");
const base = `http://127.0.0.1:${address.port}`;
process.env.APP_ORIGIN = base;
const browser = await chromium.launch({
    ...(process.env.CI ? {} : { channel: "chrome" }),
    headless: true,
  }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
async function nav(name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator("#crumb")).toHaveText(name);
}
async function save() {
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#modal")).not.toHaveClass(/open/);
  await expect(page.locator("#toast")).toHaveText("已保存");
}
try {
  await pool.query(
    "INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",
    [
      userId,
      "features-" + tag,
      "验收管理员",
      await hashPassword(password),
      "admin",
    ],
  );
  await page.goto(base);
  await page.getByLabel("账号", { exact: true }).fill("features-" + tag);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator("#userName")).toHaveText("验收管理员");
  await nav("会议室管理");
  await page.getByRole("button", { name: "＋ 楼栋", exact: true }).click();
  await page.getByLabel("楼栋名称", { exact: true }).fill("功能验收-" + tag);
  await save();
  buildingId = (
    await pool.query("SELECT id FROM buildings WHERE name=$1", [
      "功能验收-" + tag,
    ])
  ).rows[0].id;
  await page.getByRole("button", { name: "＋ 楼层", exact: true }).click();
  await page.getByLabel("楼层名称", { exact: true }).fill("三层");
  await page.getByLabel("所属楼栋", { exact: true }).selectOption(buildingId);
  await save();
  floorId = (
    await pool.query("SELECT id FROM floors WHERE building_id=$1", [buildingId])
  ).rows[0].id;
  await page.locator(`[data-location-floor="${floorId}"]`).click();
  await page
    .getByRole("button", { name: "＋ 新增会议室", exact: true })
    .click();
  await page.getByLabel("名称", { exact: true }).fill("层级空间");
  await page.getByLabel("编号", { exact: true }).fill("FE-" + tag);
  await page.getByLabel("允许周期预订", { exact: true }).check();
  await save();
  roomId = (
    await pool.query("SELECT id FROM rooms WHERE data->>'code'=$1", [
      "FE-" + tag,
    ])
  ).rows[0].id;
  await expect(page.locator(".management-row")).toHaveCount(1);
  await page.locator(`[data-edit-building="${buildingId}"]`).click();
  await page.getByLabel("楼栋名称", { exact: true }).fill("新名称-" + tag);
  await save();
  await expect(page.locator(".management-row")).toContainText("新名称-" + tag);
  async function accessible() {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  }
  await accessible();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/hierarchy.png" });
  await nav("布局管理");
  await expect(page.locator("#newLayout")).toBeVisible();
  await accessible();
  await nav("空间发现");
  await page.locator(`[data-room="${roomId}"]`).click();
  await page
    .getByRole("button", { name: "＋ 预订会议室", exact: true })
    .click();
  const date = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("会议主题", { exact: true }).fill("日程改期");
  await page.getByLabel("使用日期", { exact: true }).fill(date);
  await page.getByLabel("联系方式", { exact: true }).fill("13800138000");
  await page.getByRole("button", { name: "确认预订", exact: true }).click();
  const item = page.locator(".booking-item").filter({ hasText: "日程改期" });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "修改", exact: true }).click();
  await page.getByLabel("开始时间", { exact: true }).fill("12:00");
  await page.getByLabel("结束时间", { exact: true }).fill("13:00");
  await save();
  await expect(item).toContainText("12:00–13:00");
  await nav("预订日程");
  await page.locator("#schedule-date").fill(date);
  await page.locator("#schedule-date").dispatchEvent("change");
  await page.getByLabel("日程视图", { exact: true }).selectOption("week");
  await expect(page.locator(".resource-calendar")).toHaveClass(/week/);
  await expect(page.locator(".resource-heading")).toHaveCount(8);
  const event = page.locator(".calendar-event").filter({ hasText: "日程改期" });
  await expect(event).toHaveCount(1);
  const cells = page.locator(`[data-drop-room="${roomId}"]`);
  const firstDate = await cells.first().getAttribute("data-drop-date"),
    target = cells.nth(firstDate === date ? 1 : 0),
    targetDate = await target.getAttribute("data-drop-date");
  await event.dragTo(target);
  await expect(page.locator("#editForm")).toBeVisible();
  await expect(page.getByLabel("使用日期", { exact: true })).toHaveValue(
    targetDate!,
  );
  await save();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.screenshot({ path: "test-results/calendar-week.png" });
  await page.setViewportSize({ width: 375, height: 812 });
  await nav("会议室管理");
  await expect(
    page.locator(`[data-location-floor="${floorId}"]`),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/hierarchy-mobile.png" });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Browser: hierarchy, rename, booking edits, drag-to-reschedule and WCAG scans passed",
  );
} finally {
  await browser.close();
  await pool.query("DELETE FROM audit WHERE actor=$1", [userId]);
  if (roomId) {
    await pool.query("DELETE FROM bookings WHERE room_id=$1", [roomId]);
    await pool.query("DELETE FROM rooms WHERE id=$1", [roomId]);
  }
  if (templateId)
    await pool.query("DELETE FROM layout_templates WHERE id=$1", [templateId]);
  if (floorId) await pool.query("DELETE FROM floors WHERE id=$1", [floorId]);
  if (buildingId)
    await pool.query("DELETE FROM buildings WHERE id=$1", [buildingId]);
  await pool.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
  await pool.query("DELETE FROM users WHERE id=$1", [userId]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
}
