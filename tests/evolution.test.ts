import { createServer } from "node:net";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
import { occurrenceDates, repeatSchema } from "../server/recurrence.ts";
import { deliverEmails } from "../server/mail.ts";
import nodemailer from "nodemailer";
const tag = randomUUID(),
  adminId = randomUUID(),
  memberId = randomUUID(),
  otherId = randomUUID(),
  password = "Evolution-password-123";
let buildingId = "",
  floorId = "",
  roomId = "",
  admin = "",
  member = "",
  other = "";
const roomIds: string[] = [],
  floorIds: string[] = [];
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const address = server.address();
if (!address || typeof address === "string") throw Error("address");
const base = `http://127.0.0.1:${address.port}`;
async function req(path: string, token = "", method = "GET", body?: unknown) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: token },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
const access = {
  viewRestricted: false,
  bookRestricted: false,
  viewDepartments: [],
  bookDepartments: [],
  viewUsers: [],
  bookUsers: [],
  denyViewUsers: [],
  denyBookUsers: [],
};
const future = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
function booking(patch: Record<string, unknown> = {}) {
  return {
    roomId,
    title: "改期会议",
    contact: "申请人",
    phone: "13800138000",
    hidden: false,
    date: future(40),
    start: "10:00",
    end: "11:00",
    ...patch,
  };
}
async function get(id: string) {
  return (await req("/state", member)).data.bookings.find(
    (b: any) => b.id === id,
  );
}
before(async () => {
  const hash = await hashPassword(password);
  for (const [id, role] of [
    [adminId, "admin"],
    [memberId, "member"],
    [otherId, "member"],
  ])
    await pool.query(
      "INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",
      [id, id, role, hash, role],
    );
  for (const [id, set] of [
    [adminId, (t: string) => (admin = t)],
    [memberId, (t: string) => (member = t)],
    [otherId, (t: string) => (other = t)],
  ] as const) {
    const r = await req("/login", "", "POST", { username: id, password });
    set(r.cookie);
  }
});
after(async () => {
  await pool.query("DELETE FROM audit WHERE actor=ANY($1::uuid[])", [
    [adminId, memberId, otherId],
  ]);
  await pool.query("DELETE FROM bookings WHERE room_id=ANY($1::text[])", [
    roomIds,
  ]);
  await pool.query("DELETE FROM rooms WHERE id=ANY($1::text[])", [roomIds]);
  await pool.query("DELETE FROM layout_templates WHERE created_by=$1", [
    adminId,
  ]);
  await pool.query("DELETE FROM floors WHERE id=ANY($1::uuid[])", [floorIds]);
  if (buildingId)
    await pool.query("DELETE FROM buildings WHERE id=$1", [buildingId]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [adminId, memberId, otherId],
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [adminId, memberId, otherId],
  ]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});
test("hierarchy rename propagates, room moves preserve identity and occupied locations cannot be removed", async () => {
  assert.equal((await req("/admin/locations", member)).status, 403);
  buildingId = (
    await req("/buildings", admin, "POST", { name: "EVO-" + tag, sortOrder: 2 })
  ).data.id;
  floorId = (
    await req("/floors", admin, "POST", {
      buildingId,
      name: "3F",
      sortOrder: 3,
    })
  ).data.id;
  floorIds.push(floorId);
  const data = {
    floorId,
    name: "层级会议室",
    code: "EVO-" + tag,
    capacity: 8,
    area: 20,
    type: "圆桌式",
    equip: ["白板"],
    desc: "",
    rule: "instant",
    status: "enabled",
    repeat: true,
    access,
  };
  const created = await req("/rooms", admin, "POST", data);
  assert.equal(created.status, 201);
  roomId = created.data.id;
  roomIds.push(roomId);
  await req("/buildings/" + buildingId, admin, "PUT", {
    name: "新楼栋-" + tag,
    sortOrder: 1,
  });
  await req("/floors/" + floorId, admin, "PUT", {
    buildingId,
    name: "三层",
    sortOrder: 1,
  });
  const room = (await req("/state", member)).data.rooms.find(
    (r: any) => r.id === roomId,
  );
  assert.equal(room.building, "新楼栋-" + tag);
  assert.equal(room.floor, "三层");
  assert.equal((await req("/floors/" + floorId, admin, "DELETE")).status, 409);
  assert.equal(
    (await req("/buildings/" + buildingId, admin, "DELETE")).status,
    409,
  );
  const next = (
    await req("/floors", admin, "POST", { buildingId, name: "四层" })
  ).data.id;
  floorIds.push(next);
  assert.equal(
    (await req("/rooms/" + roomId, admin, "PUT", { ...data, floorId: next }))
      .status,
    200,
  );
  assert.equal(
    (await req("/state", member)).data.rooms.find((r: any) => r.id === roomId)
      .floor,
    "四层",
  );
});
test("editing checks owner/revision, conflicts roll back and emits exactly one update notification", async () => {
  const first = await req("/bookings", member, "POST", booking()),
    otherBooking = await req(
      "/bookings",
      other,
      "POST",
      booking({ start: "12:00", end: "13:00" }),
    );
  assert.equal(first.status, 201);
  assert.equal(otherBooking.status, 201);
  const body = {
    ...booking(),
    revision: 1,
    scope: "single",
    start: "12:00",
    end: "13:00",
  };
  assert.equal(
    (await req("/bookings/" + first.data.id, other, "PUT", body)).status,
    403,
  );
  assert.equal(
    (await req("/bookings/" + first.data.id, member, "PUT", body)).status,
    409,
  );
  assert.equal((await get(first.data.id)).start, "10:00");
  const result = await req("/bookings/" + first.data.id, member, "PUT", {
    ...body,
    start: "11:00",
    end: "12:00",
    title: "已修改",
  });
  assert.equal(result.status, 200);
  const updated = await get(first.data.id);
  assert.equal(updated.title, "已修改");
  assert.equal(updated.revision, 2);
  assert.equal(
    (await req("/bookings/" + first.data.id, member, "PUT", body)).status,
    409,
  );
  const notes = (await req("/notifications", member)).data;
  assert.equal(
    notes.filter((n: any) => n.title === "已修改" && n.status === "updated")
      .length,
    1,
  );
  assert.equal(
    notes.filter((n: any) => n.title === "已修改" && n.status === "cancelled")
      .length,
    0,
  );
});
test("series editing is atomic, preserves earlier dates and approval is required again after moving", async () => {
  const series = await req(
    "/bookings",
    member,
    "POST",
    booking({
      date: future(60),
      repeat: { frequency: "weekly", count: 3, interval: 1 },
    }),
  );
  assert.equal(series.status, 201);
  const middle = await get(series.data.ids[1]),
    body = {
      ...booking({ date: middle.date }),
      revision: 1,
      scope: "future",
      start: "14:00",
      end: "15:00",
    };
  await req(
    "/bookings",
    other,
    "POST",
    booking({ date: future(74), start: "14:00", end: "15:00" }),
  );
  assert.equal(
    (await req("/bookings/" + middle.id, member, "PUT", body)).status,
    409,
  );
  assert.equal((await get(middle.id)).start, "10:00");
  assert.equal(
    (
      await req("/bookings/" + middle.id, member, "PUT", {
        ...body,
        start: "15:00",
        end: "16:00",
      })
    ).data.count,
    2,
  );
  assert.equal((await get(series.data.ids[0])).start, "10:00");
  assert.equal((await get(series.data.ids[2])).start, "15:00");
  await req("/rooms/" + roomId + "/policy", admin, "PUT", {
    rule: "approval",
    status: "enabled",
    repeat: true,
  });
  const single = await get(series.data.ids[0]);
  assert.equal(
    (
      await req("/bookings/" + single.id, member, "PUT", {
        ...body,
        scope: "single",
        revision: single.revision,
        date: single.date,
        start: "09:00",
        end: "10:00",
      })
    ).status,
    200,
  );
  assert.equal((await get(single.id)).status, "pending");
  await req("/rooms/" + roomId + "/policy", admin, "PUT", {
    rule: "instant",
    status: "enabled",
    repeat: true,
  });
});
test("metadata edits preserve pending hold deadlines and cannot revive expired applications", async () => {
  await req("/rooms/" + roomId + "/policy", admin, "PUT", {
    rule: "approval",
    status: "enabled",
    repeat: true,
  });
  const create = await req(
      "/bookings",
      member,
      "POST",
      booking({ date: future(250) }),
    ),
    id = create.data.id;
  const before = (
    await pool.query("SELECT expires_at FROM bookings WHERE id=$1", [id])
  ).rows[0].expires_at;
  const payload = {
    ...booking({ date: future(250) }),
    title: "修改主题",
    revision: 1,
    scope: "single",
  };
  assert.equal(
    (await req("/bookings/" + id, member, "PUT", payload)).status,
    200,
  );
  assert.equal(
    (
      await pool.query("SELECT expires_at FROM bookings WHERE id=$1", [id])
    ).rows[0].expires_at.valueOf(),
    before.valueOf(),
  );
  await pool.query(
    "UPDATE bookings SET expires_at=now()-interval '1 second' WHERE id=$1",
    [id],
  );
  assert.equal(
    (await req("/bookings/" + id, member, "PUT", { ...payload, revision: 2 }))
      .status,
    409,
  );
  assert.equal((await get(id)).status, "expired");
  await req("/rooms/" + roomId + "/policy", admin, "PUT", {
    rule: "instant",
    status: "enabled",
    repeat: true,
  });
});
test("weekly weekday selection and monthly dates skip invalid calendar dates without drift", () => {
  assert.deepEqual(
    occurrenceDates(
      "2027-01-04",
      repeatSchema.parse({
        frequency: "weekly",
        weekdays: [1, 3],
        count: 4,
        interval: 2,
      }),
    ),
    ["2027-01-04", "2027-01-06", "2027-01-18", "2027-01-20"],
  );
  assert.deepEqual(
    occurrenceDates(
      "2027-01-31",
      repeatSchema.parse({ frequency: "monthly", count: 3, interval: 1 }),
    ),
    ["2027-01-31", "2027-03-31", "2027-05-31"],
  );
});
test("layout size serialization, version history and reusable templates round-trip safely", async () => {
  const elements = [
    { id: "chair-1", type: "chair", x: 100, y: 150, r: 90, w: 60, h: 64 },
  ];
  assert.equal(
    (
      await req("/rooms/" + roomId + "/layout", admin, "PUT", {
        version: 1,
        elements,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/rooms/" + roomId + "/versions/2", member)).status,
    403,
  );
  assert.deepEqual(
    (await req("/rooms/" + roomId + "/versions/2", admin)).data.layout,
    elements,
  );
  assert.equal(
    (await req("/rooms/" + roomId + "/versions", admin)).data.length,
    2,
  );
  const template = await req("/layout-templates", admin, "POST", {
    name: "EVO-" + tag,
    elements,
  });
  assert.equal(template.status, 201);
  assert.deepEqual(
    (await req("/layout-templates", admin)).data.find(
      (t: any) => t.id === template.data.id,
    ).layout,
    elements,
  );
  assert.equal(
    (
      await req("/rooms/" + roomId + "/layout", admin, "PUT", {
        version: 2,
        elements: [{ ...elements[0], w: Infinity }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await req("/layout-templates/" + template.data.id, admin, "DELETE"))
      .status,
    200,
  );
});
test("calendar pages 100 resources and 1000 events without leaking private details", async () => {
  const ids = Array.from({ length: 100 }, (_, i) => "perf-" + tag + "-" + i);
  roomIds.push(...ids);
  await pool.query(
    `INSERT INTO rooms(id,data,floor_id) SELECT x,jsonb_build_object('id',x,'name',x,'code',x,'building',$2::text,'floor','四层','status','enabled','rule','instant'),$3 FROM unnest($1::text[]) x`,
    [ids, "性能-" + tag, floorIds[1]],
  );
  await pool.query(
    `INSERT INTO bookings(id,room_id,user_id,title,contact,phone,hidden,start_at,end_at,status) SELECT gen_random_uuid(),r,$2,'私密日程','secret','secret',true,$3::timestamptz+i*interval '30 minutes',$3::timestamptz+(i+1)*interval '30 minutes','confirmed' FROM unnest($1::text[]) r CROSS JOIN generate_series(0,9) i`,
    [ids, memberId, future(100) + "T08:00:00+08:00"],
  );
  const start = performance.now(),
    c = await req(
      "/calendar?" +
        new URLSearchParams({
          date: future(100),
          view: "week",
          building: "性能-" + tag,
          size: "20",
          page: "2",
        }),
      other,
    );
  const elapsed = performance.now() - start;
  assert.equal(c.status, 200);
  assert.equal(c.data.rooms.length, 20);
  assert.equal(c.data.bookings.length, 200);
  assert.equal(c.data.pages, 5);
  assert.ok(
    c.data.bookings.every(
      (b: any) =>
        b.title === "已占用" &&
        b.phone === undefined &&
        b.contact === undefined,
    ),
  );
  assert.ok(elapsed < 3000);
  console.log(
    `Calendar 100 resources/1000 events page: ${Math.round(elapsed)} ms`,
  );
});
test("email outbox retries on failure then delivers once and keeps booking writes independent", async () => {
  await pool.query("UPDATE users SET email=$1 WHERE id=$2", [
    "recipient@example.invalid",
    otherId,
  ]);
  const create = await req(
    "/bookings",
    other,
    "POST",
    booking({ date: future(200) }),
  );
  assert.equal(create.status, 201);
  const failing = nodemailer.createTransport({
    host: "127.0.0.1",
    port: 1,
    connectionTimeout: 100,
  });
  const result = await deliverEmails(failing, otherId);
  assert.ok(result.failed > 0);
  await pool.query(
    "UPDATE email_outbox SET next_attempt_at=now() WHERE notification_id IN (SELECT id FROM notifications WHERE user_id=$1)",
    [otherId],
  );
  const messages: string[] = [];
  const smtp = createServer((socket) => {
    socket.write("220 localhost SMTP ready\r\n");
    let buffer = "",
      data = false,
      message = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const n = buffer.indexOf("\r\n"),
          line = buffer.slice(0, n);
        buffer = buffer.slice(n + 2);
        if (data) {
          if (line === ".") {
            messages.push(message);
            message = "";
            data = false;
            socket.write("250 queued\r\n");
          } else message += line + "\r\n";
        } else if (line === "DATA") {
          data = true;
          socket.write("354 end with dot\r\n");
        } else if (line === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 localhost\r\n");
      }
    });
  });
  await new Promise<void>((r) => smtp.listen(0, "127.0.0.1", r));
  const address = smtp.address();
  if (!address || typeof address === "string") throw Error("SMTP address");
  try {
    const success = nodemailer.createTransport({
      host: "127.0.0.1",
      port: address.port,
      ignoreTLS: true,
      connectionTimeout: 1000,
    });
    const sent = await deliverEmails(success, otherId);
    assert.ok(sent.sent > 0);
    assert.ok(messages.some((m) => m.includes("recipient@example.invalid")));
    assert.equal((await deliverEmails(success, otherId)).sent, 0);
  } finally {
    await new Promise<void>((r) => smtp.close(() => r()));
  }
});
