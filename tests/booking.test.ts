import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
const suffix = randomUUID();
const room = "test-" + suffix;
const userId = randomUUID(),
  otherId = randomUUID(),
  adminId = randomUUID();
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
if (!address || typeof address === "string") throw Error("No address");
const base = `http://127.0.0.1:${address.port}`;
let member = "",
  other = "",
  admin = "";
const password = "Integration-password-921";
async function request(
  path: string,
  token = "",
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return {
    status: response.status,
    data,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
let counter = 0;
function booking(patch: Record<string, unknown> = {}) {
  const d = new Date(Date.now() + (10 + counter++) * 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    roomId: room,
    title: "隐私主题",
    contact: "联系人",
    phone: "secret-123",
    hidden: true,
    date: d,
    start: "10:00",
    end: "11:00",
    ...patch,
  };
}
before(async () => {
  const hash = await hashPassword(password);
  for (const [id, name, role] of [
    [userId, "one", "member"],
    [otherId, "two", "member"],
    [adminId, "admin", "admin"],
  ])
    await pool.query("INSERT INTO users VALUES($1,$2,$3,$4,$5)", [
      id,
      `${name}-${suffix}`,
      name,
      hash,
      role,
    ]);
  await pool.query("INSERT INTO rooms(id,data) VALUES($1,$2)", [
    room,
    JSON.stringify({
      id: room,
      name: "测试",
      rule: "instant",
      status: "enabled",
    }),
  ]);
  member = (
    await request("/login", "", "POST", { username: "one-" + suffix, password })
  ).cookie;
  other = (
    await request("/login", "", "POST", { username: "two-" + suffix, password })
  ).cookie;
  admin = (
    await request("/login", "", "POST", {
      username: "admin-" + suffix,
      password,
    })
  ).cookie;
});
after(async () => {
  await pool.query(
    "DELETE FROM audit WHERE actor=ANY($1::uuid[]) OR target IN (SELECT id::text FROM bookings WHERE room_id=$2)",
    [[userId, otherId, adminId], room],
  );
  await pool.query("DELETE FROM bookings WHERE room_id=$1", [room]);
  await pool.query("DELETE FROM rooms WHERE id=$1", [room]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [userId, otherId, adminId],
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [userId, otherId, adminId],
  ]);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});
test("authentication, logout and origin enforcement", async () => {
  assert.equal((await request("/state")).status, 401);
  assert.equal(
    (
      await request("/login", "", "POST", {
        username: "one-" + suffix,
        password: "wrong",
      })
    ).status,
    401,
  );
  const response = await fetch(base + "/api/bookings", {
    method: "POST",
    headers: {
      Origin: "https://other.example",
      "Content-Type": "application/json",
      Cookie: member,
    },
    body: JSON.stringify(booking()),
  });
  assert.equal(response.status, 403);
  const session = (
    await request("/login", "", "POST", { username: "two-" + suffix, password })
  ).cookie;
  assert.equal((await request("/logout", session, "POST")).status, 200);
  assert.equal((await request("/me", session)).status, 401);
});
test("100 concurrent overlapping requests yield exactly one reservation", async () => {
  const b = booking();
  const results = await Promise.all(
    Array.from({ length: 100 }, () => request("/bookings", member, "POST", b)),
  );
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 99);
});
test("adjacent windows, cancellation and owner authorization", async () => {
  const b = booking();
  const first = await request("/bookings", member, "POST", b);
  assert.equal(first.status, 201);
  assert.equal(
    (
      await request("/bookings", other, "POST", {
        ...b,
        start: "11:00",
        end: "12:00",
      })
    ).status,
    201,
  );
  assert.equal(
    (await request(`/bookings/${first.data.id}/cancel`, other, "POST")).status,
    403,
  );
  assert.equal(
    (await request(`/bookings/${first.data.id}/cancel`, member, "POST")).status,
    200,
  );
  assert.equal((await request("/bookings", other, "POST", b)).status, 201);
});
test("hidden fields omitted for another user, available to owner and admin", async () => {
  const created = await request("/bookings", member, "POST", booking());
  const find = (data: any) =>
    data.bookings.find((b: any) => b.id === created.data.id);
  const hidden = find((await request("/state", other)).data);
  assert.equal(hidden.phone, undefined);
  assert.equal(hidden.contact, undefined);
  assert.equal(hidden.title, "已占用");
  assert.equal(
    find((await request("/state", member)).data).phone,
    "secret-123",
  );
  assert.equal(find((await request("/state", admin)).data).phone, "secret-123");
});
test("pending holds block; only admin approves; rejected holds release", async () => {
  await request(`/rooms/${room}/policy`, admin, "PUT", {
    rule: "approval",
    status: "enabled",
  });
  const b = booking();
  const first = await request("/bookings", member, "POST", b);
  assert.equal(first.status, 201);
  assert.equal((await request("/bookings", other, "POST", b)).status, 409);
  assert.equal(
    (await request(`/bookings/${first.data.id}/approve`, member, "POST"))
      .status,
    403,
  );
  assert.equal(
    (await request(`/bookings/${first.data.id}/approve`, admin, "POST")).status,
    200,
  );
  assert.equal(
    (await request(`/bookings/${first.data.id}/reject`, admin, "POST")).status,
    409,
  );
  const next = booking();
  const second = await request("/bookings", member, "POST", next);
  assert.equal(
    (await request(`/bookings/${second.data.id}/reject`, admin, "POST")).status,
    200,
  );
  assert.equal((await request("/bookings", other, "POST", next)).status, 201);
});
test("expired pending holds release and cannot be approved", async () => {
  const b = booking();
  const created = await request("/bookings", member, "POST", b);
  await pool.query(
    "UPDATE bookings SET expires_at=now()-interval '1 second' WHERE id=$1",
    [created.data.id],
  );
  assert.equal((await request("/bookings", other, "POST", b)).status, 201);
  assert.equal(
    (await request(`/bookings/${created.data.id}/approve`, admin, "POST"))
      .status,
    409,
  );
});
test("admin booking policy and disabled/hidden visibility", async () => {
  assert.equal(
    (
      await request(`/rooms/${room}/policy`, member, "PUT", {
        rule: "admin",
        status: "enabled",
      })
    ).status,
    403,
  );
  await request(`/rooms/${room}/policy`, admin, "PUT", {
    rule: "admin",
    status: "enabled",
  });
  assert.equal(
    (await request("/bookings", member, "POST", booking())).status,
    403,
  );
  assert.equal(
    (await request("/bookings", admin, "POST", booking())).status,
    201,
  );
  await request(`/rooms/${room}/policy`, admin, "PUT", {
    rule: "instant",
    status: "disabled",
  });
  assert.equal(
    (await request("/bookings", admin, "POST", booking())).status,
    403,
  );
  await request(`/rooms/${room}/policy`, admin, "PUT", {
    rule: "instant",
    status: "hidden",
  });
  assert.equal(
    (await request("/state", member)).data.rooms.some(
      (r: any) => r.id === room,
    ),
    false,
  );
  assert.equal(
    (await request("/bookings", member, "POST", booking())).status,
    404,
  );
  await request(`/rooms/${room}/policy`, admin, "PUT", {
    rule: "instant",
    status: "enabled",
  });
});
test("layout persists, checks revision, rejects unauthorized and unsafe values", async () => {
  const elements = [{ id: "chair-1", type: "chair", x: 100, y: 200, r: 90 }];
  assert.equal(
    (
      await request(`/rooms/${room}/layout`, member, "PUT", {
        version: 1,
        elements,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/rooms/${room}/layout`, admin, "PUT", {
        version: 1,
        elements,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/rooms/${room}/layout`, admin, "PUT", {
        version: 1,
        elements,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/rooms/${room}/layout`, admin, "PUT", {
        version: 2,
        elements: [{ ...elements[0], type: "<script>" }],
      })
    ).status,
    400,
  );
  assert.deepEqual(
    (await request("/state", admin)).data.layouts[room],
    elements,
  );
});
test("invalid dates, windows and past time rejected; writes audited", async () => {
  for (const patch of [
    { date: "2026-02-30" },
    { start: "25:00" },
    { start: "12:00", end: "10:00" },
    { date: "2020-01-01" },
    { title: " " },
  ])
    assert.equal(
      (await request("/bookings", member, "POST", booking(patch))).status,
      400,
    );
  assert.equal((await request("/audit", member)).status, 403);
  const audit: { id: string; action: string }[] = (
    await request("/audit", admin)
  ).data;
  assert.ok(audit.some((row) => row.action === "booking.created"));
  assert.ok(audit.every((row) => /^\d+$/.test(row.id)));
  assert.equal(new Set(audit.map((row) => row.id)).size, audit.length);
});
