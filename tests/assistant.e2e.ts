import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { tokenHash } from "../server/auth.ts";
const id = randomUUID(),
  token = randomUUID();
const date = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
const requests: any[] = [];
const empty = {
  date: null,
  start: null,
  end: null,
  capacity: null,
  building: null,
  floor: null,
  equip: [],
  preferredBuilding: null,
  question: null,
};
const model = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push(body);
  const last = body.messages.at(-1).content;
  let result: Record<string, unknown>;
  if (last.startsWith("我通过组件确认")) {
    const answers = JSON.parse(last.slice(last.indexOf("：") + 1));
    assertAnswers(answers);
    // The server must keep the confirmed equipment even if the model omits it.
    result = {
      ...empty,
      ...answers,
      equip: [],
      action: "search",
      reply: "按你确认的时间和设施找到了这些会议室。",
      fields: [],
    };
  } else if (last === "帮我找一间会议室") {
    result = {
      ...empty,
      capacity: null,
      equip: [],
      action: "ask",
      question: "会议安排在哪天？选好时间、人数和设施后一起确认。",
      reply: "",
      fields: ["date", "start", "end", "capacity", "equip"],
    };
  } else {
    result = {
      ...empty,
      action: "reply",
      reply: "可以继续调整时间或设施，我会按新的条件查找。",
      fields: [],
    };
  }
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(result) } }],
    }),
  );
});
function assertAnswers(answers: any) {
  if (
    answers.date !== date ||
    answers.start !== "14:00" ||
    answers.end !== "15:30" ||
    !answers.equip.includes("白板") ||
    !answers.equip.includes("投屏")
  )
    throw Error("组件批量确认不完整");
}
await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
const modelAddress = model.address();
if (!modelAddress || typeof modelAddress === "string") throw Error("address");
process.env.AI_BASE_URL = `http://127.0.0.1:${modelAddress.port}/v1`;
process.env.AI_MODEL = "assistant-test";
process.env.AI_API_KEY = "local-test";
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const address = server.address();
if (!address || typeof address === "string") throw Error("address");
const base = `http://127.0.0.1:${address.port}`;
process.env.APP_ORIGIN = base;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await pool.query(
    "INSERT INTO users(id,username,name,password_hash,role) VALUES($1::uuid,$1::text,'助手检查','unused','member')",
    [id],
  );
  await pool.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",
    [tokenHash(token), id],
  );
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await context.addCookies([{ name: "session", value: token, url: base }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator("#f-capacity").selectOption("12");
  await page.getByRole("button", { name: "更多筛选" }).click();
  await page
    .locator("#additionalFilters")
    .getByRole("button", { name: "投屏", exact: true })
    .click();
  await page.getByRole("button", { name: "AI 助手", exact: true }).click();
  await page.getByRole("button", { name: "找一间会议室" }).click();
  await expect(
    page.getByRole("button", { name: "确认条件并继续" }),
  ).toBeVisible();
  const form = page.locator(".assistant-requirements");
  await expect(form.getByLabel("人数", { exact: true })).toHaveValue("0");
  await form.getByLabel("人数", { exact: true }).fill("8");
  await expect(
    form.getByRole("button", { name: "白板", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await form.getByRole("button", { name: "白板", exact: true }).click();
  await form.getByLabel("日期", { exact: true }).fill(date);
  await form.getByLabel("开始时间", { exact: true }).fill("14:00");
  await form.getByRole("button", { name: "1.5 小时", exact: true }).click();
  await form.getByRole("button", { name: "投屏", exact: true }).click();
  if (Number(requests.length) !== 1) throw Error("选择过程中不应发送模型请求");
  await mkdir("test-results/assistant", { recursive: true });
  await page.screenshot({ path: "test-results/assistant/controls.png" });
  await page.getByRole("button", { name: "确认条件并继续" }).click();
  await expect(page.locator(".assistant-room-card").first()).toBeVisible();
  if (
    Number(requests.length) !== 2 ||
    !requests[1].messages.some((m: any) => m.role === "assistant")
  )
    throw Error("缺少多轮对话上下文");
  const cards = page.locator(".assistant-room-card");
  for (let i = 0; i < (await cards.count()); i++) {
    await expect(cards.nth(i).locator(".required-equipment")).toHaveText([
      "投屏",
      "白板",
    ]);
  }
  await page.getByRole("button", { name: "预订日程", exact: true }).click();
  await expect(cards.first()).toBeVisible();
  await page.getByRole("button", { name: "收起 AI 助手" }).click();
  await page.getByRole("button", { name: "AI 助手", exact: true }).click();
  await expect(cards.first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "AI 助手", exact: true }).click();
  await expect(cards.first()).toBeVisible();
  await mkdir("test-results/assistant", { recursive: true });
  await page.screenshot({ path: "test-results/assistant/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/assistant/mobile.png" });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error("手机界面横向溢出");
  await cards
    .first()
    .getByRole("button", { name: "预订", exact: true })
    .click();
  await expect(page.locator("#book-start")).toHaveValue("14:00");
  await expect(page.locator("#book-end")).toHaveValue("15:30");
  await page.locator("#closeModal").click();
  await page.getByRole("button", { name: "AI 助手", exact: true }).click();
  await page.getByRole("button", { name: "新对话", exact: true }).click();
  await expect(
    page.getByText("这次会议，怎么安排？", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "选择时间与设施" }).click();
  const newForm = page.locator(".assistant-requirements");
  await expect(
    newForm.getByRole("button", { name: "投屏", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    newForm.getByRole("button", { name: "白板", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(newForm.getByLabel("人数", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "历史对话", exact: true }).click();
  await page
    .locator(".assistant-history")
    .getByRole("button", { name: /帮我找一间会议室/ })
    .click();
  await expect(cards.first()).toBeVisible();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "通过：连续对话、条件批量确认、严格设施匹配、跨页面及刷新保留历史、手机抽屉、预订带入。",
  );
} finally {
  await browser.close();
  await pool.query("DELETE FROM sessions WHERE user_id=$1", [id]);
  await pool.query("DELETE FROM users WHERE id=$1", [id]);
  await Promise.all([
    new Promise<void>((r) => server.close(() => r())),
    new Promise<void>((r) => model.close(() => r())),
  ]);
  await pool.end();
}
