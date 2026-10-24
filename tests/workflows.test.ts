import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
const tag = randomUUID(),
  adminId = randomUUID(),
  memberId = randomUUID(),
  otherId = randomUUID(),
  deptId = randomUUID();
const userIds = [adminId, memberId, otherId],
  roomIds: string[] = [],
  departmentIds = [deptId];
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const address = server.address();
if (!address || typeof address === "string") throw Error("address");
const base = `http://127.0.0.1:${address.port}`;
const password = "Workflows-password-123";
let admin = "",
  member = "",
  other = "";
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
const login = (name: string, p = password) =>
  req("/login", "", "POST", { username: `${name}-${tag}`, password: p });
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
let roomId = "";
const roomData = {
  name: "研讨室",
  code: "QA-" + tag,
  building: "测试楼-" + tag,
  floor: "3F",
  capacity: 8,
  area: 20,
  type: "圆桌式",
  equip: ["白板"],
  desc: "研讨交流",
  rule: "instant",
  status: "enabled",
  repeat: true,
  access,
};
let dayCounter = 0;
function booking(patch: Record<string, unknown> = {}) {
  return {
    roomId,
    title: "周期会议",
    contact: "申请人",
    phone: "13800138000",
    hidden: false,
    date: new Date(Date.now() + (45 + dayCounter++) * 86400000)
      .toISOString()
      .slice(0, 10),
    start: "10:00",
    end: "11:00",
    ...patch,
  };
}
before(async () => {
  await pool.query("INSERT INTO departments VALUES($1,$2)", [
    deptId,
    "部门-" + tag,
  ]);
  const hash = await hashPassword(password);
  for (const [id, name, role, department] of [
    [adminId, "admin", "admin", null],
    [memberId, "member", "member", deptId],
    [otherId, "other", "member", null],
  ])
    await pool.query(
      "INSERT INTO users(id,username,name,password_hash,role,department_id) VALUES($1,$2,$3,$4,$5,$6)",
      [id, `${name}-${tag}`, name, hash, role, department],
    );
  admin = (await login("admin")).cookie;
  member = (await login("member")).cookie;
  other = (await login("other")).cookie;
});
after(async () => {
  await pool.query("DELETE FROM audit WHERE actor=ANY($1::uuid[])", [userIds]);
  await pool.query("DELETE FROM bookings WHERE room_id=ANY($1::text[])", [
    roomIds,
  ]);
  await pool.query("DELETE FROM rooms WHERE id=ANY($1::text[])", [roomIds]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    userIds,
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [userIds]);
  await pool.query(
    "DELETE FROM floors WHERE building_id IN (SELECT id FROM buildings WHERE name=$1)",
    ["测试楼-" + tag],
  );
  await pool.query("DELETE FROM buildings WHERE name=$1", ["测试楼-" + tag]);
  await pool.query("DELETE FROM departments WHERE id=ANY($1::uuid[])", [
    departmentIds,
  ]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});
test("resource CRUD, room code uniqueness and safe schema", async () => {
  assert.equal((await req("/rooms", member, "POST", roomData)).status, 403);
  const created = await req("/rooms", admin, "POST", roomData);
  assert.equal(created.status, 201);
  roomId = created.data.id;
  roomIds.push(roomId);
  assert.equal((await req("/rooms", admin, "POST", roomData)).status, 409);
  assert.equal(
    (await req("/rooms/" + roomId, admin, "PUT", { ...roomData, capacity: 0 }))
      .status,
    400,
  );
  assert.equal(
    (
      await req("/rooms/" + roomId, admin, "PUT", {
        ...roomData,
        name: "更新会议室",
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("/state", member)).data.rooms.find((r: any) => r.id === roomId)
      .name,
    "更新会议室",
  );
});
test("separate department visibility/book rights, individual deny and server enforcement", async () => {
  const permission = {
    ...access,
    viewRestricted: true,
    viewDepartments: [deptId],
    bookRestricted: true,
    bookUsers: [otherId],
  };
  await req("/rooms/" + roomId, admin, "PUT", {
    ...roomData,
    access: permission,
  });
  assert.equal(
    (await req("/state", member)).data.rooms.find((r: any) => r.id === roomId)
      .canBook,
    false,
  );
  assert.equal((await req("/bookings", member, "POST", booking())).status, 403);
  assert.equal(
    (await req("/state", other)).data.rooms.some((r: any) => r.id === roomId),
    false,
  );
  assert.equal(
    (await req("/bookings/preview", other, "POST", booking())).status,
    404,
  );
  await req("/rooms/" + roomId, admin, "PUT", {
    ...roomData,
    access: { ...permission, bookDepartments: [deptId] },
  });
  assert.equal((await req("/bookings", member, "POST", booking())).status, 201);
  await req("/rooms/" + roomId, admin, "PUT", {
    ...roomData,
    access: {
      ...permission,
      viewUsers: [otherId],
      bookDepartments: [deptId],
      denyViewUsers: [otherId],
      denyBookUsers: [memberId],
    },
  });
  assert.equal((await req("/bookings", member, "POST", booking())).status, 403);
  assert.equal(
    (await req("/state", other)).data.rooms.some((r: any) => r.id === roomId),
    false,
  );
  assert.equal((await req("/bookings", admin, "POST", booking())).status, 201);
  await req("/rooms/" + roomId, admin, "PUT", roomData);
});
test("series preview, all-or-nothing rollback, reviewed skips, single exception and future cancellation", async () => {
  const b = booking({ repeat: { frequency: "weekly", count: 4, interval: 1 } });
  const preview = await req("/bookings/preview", member, "POST", b);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.dates.length, 4);
  assert.deepEqual(preview.data.conflicts, []);
  const conflictDate = preview.data.dates[1];
  const occupied = await req("/bookings", other, "POST", {
    ...b,
    repeat: undefined,
    date: conflictDate,
  });
  assert.equal(occupied.status, 201);
  const denied = await req("/bookings", member, "POST", b);
  assert.equal(denied.status, 409);
  assert.deepEqual(denied.data.conflicts, [conflictDate]);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM reservation_series WHERE room_id=$1",
        [roomId],
      )
    ).rows[0].count,
    0,
  );
  const created = await req("/bookings", member, "POST", {
    ...b,
    skipDates: [conflictDate],
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.ids.length, 3);
  assert.equal(
    (await req(`/series/${created.data.seriesId}`, other)).status,
    404,
  );
  const cancelled = await req(
    `/bookings/${created.data.ids[0]}/cancel`,
    member,
    "POST",
  );
  assert.equal(cancelled.status, 200);
  const series = await req(`/series/${created.data.seriesId}`, member);
  assert.deepEqual(series.data.exceptions.map((e: any) => e.reason).sort(), [
    "cancelled",
    "conflict",
  ]);
  assert.equal(
    (await req(`/series/${created.data.seriesId}/cancel`, other, "POST"))
      .status,
    403,
  );
  assert.equal(
    (await req(`/series/${created.data.seriesId}/cancel`, member, "POST")).data
      .count,
    2,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM bookings WHERE series_id=$1 AND status='confirmed'",
        [created.data.seriesId],
      )
    ).rows[0].count,
    0,
  );
  const notices = (await req("/notifications", member)).data;
  assert.ok(notices.some((n: any) => n.status === "cancelled"));
  await req("/notifications/read", member, "POST");
  assert.equal((await req("/state", member)).data.unread, 0);
});
test("a new unreviewed series conflict aborts every occurrence; room toggle enforced", async () => {
  const b = booking({ repeat: { frequency: "daily", count: 3, interval: 2 } }),
    p = (await req("/bookings/preview", member, "POST", b)).data;
  await req("/bookings", other, "POST", {
    ...b,
    repeat: undefined,
    date: p.dates[1],
  });
  assert.equal(
    (await req("/bookings", member, "POST", { ...b, skipDates: [p.dates[0]] }))
      .status,
    409,
  );
  const list = (await req("/state", member)).data.bookings;
  assert.equal(
    list.some((r: any) => r.owner === "me" && r.date === p.dates[2]),
    false,
  );
  assert.equal(
    (
      await req("/bookings", member, "POST", {
        ...b,
        skipDates: ["2099-01-01"],
      })
    ).status,
    400,
  );
  await req("/rooms/" + roomId, admin, "PUT", { ...roomData, repeat: false });
  assert.equal((await req("/bookings", member, "POST", b)).status, 403);
  await req("/rooms/" + roomId, admin, "PUT", roomData);
});
test("series approval/rejection affects only pending future occurrences and emits notices", async () => {
  await req("/rooms/" + roomId, admin, "PUT", {
    ...roomData,
    rule: "approval",
  });
  const b = booking({ repeat: { frequency: "weekly", count: 3, interval: 1 } }),
    created = await req("/bookings", member, "POST", b);
  assert.equal(created.status, 201);
  assert.equal(
    (await req(`/series/${created.data.seriesId}/approve`, member, "POST"))
      .status,
    403,
  );
  assert.equal(
    (await req(`/series/${created.data.seriesId}/approve`, admin, "POST")).data
      .count,
    3,
  );
  assert.equal(
    (await req(`/series/${created.data.seriesId}/reject`, admin, "POST"))
      .status,
    409,
  );
  await req(`/series/${created.data.seriesId}/cancel`, member, "POST");
  const again = await req("/bookings", member, "POST", b);
  assert.equal(
    (await req(`/series/${again.data.seriesId}/reject`, admin, "POST")).data
      .count,
    3,
  );
  assert.ok(
    (await req("/notifications", member)).data.some(
      (n: any) => n.status === "rejected",
    ),
  );
  await req("/rooms/" + roomId, admin, "PUT", roomData);
});
test("administrator proxy bookings belong to the selected user and notify that user", async () => {
  const b = booking({
    userId: otherId,
    date: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10),
  });
  assert.equal((await req("/bookings", member, "POST", b)).status, 403);
  const result = await req("/bookings", admin, "POST", b);
  assert.equal(result.status, 201);
  const occurrence = (await req("/state", other)).data.bookings.find(
    (r: any) => r.id === result.data.id,
  );
  assert.equal(occurrence.owner, "me");
  assert.ok(
    (await req("/notifications", other)).data.some(
      (n: any) => n.title === b.title,
    ),
  );
  const invalid = await req(
    "/bookings",
    admin,
    "POST",
    booking({ userId: randomUUID() }),
  );
  assert.equal(invalid.status, 400);
});
test("accounts, departments, reset, disabling and password change invalidate sessions", async () => {
  const department = await req("/departments", admin, "POST", {
    name: "新部门-" + tag,
  });
  assert.equal(department.status, 201);
  departmentIds.push(department.data.id);
  assert.equal(
    (
      await req("/departments/" + department.data.id, admin, "PUT", {
        name: "改名-" + tag,
      })
    ).status,
    200,
  );
  const payload = {
    name: "新员工",
    username: "new-" + tag,
    password,
    role: "member",
    active: true,
    departmentId: department.data.id,
  };
  const created = await req("/users", admin, "POST", payload);
  assert.equal(created.status, 201);
  userIds.push(created.data.id);
  assert.equal((await req("/users", admin, "POST", payload)).status, 409);
  const session = await login("new");
  assert.equal(session.status, 200);
  assert.equal((await req("/admin/directory", member)).status, 403);
  await req("/users/" + created.data.id, admin, "PUT", {
    name: "停用员工",
    role: "member",
    active: false,
    departmentId: null,
  });
  assert.equal((await req("/state", session.cookie)).status, 401);
  assert.equal((await login("new")).status, 401);
  await req("/users/" + created.data.id, admin, "PUT", {
    name: "新员工",
    role: "member",
    active: true,
    departmentId: null,
  });
  const active = (await login("new")).cookie;
  await req("/users/" + created.data.id + "/password", admin, "POST", {
    password: "Changed-password-123",
  });
  assert.equal((await req("/state", active)).status, 401);
  assert.equal((await login("new")).status, 401);
  const reset = (await login("new", "Changed-password-123")).cookie;
  assert.equal(
    (
      await req("/account/password", reset, "POST", {
        currentPassword: "wrong",
        newPassword: "Another-password-123",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req("/account/password", reset, "POST", {
        currentPassword: "Changed-password-123",
        newPassword: "Another-password-123",
      })
    ).status,
    200,
  );
  assert.equal((await req("/me", reset)).status, 401);
  assert.equal((await login("new", "Another-password-123")).status, 200);
});
