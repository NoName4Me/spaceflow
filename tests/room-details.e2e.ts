import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
import { companyDate, dateRange } from "../client/src/booking-dates.ts";
const tag = randomUUID(),
  roomId = "details-" + tag,
  ownerId = randomUUID(),
  viewerId = randomUUID(),
  password = randomUUID();
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
    reducedMotion: "reduce",
  }),
  page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const today = companyDate(),
  tomorrow = dateRange("tomorrow", today).from;
async function login(id: string) {
  await page.goto(base);
  await page.getByLabel("账号", { exact: true }).fill(id);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator("#userName")).toBeVisible();
}
async function loaded() {
  await expect(page.locator(".agenda-table-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
try {
  const hash = await hashPassword(password);
  for (const [id, name] of [
    [ownerId, "林衡"],
    [viewerId, "周屿"],
  ])
    await pool.query(
      "INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,'member')",
      [id, id, name, hash],
    );
  const source = (
    await pool.query(
      "SELECT data,floor_id,layout_template_id FROM rooms ORDER BY id LIMIT 1",
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO rooms(id,data,floor_id,layout_template_id) VALUES($1,$2,$3,$4)",
    [
      roomId,
      {
        ...source.data,
        id: roomId,
        name: "清和",
        code: tag,
        status: "enabled",
        rule: "instant",
        access: {},
        repeat: false,
      },
      source.floor_id,
      source.layout_template_id,
    ],
  );
  await login(ownerId);
  await expect(page.locator("#f-start")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".nav-item.active")).toHaveCSS(
    "box-shadow",
    "none",
  );
  await page.locator(`.room-card[data-room="${roomId}"]`).click();
  await page
    .getByRole("button", { name: "＋ 预订会议室", exact: true })
    .click();
  await page.getByLabel("会议主题", { exact: true }).fill("产品方案评审");
  await page.getByLabel("使用日期", { exact: true }).fill(tomorrow);
  await page.getByLabel("联系人", { exact: true }).fill("会议联系人");
  await page.getByLabel("联系方式", { exact: true }).fill("13800138000");
  await page
    .getByLabel("备注", { exact: true })
    .fill("请提前阅读材料\n远程参会");
  await expect(page.getByLabel("备注", { exact: true })).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator("#booking-room")).not.toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.getByRole("button", { name: "确认预订", exact: true }).click();
  const item = page
    .locator(".booking-item")
    .filter({ hasText: "产品方案评审" });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "修改", exact: true }).click();
  await expect(page.getByLabel("备注", { exact: true })).toHaveValue(
    "请提前阅读材料\n远程参会",
  );
  await page
    .getByLabel("备注", { exact: true })
    .fill("请提前阅读材料\n会议结束后发送纪要");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#modal")).not.toHaveClass(/open/);
  const publicId = (
    await pool.query("SELECT id FROM bookings WHERE room_id=$1", [roomId])
  ).rows[0].id;
  const hiddenId = randomUUID();
  for (const [id, date, start, title, notes, hidden] of [
    [randomUUID(), today, "09:00", "项目同步", "确认本周安排", false],
    [hiddenId, tomorrow, "15:00", "私密议题", "私密备注", true],
  ] as const)
    await pool.query(
      "INSERT INTO bookings(id,room_id,user_id,title,contact,phone,hidden,notes,start_at,end_at,status) VALUES($1,$2,$3,$4,'联系人','13800000000',$5,$6,$7,$8,'confirmed')",
      [
        id,
        roomId,
        ownerId,
        title,
        hidden,
        notes,
        date + "T" + start + ":00+08:00",
        date +
          "T" +
          String(Number(start.slice(0, 2)) + 1).padStart(2, "0") +
          ":00:00+08:00",
      ],
    );
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await login(viewerId);
  await page.locator(`.room-card[data-room="${roomId}"]`).click();
  await loaded();
  await expect(page.locator(".agenda-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".agenda-table")).toContainText("项目同步");
  await page.getByRole("button", { name: "明日", exact: true }).click();
  await loaded();
  await expect(page.locator("[data-booking-record]")).toHaveCount(2);
  await expect(page.locator("[data-booking-record]").first()).toHaveAttribute(
    "data-booking-record",
    hiddenId,
  );
  const hiddenRow = page.locator(`[data-booking-record="${hiddenId}"]`),
    publicRow = page.locator(`[data-booking-record="${publicId}"]`);
  await expect(hiddenRow).toContainText("主题保密");
  await expect(hiddenRow.locator("td").nth(2)).toHaveText("**");
  await expect(hiddenRow.locator("td").nth(3)).toHaveText("**");
  await expect(publicRow).toContainText("林衡");
  await expect(publicRow).not.toContainText("会议联系人");
  await expect(publicRow).toContainText("会议结束后发送纪要");
  await expect(publicRow.locator(".agenda-created")).not.toHaveText("—");
  await expect(page.locator("#roomDialog")).not.toContainText("私密议题");
  await expect(page.locator("#roomDialog")).not.toContainText("私密备注");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/room-details-desktop.png" });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  for (const [label, period] of [
    ["今日", "today"],
    ["本周", "week"],
    ["本月", "month"],
  ] as const) {
    const range = dateRange(period, today),
      response = page.waitForResponse((r) => {
        const u = new URL(r.url());
        return (
          u.pathname === `/api/rooms/${roomId}/bookings` &&
          u.searchParams.get("from") === range.from &&
          u.searchParams.get("to") === range.to
        );
      });
    await page.getByRole("button", { name: label, exact: true }).click();
    expect((await response).ok()).toBe(true);
    await loaded();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByLabel("预订日期", { exact: true }).fill(tomorrow);
  await loaded();
  await expect(page.locator("[data-booking-record]")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "本月", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator("#roomDialog")).toBeInViewport();
  await page.screenshot({ path: "test-results/room-details-mobile.png" });
  await page
    .getByRole("button", { name: "＋ 预订会议室", exact: true })
    .click();
  await expect(page.getByLabel("使用日期", { exact: true })).toHaveValue(
    tomorrow,
  );
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  console.log(
    "Room details: white editable fields, notes create/edit, reverse chronology, actual owner, privacy masks, date shortcuts, mobile table and WCAG passed",
  );
} finally {
  await browser.close();
  await pool.query("DELETE FROM audit WHERE actor=ANY($1::uuid[])", [
    [ownerId, viewerId],
  ]);
  await pool.query("DELETE FROM bookings WHERE room_id=$1", [roomId]);
  await pool.query("DELETE FROM rooms WHERE id=$1", [roomId]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [ownerId, viewerId],
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [ownerId, viewerId],
  ]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
}
