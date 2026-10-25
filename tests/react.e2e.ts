import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
const id = randomUUID(),
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
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (e) => {
  if (e.type() === "error" && !e.text().includes("401")) errors.push(e.text());
});
try {
  await pool.query(
    "INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,'admin')",
    [id, id, "迁移验收", await hashPassword(password)],
  );
  await page.goto(base);
  await page.getByLabel("账号", { exact: true }).fill(id);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator("#userName")).toHaveText("迁移验收");
  await page.getByRole("button", { name: "会议室管理", exact: true }).click();
  const trigger = page.getByRole("button", { name: "＋ 楼栋", exact: true });
  await trigger.click();
  await page.getByLabel("楼栋名称", { exact: true }).fill("保留输入");
  await page.locator("#closeModal").focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#closeModal")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#modal")).not.toHaveClass(/open/);
  await expect(trigger).toBeFocused();
  const checkbox = page.locator("[data-select-room]").first();
  await checkbox.check();
  await expect(checkbox).toBeFocused();
  await expect(checkbox).toBeChecked();
  await page.getByRole("button", { name: "布局管理", exact: true }).click();
  await page.getByRole("button", { name: "＋ 新增布局", exact: true }).click();
  await page
    .getByLabel("布局名称", { exact: true })
    .pressSequentially("React-" + id);
  await expect(page.getByLabel("布局名称", { exact: true })).toHaveValue(
    "React-" + id,
  );
  await page.locator('[data-add="screen"]').click();
  const selected = page.locator("#editorStage .shape").last();
  const before = await selected.getAttribute("transform");
  const box = await selected.locator("rect").first().boundingBox();
  if (!box) throw Error("screen bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 65,
    box.y + box.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(selected).not.toHaveAttribute("transform", before!);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(selected).toHaveAttribute("transform", before!);
  await selected.locator("rect").first().click();
  const width = await page.getByLabel("宽度", { exact: true }).inputValue();
  const handle = await page
    .locator("#editorStage .resize-handle")
    .boundingBox();
  if (!handle) throw Error("resize bounds");
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle.x + handle.width / 2 + 40,
    handle.y + handle.height / 2 + 20,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(page.getByLabel("宽度", { exact: true })).not.toHaveValue(width);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await selected.locator("rect").first().click();
  await expect(page.getByLabel("宽度", { exact: true })).toHaveValue(width);
  await page.getByLabel("旋转", { exact: true }).fill("-90");
  await page.getByLabel("X", { exact: true }).click();
  const count = await page.locator("#editorStage .shape").count();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON", exact: true }).click();
  const file = await downloaded;
  const path = await file.path();
  if (!path) throw Error("download path");
  const exported = JSON.parse(await readFile(path, "utf8"));
  expect(exported.elements).toHaveLength(count);
  expect(exported.elements.at(-1).r).toBe(-90);
  await page.locator("#layoutFile").setInputFiles({
    name: "unsafe.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        coordinateSystem: { width: 600, height: 390 },
        elements: [{ id: "unsafe", type: "script", x: 0, y: 0, r: 0 }],
      }),
    ),
  });
  await expect(page.locator("#toast")).toHaveText("布局元素不正确");
  await expect(page.locator("#editorStage .shape")).toHaveCount(count);
  await page.locator("#layoutFile").setInputFiles({
    name: "exported.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.locator("#toast")).toHaveText("已导入布局，保存后生效");
  await expect(page.locator("#editorStage .shape")).toHaveCount(count);
  await expect(page.locator("#toast")).not.toHaveClass(/show/);
  await expect(page.locator("#toast")).toHaveCSS("opacity", "0");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.getByRole("button", { name: "预订日程", exact: true }).click();
  await expect(page.locator(".calendar-scroll")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const oldDate = "2026-11-02",
    newDate = "2026-11-09";
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let oldStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve;
  });
  await page.route("**/api/calendar?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("date") === oldDate) {
      oldStarted();
      await held;
    }
    await route.continue().catch(() => {});
  });
  await page.locator("#schedule-date").fill(oldDate);
  await started;
  await page.locator("#schedule-date").fill(newDate);
  await expect(
    page.locator('[data-drop-date="' + newDate + '"]').first(),
  ).toBeVisible();
  release();
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.locator("#schedule-date")).toHaveValue(newDate);
  await expect(page.locator('[data-drop-date="' + oldDate + '"]')).toHaveCount(
    0,
  );
  // Session loss must remove an open management form and all authenticated UI.
  await page.getByRole("button", { name: "会议室管理", exact: true }).click();
  await trigger.click();
  await context.request.post(base + "/api/logout");
  await page.getByLabel("楼栋名称", { exact: true }).fill("不会提交");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("#loginForm")).toBeVisible();
  await expect(page.locator("#app")).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "React: focus retention/trapping, controlled inputs, SVG drag/resize/undo, export/import validation, stale calendar cancellation and session expiry passed",
  );
} finally {
  await browser.close();
  await pool.query("DELETE FROM audit WHERE actor=$1", [id]);
  await pool.query("DELETE FROM sessions WHERE user_id=$1", [id]);
  await pool.query("DELETE FROM users WHERE id=$1", [id]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
}
