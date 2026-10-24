import { bulkRooms } from "./bulk-rooms.ts";
import { calendar } from "./calendar.ts";
import { layoutSchema, layouts } from "./layouts.ts";
import { bookingEdits } from "./booking-edits.ts";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "./db.ts";
import { tokenHash, verifyPassword, hashPassword } from "./auth.ts";
import { canView, canBook } from "./access.ts";
import { locations } from "./locations.ts";
import { management } from "./management.ts";
import { reservationRoutes } from "./reservations.ts";
type User = {
  id: string;
  username: string;
  name: string;
  role: "admin" | "member";
  department_id: string | null;
};
declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}
const fail = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
const short = z.string().trim().min(1).max(100);
export const app = express();
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; script-src 'self'; frame-ancestors 'none'",
  });
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.origin &&
    ![
      process.env.APP_ORIGIN || "http://127.0.0.1:3080",
      ...(process.env.ADDITIONAL_ORIGINS || " ")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ].includes(req.headers.origin)
  )
    return next(fail(403, "请求来源不允许"));
  next();
});
const dummyHash = await hashPassword(randomBytes(32).toString("hex"));
const attempts = new Map<string, { count: number; until: number }>();
app.post("/api/login", async (req, res) => {
  const body = z
    .object({ username: short, password: z.string().min(1).max(256) })
    .parse(req.body);
  const key = req.socket.remoteAddress || "local";
  let limit = attempts.get(key);
  if (!limit || limit.until < Date.now()) {
    limit = { count: 0, until: Date.now() + 60000 };
    attempts.set(key, limit);
  }
  if (++limit.count > 20) throw fail(429, "尝试过于频繁，请稍后再试");
  const user = (
    await pool.query("SELECT * FROM users WHERE username=$1", [body.username])
  ).rows[0];
  if (
    !(await verifyPassword(body.password, user?.password_hash || dummyHash)) ||
    !user ||
    !user.active
  )
    throw fail(401, "账号或密码错误");
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')",
    [tokenHash(token), user.id],
  );
  res
    .cookie("session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.APP_ORIGIN?.startsWith("https:"),
      maxAge: 43200000,
      path: "/",
    })
    .json({ ok: true });
});
app.use("/api", async (req, _res, next) => {
  const token = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("session="))
    ?.slice(8);
  const user =
    token &&
    (
      await pool.query(
        "SELECT u.id,u.username,u.name,u.role,u.department_id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now() AND u.active",
        [tokenHash(token)],
      )
    ).rows[0];
  if (!user) throw fail(401, "请先登录");
  req.user = user;
  next();
});
app.post("/api/logout", async (req, res) => {
  const token = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("session="))
    ?.slice(8);
  if (token)
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      tokenHash(token),
    ]);
  res.clearCookie("session", { path: "/" }).json({ ok: true });
});
app.get("/api/me", (req, res) => res.json(req.user));
export async function expireBookings() {
  await transaction(async (c) => {
    const expired = await c.query(
      "UPDATE bookings SET status='expired' WHERE status='pending' AND (expires_at<=now() OR start_at<=now()) RETURNING id",
    );
    for (const b of expired.rows)
      await c.query(
        "INSERT INTO audit(action,target) VALUES('booking.expired',$1)",
        [b.id],
      );
  });
}
app.get("/api/state", async (req, res) => {
  await expireBookings();
  const layoutTemplates = (
    await pool.query(
      "SELECT id,name,type,layout,version,is_builtin FROM layout_templates ORDER BY is_builtin DESC,name",
    )
  ).rows;
  const allRooms = (
    await pool.query("SELECT * FROM rooms ORDER BY data->>'code',id")
  ).rows;
  const rooms = allRooms.filter((r) => canView(r.data, req.user));
  const roomIds = rooms.map((r) => r.id);
  const bookings = (
    await pool.query(
      `SELECT b.*,to_char(start_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS date,to_char(start_at AT TIME ZONE 'Asia/Shanghai','HH24:MI') AS start,to_char(end_at AT TIME ZONE 'Asia/Shanghai','HH24:MI') AS end FROM bookings b WHERE (room_id=ANY($2::text[]) AND ($3::boolean OR status IN ('pending','confirmed'))) OR user_id=$1 ORDER BY start_at DESC LIMIT 10000`,
      [req.user.id, roomIds, req.user.role === "admin"],
    )
  ).rows.map((b) => {
    const visible =
      !b.hidden || b.user_id === req.user.id || req.user.role === "admin";
    return {
      id: b.id,
      roomId: b.room_id,
      roomName: allRooms.find((r) => r.id === b.room_id)?.data.name,
      seriesId: b.series_id,
      revision: b.revision,
      date: b.date,
      start: b.start,
      end: b.end,
      status: b.status,
      hidden: b.hidden,
      owner: b.user_id === req.user.id ? "me" : "other",
      ...(visible
        ? { title: b.title, contact: b.contact, phone: b.phone }
        : { title: "已占用" }),
    };
  });
  res.json({
    user: req.user,
    rooms: rooms.map((r) => ({
      ...r.data,
      floorId: r.floor_id,
      layoutTemplateId: r.layout_template_id,
      access: req.user.role === "admin" ? r.data.access : undefined,
      canBook: canBook(r.data, req.user),
      status: r.data.status || "enabled",
      version: r.version,
    })),
    layoutTemplates:
      req.user.role === "admin"
        ? layoutTemplates
        : layoutTemplates.filter((t) =>
            rooms.some(
              (r) =>
                r.layout_template_id === t.id ||
                (!r.layout_template_id && r.data.type === t.type),
            ),
          ),
    layouts: Object.fromEntries(
      rooms.map((r) => [
        r.id,
        req.user.role === "admin"
          ? r.layout
          : (
              layoutTemplates.find((t) => t.id === r.layout_template_id) ||
              layoutTemplates.find((t) => t.type === r.data.type)
            )?.layout || [],
      ]),
    ),
    bookings,
    unread: (
      await pool.query(
        "SELECT count(*)::int AS count FROM notifications WHERE user_id=$1 AND read_at IS NULL",
        [req.user.id],
      )
    ).rows[0].count,
  });
});
app.use("/api", management);
app.use("/api", bulkRooms);
app.use("/api", (req, res, next) => {
  if (
    req.path.startsWith("/buildings") ||
    req.path.startsWith("/floors") ||
    req.path === "/admin/locations"
  )
    return locations(req, res, next);
  next();
});
app.use("/api", reservationRoutes(expireBookings));
app.use("/api", async (req, _res, next) => {
  if (req.method === "PUT" && req.path.startsWith("/bookings/"))
    await expireBookings();
  next();
});
app.use("/api", bookingEdits);
app.use("/api", calendar);
app.use("/api", (req, res, next) => {
  if (
    req.path.startsWith("/layout-templates") ||
    req.path.includes("/versions")
  )
    return layouts(req, res, next);
  next();
});
app.post("/api/bookings/:id/:action", async (req, res) => {
  const action = z
    .enum(["cancel", "approve", "reject"])
    .parse(req.params.action);
  const id = z.uuid().parse(req.params.id);
  await expireBookings();
  await transaction(async (c) => {
    const b = (
      await c.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!b) throw fail(404, "预订不存在");
    if (
      action === "cancel"
        ? b.user_id !== req.user.id && req.user.role !== "admin"
        : req.user.role !== "admin"
    )
      throw fail(403, "无操作权限");
    if (
      action === "cancel"
        ? !["pending", "confirmed"].includes(b.status)
        : b.status !== "pending"
    )
      throw fail(409, "预订状态已变更，请刷新");
    if (b.series_id && action === "cancel")
      await c.query(
        "INSERT INTO reservation_exceptions VALUES($1,($2::timestamptz AT TIME ZONE 'Asia/Shanghai')::date,'cancelled') ON CONFLICT DO NOTHING",
        [b.series_id, b.start_at],
      );
    await c.query(
      "UPDATE bookings SET status=$1,revision=revision+1 WHERE id=$2",
      [
        { cancel: "cancelled", approve: "confirmed", reject: "rejected" }[
          action
        ],
        id,
      ],
    );
    await c.query("INSERT INTO audit(actor,action,target) VALUES($1,$2,$3)", [
      req.user.id,
      `booking.${action}`,
      id,
    ]);
  });
  res.json({ ok: true });
});
function admin(req: Request, _res: Response, next: NextFunction) {
  if (req.user.role !== "admin") throw fail(403, "需要管理员权限");
  next();
}
app.put("/api/rooms/:id/layout", admin, async (req, res) => {
  const b = layoutSchema.parse(req.body);
  if (new Set(b.elements.map((e) => e.id)).size !== b.elements.length)
    throw fail(400, "元素 ID 重复");
  await transaction(async (c) => {
    const result = await c.query(
      "UPDATE rooms SET layout=$1,version=version+1 WHERE id=$2 AND version=$3 RETURNING version",
      [JSON.stringify(b.elements), req.params.id, b.version],
    );
    if (!result.rowCount) throw fail(409, "布局已被其他人修改，请刷新后重试");
    await c.query(
      "INSERT INTO layout_versions(room_id,version,layout,actor) VALUES($1,$2,$3,$4)",
      [
        req.params.id,
        result.rows[0].version,
        JSON.stringify(b.elements),
        req.user.id,
      ],
    );
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'layout.saved',$2)",
      [req.user.id, req.params.id],
    );
  });
  res.json({ ok: true });
});
app.put("/api/rooms/:id/policy", admin, async (req, res) => {
  const b = z
    .object({
      rule: z.enum(["instant", "approval", "admin"]),
      status: z.enum(["enabled", "disabled", "hidden", "maintenance"]),
      repeat: z.boolean().optional(),
    })
    .strict()
    .parse(req.body);
  await transaction(async (c) => {
    const result = await c.query(
      "UPDATE rooms SET data=data || $1::jsonb WHERE id=$2",
      [JSON.stringify(b), req.params.id],
    );
    if (!result.rowCount) throw fail(404, "会议室不存在");
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'policy.updated',$2)",
      [req.user.id, req.params.id],
    );
  });
  res.json({ ok: true });
});
app.get("/api/audit", admin, async (_req, res) =>
  res.json(
    (
      await pool.query(
        `SELECT a.action,a.target,a.created_at,u.name,
 COALESCE(b.title || ' · ' || (br.data->>'name'),r.data->>'name',target_user.name,d.name,sr.data->>'name',location_building.name,location_floor.name,template.name,'已删除对象') AS target_name
 FROM audit a LEFT JOIN users u ON a.actor=u.id
 LEFT JOIN bookings b ON b.id::text=a.target LEFT JOIN rooms br ON br.id=b.room_id
 LEFT JOIN rooms r ON r.id=a.target LEFT JOIN users target_user ON target_user.id::text=a.target
 LEFT JOIN departments d ON d.id::text=a.target LEFT JOIN reservation_series s ON s.id::text=a.target
 LEFT JOIN rooms sr ON sr.id=s.room_id
 LEFT JOIN buildings location_building ON location_building.id::text=a.target
 LEFT JOIN floors location_floor ON location_floor.id::text=a.target
 LEFT JOIN layout_templates template ON template.id::text=a.target ORDER BY a.id DESC LIMIT 100`,
      )
    ).rows,
  ),
);
app.use("/api", (_req, _res, next) => next(fail(404, "接口不存在")));
app.use(express.static(new URL("../web/", import.meta.url).pathname));
app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  const conflict = error.code === "23P01";
  const duplicate = error.code === "23505",
    reference = error.code === "23503";
  const status =
    error instanceof z.ZodError || reference
      ? 400
      : conflict || duplicate
        ? 409
        : error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    conflicts: error.conflicts,
    message:
      error instanceof z.ZodError
        ? "输入格式不正确"
        : duplicate
          ? "名称、编号或账号已存在"
          : reference
            ? "引用的部门或账号不存在"
            : conflict
              ? "该时段已被占用，请调整时间"
              : status >= 500
                ? "服务暂时不可用"
                : error.message,
  });
});
