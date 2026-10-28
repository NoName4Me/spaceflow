import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import {
  intentSchema,
  matchesRequirements,
  mergeIntent,
  validSearchWindow,
} from "../server/room-search-rules.ts";
const filters = {
  building: "all",
  floor: "all",
  date: "2027-01-15",
  start: "14:00",
  end: "15:00",
  capacity: 8,
  equip: ["白板"],
};
const intent = intentSchema.parse({
  date: null,
  start: null,
  end: null,
  capacity: 4,
  building: null,
  floor: null,
  equip: ["投屏"],
  preferredBuilding: null,
  question: null,
});
test("语义合并保留已选硬约束，不用更小人数或更少设施覆盖", () => {
  const result = mergeIntent(filters, intent);
  assert.equal(result.filters.capacity, 8);
  assert.deepEqual(result.filters.equip, ["白板", "投屏"]);
  assert.equal(
    matchesRequirements(
      { building: "A", floor: "1F", capacity: 12, equip: ["投屏"] },
      result.filters,
    ),
    false,
  );
  assert.ok(
    mergeIntent({ ...filters, building: "A" }, { ...intent, building: "B" })
      .question,
  );
});
test("未配置的设施也必须满足；无效、过去或跨日时段不能查找", () => {
  assert.equal(
    matchesRequirements(
      { building: "A", floor: "1F", capacity: 12, equip: ["白板"] },
      { ...filters, equip: ["同声传译"] },
    ),
    false,
  );
  const now = new Date("2027-01-14T12:00:00+08:00").valueOf();
  assert.equal(validSearchWindow(filters, now), true);
  assert.equal(validSearchWindow({ ...filters, end: "13:00" }, now), false);
  assert.equal(validSearchWindow(filters, now + 3 * 86400000), false);
});
test("接口按实时占用、权限及全部设施筛选，模型仅解析条件", async () => {
  const { app } = await import("../server/app.ts");
  const { pool } = await import("../server/db.ts");
  const { tokenHash } = await import("../server/auth.ts");
  const id = randomUUID();
  const token = randomUUID();
  const building = "search-" + id;
  const roomIds = ["missing", "busy", "free", "denied", "expired"].map(
    (n) => `${building}-${n}`,
  );
  const savedEnv = {
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
  };
  const server = app.listen(0, "127.0.0.1");
  const model = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(body.response_format.type, "json_object");
    assert.equal(raw.includes("保密会议"), false);
    const question =
      body.messages.at(-1).content === "下午"
        ? "下午几点开始，持续多久？"
        : null;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          { message: { content: JSON.stringify({ ...intent, question }) } },
        ],
      }),
    );
  });
  await Promise.all([
    new Promise<void>((r) => server.once("listening", r)),
    new Promise<void>((r) => model.listen(0, "127.0.0.1", r)),
  ]);
  const address = server.address(),
    modelAddress = model.address();
  if (
    !address ||
    typeof address === "string" ||
    !modelAddress ||
    typeof modelAddress === "string"
  )
    throw Error("address");
  const date = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const base = { ...filters, building, date, equip: ["白板", "投屏"] };
  const search = async (patch: Record<string, unknown> = {}) => {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/room-search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `session=${token}`,
        },
        body: JSON.stringify({ filters: base, ...patch }),
      },
    );
    return { status: response.status, body: await response.json() };
  };
  try {
    await pool.query(
      "INSERT INTO users(id,username,name,password_hash,role) VALUES($1::uuid,$1::text,'智能找房验证','unused','member')",
      [id],
    );
    await pool.query(
      "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",
      [tokenHash(token), id],
    );
    for (const [index, roomId] of roomIds.entries()) {
      await pool.query("INSERT INTO rooms(id,data) VALUES($1,$2)", [
        roomId,
        JSON.stringify({
          id: roomId,
          name: roomId,
          building,
          floor: "1F",
          capacity: 8,
          equip: index === 0 ? ["投屏"] : ["白板", "投屏"],
          rule: "instant",
          status: "enabled",
          access: index === 3 ? { denyBookUsers: [id] } : {},
        }),
      ]);
    }
    for (const index of [1, 4])
      await pool.query(
        "INSERT INTO bookings(id,room_id,user_id,title,contact,phone,hidden,start_at,end_at,status,expires_at) VALUES($1,$2,$3,'保密会议','保密联系人','保密电话',true,$4,$5,'pending',$6)",
        [
          randomUUID(),
          roomIds[index],
          id,
          `${date}T14:00:00+08:00`,
          `${date}T15:00:00+08:00`,
          new Date(Date.now() + (index === 4 ? -1000 : 3600000)),
        ],
      );
    let result = await search();
    assert.equal(result.status, 200);
    assert.deepEqual(
      new Set(result.body.suggestions.map((s: any) => s.roomId)),
      new Set([roomIds[2], roomIds[4]]),
    );
    result = await search({
      filters: { ...base, start: "15:00", end: "16:00" },
    });
    assert.ok(
      result.body.suggestions.some((s: any) => s.roomId === roomIds[1]),
      "相邻时段不冲突",
    );
    result = await search({
      filters: { ...base, equip: ["白板", "同声传译"] },
    });
    assert.equal(result.body.suggestions.length, 0);
    assert.match(result.body.message, /没有满足/);
    delete process.env.AI_API_KEY;
    result = await search({ messages: ["8人，需要白板和投屏"] });
    assert.equal(result.status, 422);
    process.env.AI_BASE_URL = `http://127.0.0.1:${modelAddress.port}/v1`;
    process.env.AI_API_KEY = "local-test-key";
    process.env.AI_MODEL = "local-test-model";
    result = await search({ messages: ["下午"] });
    assert.match(result.body.question, /几点/);
    assert.equal(result.body.suggestions.length, 0);
    result = await search({ messages: ["4人，需要投屏"] });
    assert.equal(result.status, 200);
    assert.equal(result.body.filters.capacity, 8);
    assert.deepEqual(result.body.filters.equip, ["白板", "投屏"]);
    assert.equal(result.body.suggestions.length, 2);
    await pool.query(
      "UPDATE rooms SET data=jsonb_set(data,'{status}','\"maintenance\"') WHERE id=ANY($1::text[])",
      [[roomIds[2], roomIds[4]]],
    );
    result = await search();
    assert.equal(result.body.suggestions.length, 0);
    assert.match(result.body.message, /均无可预订/);
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await pool.query("DELETE FROM notifications WHERE user_id=$1", [id]);
    await pool.query(
      "DELETE FROM audit WHERE target IN (SELECT id::text FROM bookings WHERE user_id=$1)",
      [id],
    );
    await pool.query("DELETE FROM bookings WHERE user_id=$1", [id]);
    await pool.query("DELETE FROM rooms WHERE id=ANY($1::text[])", [roomIds]);
    await pool.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    await pool.query("DELETE FROM users WHERE id=$1", [id]);
    await Promise.all([
      new Promise<void>((r) => server.close(() => r())),
      new Promise<void>((r) => model.close(() => r())),
    ]);
    await pool.end();
  }
});
