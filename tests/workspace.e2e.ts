import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
import { mkdir } from "node:fs/promises";
const tag = randomUUID(),
  adminId = randomUUID(),
  memberId = randomUUID(),
  password = "Workspace-browser-password-123",
  buildingName = "UI-" + tag;
let buildingId = "",
  floorId = "",
  secondFloor = "",
  templateId = "";
const rooms: string[] = [];
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
async function api(path: string, token: string, body: unknown) {
  const r = await fetch(base + "/api" + path, {
    method: "POST",
    headers: { Cookie: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}
async function nav(name: string) {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.locator("#crumb")).toHaveText(name);
  await expect(page.locator(".page-head")).toHaveCount(0);
}
async function save() {
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#modal")).not.toHaveClass(/open/);
  await expect(page.locator("#toast")).toHaveText("已保存");
}
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
async function login(id: string) {
  await page.goto(base);
  await page.getByLabel("账号", { exact: true }).fill(id);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator("#userName")).toBeVisible();
}
try {
  const hash = await hashPassword(password);
  for (const [id, role] of [
    [adminId, "admin"],
    [memberId, "member"],
  ])
    await pool.query(
      "INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",
      [id, id, role, hash, role],
    );
  const auth = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: adminId, password }),
  });
  const token = auth.headers.get("set-cookie")!.split(";")[0];
  buildingId = (await api("/buildings", token, { name: buildingName })).id;
  floorId = (await api("/floors", token, { buildingId, name: "1F" })).id;
  secondFloor = (await api("/floors", token, { buildingId, name: "2F" })).id;
  for (let i = 0; i < 3; i++) {
    const r = await api("/rooms", token, {
      floorId: i === 2 ? secondFloor : floorId,
      name: "验收空间" + i,
      code: tag + "-" + i,
      capacity: 6,
      area: 20,
      type: "董事会式",
      equip: ["白板"],
      desc: "",
      rule: "instant",
      status: "enabled",
      repeat: false,
      access: {
        viewRestricted: false,
        bookRestricted: false,
        viewDepartments: [],
        bookDepartments: [],
        viewUsers: [],
        bookUsers: [],
        denyViewUsers: [],
        denyBookUsers: [],
      },
    });
    rooms.push(r.id);
  }
  await login(adminId);
  await nav("布局管理");
  await page.getByRole("button", { name: "＋ 新增布局", exact: true }).click();
  await page.getByLabel("布局名称", { exact: true }).fill("共享布局-" + tag);
  await page.locator('[data-add="screen"]').click();
  await page.getByLabel("X", { exact: true }).fill("420");
  await page.getByLabel("X", { exact: true }).dispatchEvent("change");
  await page.getByLabel("Y", { exact: true }).fill("70");
  await page.getByLabel("Y", { exact: true }).dispatchEvent("change");
  await page.locator('[data-add="board"]').click();
  await page.getByLabel("旋转", { exact: true }).fill("90");
  await page.getByLabel("旋转", { exact: true }).dispatchEvent("change");
  await page.getByRole("button", { name: "保存布局", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("布局已保存");
  templateId = (
    await pool.query("SELECT id FROM layout_templates WHERE name=$1", [
      "共享布局-" + tag,
    ])
  ).rows[0].id;
  const original = (
    await pool.query("SELECT layout FROM layout_templates WHERE id=$1", [
      templateId,
    ])
  ).rows[0].layout;
  expect(original.some((e: any) => e.type === "screen" && e.x === 420)).toBe(
    true,
  );
  expect(original.some((e: any) => e.type === "board" && e.r === 90)).toBe(
    true,
  );
  const imported = {
    schemaVersion: 1,
    coordinateSystem: { width: 600, height: 390 },
    elements: [
      { id: "temporary-screen", type: "screen", x: 200, y: 100, r: 0 },
    ],
  };
  await page.locator("#layoutFile").setInputFiles({
    name: "layout.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.locator("#editorStage .shape")).toHaveCount(1);
  await page.getByRole("button", { name: "保存布局", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("布局已保存");
  await page.getByLabel("布局历史版本", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "载入历史版本", exact: true }).click();
  await expect(page.locator("#editorStage .shape")).toHaveCount(
    original.length,
  );
  await page.getByRole("button", { name: "保存布局", exact: true }).click();
  await expect(page.locator("#toast")).toHaveText("布局已保存");
  await accessible();
  await nav("会议室管理");
  await page.locator(`[data-location-floor="${floorId}"]`).click();
  await expect(page.locator(".room-management-table tbody tr")).toHaveCount(2);
  await page.getByLabel("选择当前列表全部会议室", { exact: true }).check();
  await page.getByRole("button", { name: "批量编辑", exact: true }).click();
  await page.getByRole("checkbox", { name: "容量", exact: true }).check();
  await page.getByLabel("新容量", { exact: true }).fill("12");
  await page.getByRole("checkbox", { name: "面积", exact: true }).check();
  await page.getByLabel("新面积（㎡）", { exact: true }).fill("40");
  await page.getByRole("checkbox", { name: "布局", exact: true }).check();
  await page.getByLabel("新布局", { exact: true }).selectOption(templateId);
  await save();
  for (const row of await page
    .locator(".room-management-table tbody tr")
    .all()) {
    await expect(row).toContainText("12 人");
    await expect(row).toContainText("40 ㎡");
  }
  expect(
    (await pool.query("SELECT data FROM rooms WHERE id=$1", [rooms[2]])).rows[0]
      .data.capacity,
  ).toBe(6);
  const row = page
    .locator(".room-management-table tbody tr")
    .filter({ has: page.locator(`[data-select-room="${rooms[0]}"]`) });
  await row.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("容量", { exact: true }).fill("16");
  await save();
  await expect(row).toContainText("16 人");
  expect(
    (await pool.query("SELECT data FROM rooms WHERE id=$1", [rooms[1]])).rows[0]
      .data.capacity,
  ).toBe(12);
  await accessible();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/rooms-bulk-list.png" });
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login(memberId);
  await page.locator("#f-building").selectOption(buildingName);
  await expect(page.locator(".room-card")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /查看详情/ })).toHaveCount(0);
  await expect(
    page.getByText("绿色为空闲时段 · 橙色为已占用", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/discovery-grid.png" });
  await page.getByRole("button", { name: "列表", exact: true }).click();
  await expect(page.locator(".discovery-list-row")).toHaveCount(3);
  await expect(page.locator(".discovery-list-row .mini-plan svg")).toHaveCount(
    3,
  );
  await page.locator(`[data-room="${rooms[0]}"]`).click();
  await expect(page.locator("#roomDialog")).toBeVisible();
  await expect(page.locator("#roomDetailTitle")).toHaveText("验收空间0");
  await expect(page.locator("#crumb")).toHaveText("空间发现");
  await accessible();
  await expect(page.locator("#roomDetailBody .shape")).toHaveCount(
    original.length,
  );
  await page
    .getByRole("button", { name: "关闭会议室详情", exact: true })
    .click();
  await accessible();
  await page.screenshot({ path: "test-results/discovery-list.png" });
  await page.reload();
  await page.locator("#f-building").selectOption(buildingName);
  await expect(page.locator(".discovery-list-row")).toHaveCount(3);
  await page.locator(`[data-room="${rooms[0]}"]`).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#roomDialog")).toBeVisible();
  await page
    .getByRole("button", { name: "＋ 预订会议室", exact: true })
    .click();
  await expect(page.locator("#roomDialog")).not.toBeVisible();
  await expect(page.locator("#bookingForm")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#modal")).not.toHaveClass(/open/);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "宫格", exact: true }).click();
  await expect(page.locator(".room-card")).toHaveCount(3);
  await page.screenshot({ path: "test-results/discovery-mobile.png" });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Workspace: shared layout create/edit/history, floor bulk edit and individual override, grid/list thumbnails, keyboard detail dialog, booking and WCAG scans passed",
  );
} finally {
  await browser.close();
  await pool.query("DELETE FROM audit WHERE actor=ANY($1::uuid[])", [
    [adminId, memberId],
  ]);
  await pool.query("DELETE FROM bookings WHERE room_id=ANY($1::text[])", [
    rooms,
  ]);
  await pool.query("DELETE FROM rooms WHERE id=ANY($1::text[])", [rooms]);
  if (templateId)
    await pool.query("DELETE FROM layout_templates WHERE id=$1", [templateId]);
  if (buildingId) {
    await pool.query("DELETE FROM floors WHERE building_id=$1", [buildingId]);
    await pool.query("DELETE FROM buildings WHERE id=$1", [buildingId]);
  }
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [adminId, memberId],
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [adminId, memberId],
  ]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
}
