import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
import { mkdir } from "node:fs/promises";
const tag = randomUUID(),
  adminId = randomUUID(),
  userId = randomUUID(),
  roomCode = "QA-" + tag,
  username = "qa-" + tag,
  departmentName = "研发-" + tag;
const userIds: string[] = [adminId, userId];
let roomId = "",
  deptId = "",
  createdUser = "";
const password = "Admin-e2e-password-123";
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
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
async function login(name: string, p = password) {
  await page.goto(base);
  await page.getByLabel("账号", { exact: true }).fill(name);
  await page.getByLabel("密码", { exact: true }).fill(p);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator("#userName")).toBeVisible();
}
try {
  const hash = await hashPassword(password);
  await pool.query(
    "INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5),($6,$7,$8,$4,$9)",
    [
      adminId,
      "admin-" + tag,
      "验收管理员",
      hash,
      "admin",
      userId,
      "member-" + tag,
      "验收员工",
      "member",
    ],
  );
  await login("admin-" + tag);
  await nav("账号与部门");
  await page.getByRole("button", { name: "＋ 新增部门", exact: true }).click();
  await page.getByLabel("部门名称", { exact: true }).fill(departmentName);
  await save();
  await expect(
    page.locator(".management-row").filter({ hasText: departmentName }),
  ).toHaveCount(1);
  deptId = (
    await pool.query("SELECT id FROM departments WHERE name=$1", [
      departmentName,
    ])
  ).rows[0].id;
  await page.getByRole("button", { name: "＋ 新增账号", exact: true }).click();
  await page.getByLabel("登录账号", { exact: true }).fill(username);
  await page.getByLabel("姓名", { exact: true }).fill("新员工");
  await page.getByLabel("所属部门", { exact: true }).selectOption(deptId);
  await page.getByLabel("初始密码", { exact: true }).fill(password);
  await save();
  await expect(
    page.locator(".management-row").filter({ hasText: username }),
  ).toBeVisible();
  createdUser = (
    await pool.query("SELECT id FROM users WHERE username=$1", [username])
  ).rows[0].id;
  userIds.push(createdUser);
  await nav("会议室管理");
  await page
    .getByRole("button", { name: "＋ 新增会议室", exact: true })
    .click();
  await page.getByLabel("名称", { exact: true }).fill("研发会议室");
  await page.getByLabel("编号", { exact: true }).fill(roomCode);
  await page.getByLabel("所属楼层", { exact: true }).selectOption({ index: 0 });
  await page.getByLabel("容量", { exact: true }).fill("12");
  await page.getByLabel("允许周期预订", { exact: true }).check();
  await page.locator("summary").click();
  await page.getByLabel("仅指定部门或人员可见", { exact: true }).check();
  await page.getByLabel("可见部门", { exact: true }).selectOption(deptId);
  await page.getByLabel("仅指定部门或人员可预订", { exact: true }).check();
  await page.getByLabel("可订部门", { exact: true }).selectOption(deptId);
  await save();
  await expect(
    page.locator(".management-row").filter({ hasText: roomCode }),
  ).toBeVisible();
  roomId = (
    await pool.query("SELECT id FROM rooms WHERE data->>'code'=$1", [roomCode])
  ).rows[0].id;
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login("member-" + tag);
  await expect(page.locator(`[data-room="${roomId}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login(username);
  await expect(page.locator(`[data-room="${roomId}"]`)).toBeVisible();
  await page.locator(`[data-room="${roomId}"]`).click();

  await expect(page.locator("#content img")).toHaveCount(0);
  await page
    .getByRole("button", { name: "＋ 预订会议室", exact: true })
    .click();
  const date = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("会议主题", { exact: true }).fill("每周设计评审");
  await page.getByLabel("使用日期", { exact: true }).fill(date);
  await page.getByLabel("联系方式", { exact: true }).fill("13800138000");
  await page.getByLabel("重复方式", { exact: true }).selectOption("weekly");
  await page.getByLabel("次数", { exact: true }).fill("3");
  await page.getByRole("button", { name: "确认预订", exact: true }).click();
  await expect(
    page.locator(".booking-item").filter({ hasText: "每周设计评审" }),
  ).toHaveCount(3);
  await page
    .locator(".booking-item")
    .filter({ hasText: "每周设计评审" })
    .first()
    .getByRole("button", { name: "取消本次", exact: true })
    .click();
  await expect(
    page.locator(".booking-item").filter({ hasText: "已取消" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "取消所有后续", exact: true })
    .first()
    .click();
  await expect(
    page.locator(".booking-item").filter({ hasText: "已取消" }),
  ).toHaveCount(3);
  await page.locator("#notificationButton").click();
  await expect(page.locator("#crumb")).toHaveText("通知");
  await expect(
    page.locator(".management-row").filter({ hasText: "每周设计评审" }),
  ).toHaveCount(6);
  await page.getByRole("button", { name: "全部标为已读", exact: true }).click();
  await expect(page.locator("#notificationButton")).toHaveText("通知");
  const firstDate = new Date(Date.now() + 40 * 86400000)
      .toISOString()
      .slice(0, 10),
    blockedDate = new Date(Date.now() + 47 * 86400000)
      .toISOString()
      .slice(0, 10);
  async function begin(title: string, date: string) {
    await nav("空间发现");
    await page.locator(`[data-room="${roomId}"]`).click();
    await page
      .getByRole("button", { name: "＋ 预订会议室", exact: true })
      .click();
    await page.getByLabel("会议主题", { exact: true }).fill(title);
    await page.getByLabel("使用日期", { exact: true }).fill(date);
    await page.getByLabel("联系方式", { exact: true }).fill("13800138000");
  }
  await begin("先有占用", blockedDate);
  await page.getByRole("button", { name: "确认预订", exact: true }).click();
  await expect(
    page.locator(".booking-item").filter({ hasText: "先有占用" }),
  ).toHaveCount(1);
  await begin("跳过冲突", firstDate);
  await page.getByLabel("重复方式", { exact: true }).selectOption("weekly");
  await page.getByLabel("次数", { exact: true }).fill("3");
  await page.getByRole("button", { name: "确认预订", exact: true }).click();
  await expect(page.locator("#bookingError")).toContainText(blockedDate);
  await page.getByLabel("仅提交无冲突日期", { exact: true }).check();
  await page.getByRole("button", { name: "确认预订", exact: true }).click();
  await expect(
    page.locator(".booking-item").filter({ hasText: "跳过冲突" }),
  ).toHaveCount(2);
  await nav("账号设置");
  await page.getByLabel("当前密码", { exact: true }).fill(password);
  await page
    .getByLabel("新密码", { exact: true })
    .fill("Updated-browser-password-123");
  await page
    .getByLabel("确认新密码", { exact: true })
    .fill("Updated-browser-password-123");
  await page
    .getByRole("button", { name: "修改密码并重新登录", exact: true })
    .click();
  await expect(page.locator("#loginForm")).toBeVisible();
  await login(username, "Updated-browser-password-123");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login("admin-" + tag);
  await nav("操作记录");
  await expect(
    page.locator(".management-row").filter({ hasText: "创建预订" }).first(),
  ).toBeVisible();
  await nav("预订管理");
  await expect(
    page.locator(".booking-item").filter({ hasText: "每周设计评审" }),
  ).toHaveCount(3);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/management.png" });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Browser management: departments, accounts, rooms, permissions, recurring bookings, exceptions, inbox and password change passed",
  );
} finally {
  await browser.close();
  await pool.query("DELETE FROM audit WHERE actor=ANY($1::uuid[])", [userIds]);
  if (roomId) {
    await pool.query("DELETE FROM bookings WHERE room_id=$1", [roomId]);
    await pool.query("DELETE FROM rooms WHERE id=$1", [roomId]);
  }
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    userIds,
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [userIds]);
  if (deptId) await pool.query("DELETE FROM departments WHERE id=$1", [deptId]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
}
