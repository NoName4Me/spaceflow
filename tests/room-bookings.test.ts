import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
import { dateRange } from "../client/src/booking-dates.ts";
const tag = randomUUID(),
  room = "records-" + tag,
  ownerId = randomUUID(),
  viewerId = randomUUID(),
  adminId = randomUUID(),
  password = randomUUID();
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const address = server.address();
if (!address || typeof address === "string") throw Error("address");
const base = `http://127.0.0.1:${address.port}`;
let owner = "",
  viewer = "",
  admin = "";
async function req(
  path: string,
  token: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: { Cookie: token, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, data: await r.json() };
}
const future = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
async function create(patch: Record<string, unknown> = {}) {
  const r = await req("/bookings", owner, "POST", {
    roomId: room,
    title: "公开会议",
    contact: "联系人不是预订人",
    phone: "13800000000",
    hidden: false,
    date: future(30),
    start: "10:00",
    end: "11:00",
    ...patch,
  });
  assert.equal(r.status, 201);
  return r.data.id as string;
}
async function stateBooking(id: string, token = owner) {
  const r = await req("/state", token);
  assert.equal(r.status, 200);
  return r.data.bookings.find((b: { id: string }) => b.id === id);
}
const list = (from: string, to = from, page = 1, size = 20) =>
  `/rooms/${room}/bookings?` +
  new URLSearchParams({ from, to, page: String(page), size: String(size) });
before(async () => {
  const hash = await hashPassword(password);
  for (const [id, name, role] of [
    [ownerId, "实际预订人", "member"],
    [viewerId, "记录查看者", "member"],
    [adminId, "记录管理员", "admin"],
  ])
    await pool.query(
      "INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",
      [id, id, name, hash, role],
    );
  await pool.query("INSERT INTO rooms(id,data) VALUES($1,$2)", [
    room,
    {
      id: room,
      name: "记录验收",
      rule: "instant",
      status: "enabled",
      repeat: true,
    },
  ]);
  const login = async (id: string) => {
    const r = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: id, password }),
    });
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  owner = await login(ownerId);
  viewer = await login(viewerId);
  admin = await login(adminId);
});
after(async () => {
  await pool.query("DELETE FROM audit WHERE actor=ANY($1::uuid[])", [
    [ownerId, viewerId, adminId],
  ]);
  await pool.query("DELETE FROM bookings WHERE room_id=$1", [room]);
  await pool.query("DELETE FROM rooms WHERE id=$1", [room]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [ownerId, viewerId, adminId],
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [ownerId, viewerId, adminId],
  ]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});
test("notes persist, edits preserve omitted notes and can explicitly clear them", async () => {
  const id = await create({ notes: "提前准备材料\n远程连线" });
  let b = await stateBooking(id);
  assert.equal(b.notes, "提前准备材料\n远程连线");
  assert.equal(b.ownerName, "实际预订人");
  const update = {
    revision: b.revision,
    title: b.title,
    contact: b.contact,
    phone: b.phone,
    hidden: false,
    roomId: room,
    date: b.date,
    start: b.start,
    end: b.end,
  };
  assert.equal(
    (await req("/bookings/" + id, owner, "PUT", update)).status,
    200,
  );
  b = await stateBooking(id);
  assert.equal(b.notes, "提前准备材料\n远程连线");
  assert.equal(
    (
      await req("/bookings/" + id, owner, "PUT", {
        ...update,
        revision: b.revision,
        notes: "",
      })
    ).status,
    200,
  );
  assert.equal((await stateBooking(id)).notes, "");
  const bad = await req("/bookings", owner, "POST", {
    roomId: room,
    title: "无效",
    contact: "x",
    phone: "x",
    hidden: false,
    date: future(31),
    start: "10:00",
    end: "11:00",
    notes: "x".repeat(2001),
  });
  assert.equal(bad.status, 400);
});
test("room records sort by use date/time descending, paginate and never leak hidden details", async () => {
  const from = future(40),
    to = future(41);
  const first = await create({ date: from, notes: "公开备注" }),
    last = await create({
      date: to,
      hidden: true,
      title: "机密主题",
      notes: "机密备注",
      contact: "机密联系人",
      phone: "机密电话",
    }),
    middle = await create({ date: from, start: "15:00", end: "16:00" });
  const r = await req(list(from, to, 1, 2), viewer);
  assert.equal(r.status, 200);
  assert.equal(r.data.total, 3);
  assert.equal(r.data.pages, 2);
  assert.deepEqual(
    r.data.bookings.map((b: { id: string }) => b.id),
    [last, middle],
  );
  assert.equal(r.data.bookings[0].title, "主题保密");
  assert.equal(r.data.bookings[0].detailsHidden, true);
  for (const key of ["ownerName", "notes", "contact", "phone"])
    assert.equal(r.data.bookings[0][key], undefined);
  for (const secret of ["机密主题", "机密备注", "机密联系人", "机密电话"])
    assert.ok(!JSON.stringify(r.data).includes(secret));
  const second = await req(list(from, to, 2, 2), viewer);
  assert.equal(second.data.bookings[0].id, first);
  assert.equal(second.data.bookings[0].ownerName, "实际预订人");
  assert.equal(second.data.bookings[0].notes, "公开备注");
  assert.ok(second.data.bookings[0].createdAt);
  for (const token of [owner, admin]) {
    const b = (await req(list(to), token)).data.bookings[0];
    assert.equal(b.title, "机密主题");
    assert.equal(b.notes, "机密备注");
    assert.equal(b.ownerName, "实际预订人");
    assert.equal(b.detailsHidden, false);
  }
  for (const path of [
    "/state",
    "/calendar?" + new URLSearchParams({ date: to, view: "day", size: "50" }),
  ]) {
    const b = (await req(path, viewer)).data.bookings.find(
      (b: { id: string }) => b.id === last,
    );
    for (const key of ["ownerName", "notes", "contact", "phone"])
      assert.equal(b[key], undefined);
  }
  await req("/bookings/" + middle + "/cancel", owner, "POST");
  assert.equal((await req(list(from, to), viewer)).data.total, 2);
});
test("record filters validate dates, boundaries, pagination and room visibility", async () => {
  for (const query of [
    "from=2026-02-30&to=2026-03-01",
    `from=${future(5)}&to=${future(4)}`,
    `from=${future(1)}&to=${future(368)}`,
    `from=${future(1)}&to=${future(2)}&size=500`,
  ])
    assert.equal(
      (await req(`/rooms/${room}/bookings?${query}`, viewer)).status,
      400,
    );
  await pool.query("UPDATE rooms SET data=data || $2 WHERE id=$1", [
    room,
    {
      access: {
        viewRestricted: true,
        viewUsers: [ownerId],
        viewDepartments: [],
        denyViewUsers: [],
      },
    },
  ]);
  assert.equal((await req(list(future(40)), viewer)).status, 404);
  assert.equal((await req(list(future(40)), owner)).status, 200);
  assert.equal((await req(list(future(40)), admin)).status, 200);
});
test("date shortcuts use inclusive Monday–Sunday and calendar month boundaries", () => {
  assert.deepEqual(dateRange("today", "2000-01-01", "2024-02-29"), {
    from: "2024-02-29",
    to: "2024-02-29",
  });
  assert.deepEqual(dateRange("tomorrow", "2000-01-01", "2024-02-29"), {
    from: "2024-03-01",
    to: "2024-03-01",
  });
  assert.deepEqual(dateRange("week", "2000-01-01", "2024-12-31"), {
    from: "2024-12-30",
    to: "2025-01-05",
  });
  assert.deepEqual(dateRange("month", "2000-01-01", "2024-02-29"), {
    from: "2024-02-01",
    to: "2024-02-29",
  });
  assert.deepEqual(dateRange("day", "2025-01-02", "2024-02-29"), {
    from: "2025-01-02",
    to: "2025-01-02",
  });
});
