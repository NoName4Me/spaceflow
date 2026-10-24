import { resolveTemplate } from "./template-choice.ts";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "./db.ts";
import { hashPassword, verifyPassword } from "./auth.ts";
import { resolveLocation } from "./locations.ts";
import { accessSchema } from "./access.ts";
const fail = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
const text = z.string().trim().min(1).max(100),
  password = z.string().min(10).max(256);
export const management = Router();
management.post("/account/password", async (req, res) => {
  const b = z
    .object({
      currentPassword: z.string().min(1).max(256),
      newPassword: password,
    })
    .parse(req.body);
  await transaction(async (c) => {
    const u = (
      await c.query("SELECT password_hash FROM users WHERE id=$1 FOR UPDATE", [
        req.user.id,
      ])
    ).rows[0];
    if (!(await verifyPassword(b.currentPassword, u.password_hash)))
      throw fail(400, "当前密码错误");
    await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
      await hashPassword(b.newPassword),
      req.user.id,
    ]);
    await c.query("DELETE FROM sessions WHERE user_id=$1", [req.user.id]);
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'account.password',$2)",
      [req.user.id, req.user.id],
    );
  });
  res.clearCookie("session", { path: "/" }).json({ ok: true });
});
management.put("/account/email", async (req, res) => {
  const b = z.object({ email: z.email().nullable() }).parse(req.body);
  await pool.query("UPDATE users SET email=$1 WHERE id=$2", [
    b.email,
    req.user.id,
  ]);
  res.json({ ok: true });
});
management.get("/notifications", async (req, res) =>
  res.json(
    (
      await pool.query(
        `SELECT n.id,n.status,n.created_at,n.read_at,b.title,to_char(b.start_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI') AS start,r.data->>'name' AS room FROM notifications n JOIN bookings b ON b.id=n.booking_id JOIN rooms r ON r.id=b.room_id WHERE n.user_id=$1 ORDER BY n.id DESC LIMIT 100`,
        [req.user.id],
      )
    ).rows,
  ),
);
management.post("/notifications/read", async (req, res) => {
  await pool.query(
    "UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL",
    [req.user.id],
  );
  res.json({ ok: true });
});
management.use(
  ["/admin", "/rooms", "/users", "/departments"],
  (req, _res, next) => {
    if (req.user.role !== "admin") throw fail(403, "需要管理员权限");
    next();
  },
);
management.get("/admin/directory", async (_req, res) =>
  res.json({
    users: (
      await pool.query(
        "SELECT u.id,u.username,u.name,u.role,u.department_id,u.active,u.email,d.name AS department FROM users u LEFT JOIN departments d ON u.department_id=d.id ORDER BY u.username",
      )
    ).rows,
    departments: (await pool.query("SELECT * FROM departments ORDER BY name"))
      .rows,
  }),
);
management.post("/departments", async (req, res) => {
  const b = z.object({ name: text }).parse(req.body);
  const id = randomUUID();
  await transaction(async (c) => {
    await c.query("INSERT INTO departments VALUES($1,$2)", [id, b.name]);
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'department.created',$2)",
      [req.user.id, id],
    );
  });
  res.status(201).json({ id });
});
management.put("/departments/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    b = z.object({ name: text }).parse(req.body);
  await transaction(async (c) => {
    const result = await c.query("UPDATE departments SET name=$1 WHERE id=$2", [
      b.name,
      id,
    ]);
    if (!result.rowCount) throw fail(404, "部门不存在");
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'department.updated',$2)",
      [req.user.id, id],
    );
  });
  res.json({ ok: true });
});
const userSchema = z
  .object({
    name: text,
    role: z.enum(["admin", "member"]),
    departmentId: z.uuid().nullable(),
    active: z.boolean(),
    email: z.email().nullable().optional().default(null),
  })
  .strict();
management.post("/users", async (req, res) => {
  const b = userSchema
    .extend({ username: z.string().regex(/^[a-zA-Z0-9_.-]{2,64}$/), password })
    .parse(req.body);
  const id = randomUUID();
  await transaction(async (c) => {
    await c.query(
      "INSERT INTO users(id,username,name,password_hash,role,department_id,active,email) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        b.username,
        b.name,
        await hashPassword(b.password),
        b.role,
        b.departmentId,
        b.active,
        b.email,
      ],
    );
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'user.created',$2)",
      [req.user.id, id],
    );
  });
  res.status(201).json({ id });
});
management.put("/users/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    b = userSchema.parse(req.body);
  await transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(847292)");
    const u = (
      await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!u) throw fail(404, "账号不存在");
    if (
      u.role === "admin" &&
      u.active &&
      (!b.active || b.role !== "admin") &&
      (
        await c.query(
          "SELECT 1 FROM users WHERE role='admin' AND active AND id<>$1",
          [id],
        )
      ).rowCount === 0
    )
      throw fail(409, "至少保留一个启用的管理员");
    await c.query(
      "UPDATE users SET name=$1,role=$2,department_id=$3,active=$4,email=$6 WHERE id=$5",
      [b.name, b.role, b.departmentId, b.active, id, b.email],
    );
    if (!b.active || u.role !== b.role)
      await c.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'user.updated',$2)",
      [req.user.id, id],
    );
  });
  res.json({ ok: true });
});
management.post("/users/:id/password", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    b = z.object({ password }).parse(req.body);
  await transaction(async (c) => {
    const r = await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
      await hashPassword(b.password),
      id,
    ]);
    if (!r.rowCount) throw fail(404, "账号不存在");
    await c.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'user.password',$2)",
      [req.user.id, id],
    );
  });
  res.json({ ok: true });
});
const roomSchema = z
  .object({
    name: text,
    code: text,
    layoutTemplateId: z.uuid().optional(),
    floorId: z.uuid().optional(),
    building: text.optional(),
    floor: text.optional(),
    capacity: z.number().int().min(1).max(1000),
    area: z.number().min(0).max(100000),
    type: z.enum(["董事会式", "U 型", "教室式", "圆桌式", "洽谈式"]),
    equip: z.array(text).max(30),
    desc: z.string().trim().max(2000),
    rule: z.enum(["instant", "approval", "admin"]),
    status: z.enum(["enabled", "disabled", "hidden", "maintenance"]),
    repeat: z.boolean(),
    access: accessSchema,
  })
  .strict();
async function validateAccess(
  access: z.infer<typeof accessSchema>,
  c: import("pg").PoolClient,
) {
  const users = [
    ...new Set([
      ...access.viewUsers,
      ...access.bookUsers,
      ...access.denyViewUsers,
      ...access.denyBookUsers,
    ]),
  ];
  const depts = [
    ...new Set([...access.viewDepartments, ...access.bookDepartments]),
  ];
  if (
    users.length !==
      (await c.query("SELECT id FROM users WHERE id=ANY($1::uuid[])", [users]))
        .rowCount ||
    depts.length !==
      (
        await c.query("SELECT id FROM departments WHERE id=ANY($1::uuid[])", [
          depts,
        ])
      ).rowCount
  )
    throw fail(400, "权限配置引用了不存在的用户或部门");
}
management.post("/rooms", async (req, res) => {
  const b = roomSchema.parse(req.body);
  const id = "room-" + randomUUID();
  await transaction(async (c) => {
    await validateAccess(b.access, c);
    const location = await resolveLocation(c, b);
    const template = await resolveTemplate(c, b.type, b.layoutTemplateId);
    await c.query(
      "INSERT INTO rooms(id,data,floor_id,layout_template_id) VALUES($1,$2,$3,$4)",
      [
        id,
        JSON.stringify({
          ...b,
          type: template.type,
          building: location.building,
          floor: location.floor,
          id,
          color: "#adc7b3",
        }),
        location.id,
        template.id,
      ],
    );
    await c.query(
      "INSERT INTO layout_versions(room_id,version,layout,actor) VALUES($1,1,'[]',$2)",
      [id, req.user.id],
    );
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'room.created',$2)",
      [req.user.id, id],
    );
  });
  res.status(201).json({ id });
});
management.put("/rooms/:id", async (req, res) => {
  const b = roomSchema.parse(req.body);
  await transaction(async (c) => {
    await validateAccess(b.access, c);
    const location = await resolveLocation(c, b);
    const template = await resolveTemplate(c, b.type, b.layoutTemplateId);
    const r = await c.query(
      "UPDATE rooms SET data=data || $1::jsonb,floor_id=$3,layout_template_id=$4 WHERE id=$2",
      [
        JSON.stringify({
          ...b,
          type: template.type,
          building: location.building,
          floor: location.floor,
        }),
        req.params.id,
        location.id,
        template.id,
      ],
    );
    if (!r.rowCount) throw fail(404, "会议室不存在");
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'room.updated',$2)",
      [req.user.id, req.params.id],
    );
  });
  res.json({ ok: true });
});
