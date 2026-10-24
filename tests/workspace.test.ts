import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { app } from "../server/app.ts";
import { pool } from "../server/db.ts";
import { hashPassword } from "../server/auth.ts";
const tag = randomUUID(),
  adminId = randomUUID(),
  memberId = randomUUID();
let buildingId = "",
  floorId = "",
  secondFloor = "",
  templateId = "",
  admin = "",
  member = "",
  reservation = "";
const ids: string[] = [];
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
before(async () => {
  const password = "Workspace-password-123",
    hash = await hashPassword(password);
  for (const [id, role] of [
    [adminId, "admin"],
    [memberId, "member"],
  ]) {
    await pool.query(
      "INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",
      [id, id, role, hash, role],
    );
    const r = await req("/login", "", "POST", { username: id, password });
    if (role === "admin") admin = r.cookie;
    else member = r.cookie;
  }
  buildingId = (await req("/buildings", admin, "POST", { name: "WS-" + tag }))
    .data.id;
  floorId = (await req("/floors", admin, "POST", { name: "1F", buildingId }))
    .data.id;
  secondFloor = (
    await req("/floors", admin, "POST", { name: "2F", buildingId })
  ).data.id;
  templateId = (
    await req("/layout-templates", admin, "POST", {
      name: "WS-" + tag,
      type: "董事会式",
      elements: [{ id: "screen", type: "screen", x: 200, y: 50, r: 0 }],
    })
  ).data.id;
  for (let i = 0; i < 3; i++) {
    const r = await req("/rooms", admin, "POST", {
      floorId,
      name: "WS-" + i,
      code: tag + "-" + i,
      type: "董事会式",
      layoutTemplateId: templateId,
      capacity: 6,
      area: 20,
      equip: ["白板"],
      desc: "保留介绍",
      rule: "instant",
      status: "enabled",
      repeat: false,
      access,
    });
    assert.equal(r.status, 201);
    ids.push(r.data.id);
  }
  const r = await req("/bookings", member, "POST", {
    roomId: ids[0],
    title: "保持预订",
    contact: "申请人",
    phone: "13800138000",
    hidden: false,
    date: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    start: "10:00",
    end: "11:00",
  });
  assert.equal(r.status, 201);
  reservation = r.data.id;
});
after(async () => {
  await pool.query("DELETE FROM audit WHERE actor=ANY($1::uuid[])", [
    [adminId, memberId],
  ]);
  await pool.query("DELETE FROM bookings WHERE room_id=ANY($1::text[])", [ids]);
  await pool.query("DELETE FROM rooms WHERE id=ANY($1::text[])", [ids]);
  if (templateId)
    await pool.query("DELETE FROM layout_templates WHERE id=$1", [templateId]);
  await pool.query("DELETE FROM floors WHERE building_id=$1", [buildingId]);
  if (buildingId)
    await pool.query("DELETE FROM buildings WHERE id=$1", [buildingId]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [adminId, memberId],
  ]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [adminId, memberId],
  ]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
});
test("bulk edits change only selected fields and rooms, preserving permissions and reservations", async () => {
  const r = await req("/rooms/bulk", admin, "POST", {
    roomIds: ids.slice(0, 2),
    patch: { capacity: 12, area: 40, equip: ["投屏", "白板"] },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.count, 2);
  const rows = (await req("/state", admin)).data.rooms.filter((r: any) =>
    ids.includes(r.id),
  );
  for (const id of ids.slice(0, 2)) {
    const r = rows.find((r: any) => r.id === id);
    assert.equal(r.capacity, 12);
    assert.equal(r.area, 40);
    assert.deepEqual(r.equip, ["投屏", "白板"]);
    assert.equal(r.desc, "保留介绍");
    assert.deepEqual(r.access, access);
  }
  assert.equal(rows.find((r: any) => r.id === ids[2]).capacity, 6);
  assert.equal(
    (await req("/state", member)).data.bookings.find(
      (b: any) => b.id === reservation,
    ).status,
    "confirmed",
  );
});
test("bulk operations validate role, requested fields and entire selection before any write", async () => {
  const body = { roomIds: [ids[0], ids[1]], patch: { capacity: 20 } };
  assert.equal((await req("/rooms/bulk", member, "POST", body)).status, 403);
  assert.equal(
    (
      await req("/rooms/bulk", admin, "POST", {
        ...body,
        roomIds: [ids[0], "missing"],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req("/rooms/bulk", admin, "POST", {
        ...body,
        patch: { capacity: 0, area: 90 },
      })
    ).status,
    400,
  );
  assert.equal(
    (await req("/rooms/bulk", admin, "POST", { ...body, patch: {} })).status,
    400,
  );
  assert.equal(
    (
      await req("/rooms/bulk", admin, "POST", {
        ...body,
        patch: { name: "不能批量改名" },
      })
    ).status,
    400,
  );
  assert.equal(
    (await req("/state", admin)).data.rooms.find((r: any) => r.id === ids[0])
      .capacity,
    12,
  );
});
test("user previews use assigned shared layouts, independent of legacy room furniture", async () => {
  await req("/rooms/" + ids[0] + "/layout", admin, "PUT", {
    version: 1,
    elements: [{ id: "legacy-chair", type: "chair", x: 100, y: 100, r: 0 }],
  });
  const elements = [
    { id: "screen", type: "screen", x: 350, y: 45, r: 0 },
    { id: "board", type: "board", x: 80, y: 140, r: 90 },
  ];
  const changed = await req("/layout-templates/" + templateId, admin, "PUT", {
    name: "WS-new-" + tag,
    type: "U 型",
    version: 1,
    elements,
  });
  assert.equal(changed.status, 200);
  const state = (await req("/state", member)).data;
  for (const id of ids) {
    assert.equal(
      state.rooms.find((r: any) => r.id === id).layoutTemplateId,
      templateId,
    );
    assert.deepEqual(state.layouts[id], elements);
    assert.equal(state.rooms.find((r: any) => r.id === id).type, "U 型");
  }
  const templates = state.layoutTemplates.find((t: any) => t.id === templateId);
  assert.equal(templates.version, 2);
  assert.equal(
    (
      await req("/layout-templates/" + templateId, admin, "PUT", {
        name: "WS-new-" + tag,
        type: "U 型",
        version: 1,
        elements,
      })
    ).status,
    409,
  );
  assert.equal(
    (await req("/layout-templates/" + templateId + "/versions", member)).status,
    403,
  );
  assert.equal(
    (await req("/layout-templates/" + templateId + "/versions", admin)).data
      .length,
    2,
  );
  assert.equal(
    (await req("/layout-templates/" + templateId + "/versions/1", admin)).data
      .layout.length,
    1,
  );
});
test("used layouts cannot be deleted; batch reassignment retains meeting-room identity", async () => {
  assert.equal(
    (await req("/layout-templates/" + templateId, admin, "DELETE")).status,
    409,
  );
  const fallback = (await req("/state", admin)).data.layoutTemplates.find(
    (t: any) => t.is_builtin,
  );
  assert.equal(
    (
      await req("/rooms/bulk", admin, "POST", {
        roomIds: ids,
        patch: {
          layoutTemplateId: fallback.id,
          floorId: secondFloor,
          rule: "approval",
          repeat: true,
        },
      })
    ).status,
    200,
  );
  const state = (await req("/state", admin)).data;
  for (const id of ids) {
    const r = state.rooms.find((r: any) => r.id === id);
    assert.equal(r.floorId, secondFloor);
    assert.equal(r.floor, "2F");
    assert.equal(r.layoutTemplateId, fallback.id);
    assert.equal(r.rule, "approval");
  }
  assert.equal(
    state.bookings.find((b: any) => b.id === reservation).roomId,
    ids[0],
  );
  assert.equal(
    (await req("/layout-templates/" + templateId, admin, "DELETE")).status,
    200,
  );
});
