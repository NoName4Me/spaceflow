import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "./db.ts";
import { canView, canBook } from "./access.ts";
import { repeatSchema, occurrenceDates } from "./recurrence.ts";
const fail = (status: number, message: string, conflicts?: unknown) =>
  Object.assign(new Error(message), { status, conflicts });
const text = z.string().trim().min(1).max(100),
  date = z.iso.date(),
  clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const windowSchema = z.object({
  roomId: text,
  date,
  start: clock,
  end: clock,
  repeat: repeatSchema.optional(),
});
const createSchema = windowSchema
  .extend({
    userId: z.uuid().optional(),
    title: text,
    contact: text,
    phone: text,
    hidden: z.boolean(),
    skipDates: z.array(date).max(52).default([]),
  })
  .strict();
function windows(b: z.infer<typeof windowSchema>) {
  const dates = occurrenceDates(b.date, b.repeat);
  const result = dates.map((date) => ({
    date,
    start: new Date(`${date}T${b.start}:00+08:00`),
    end: new Date(`${date}T${b.end}:00+08:00`),
  }));
  if (
    result.some(
      (w) =>
        w.start >= w.end ||
        w.start.valueOf() <= Date.now() ||
        w.end.valueOf() > Date.now() + 366 * 86400000,
    )
  )
    throw fail(400, "请选择未来一年内的有效时段");
  return result;
}
async function checkRoom(
  c: import("pg").PoolClient,
  b: z.infer<typeof windowSchema>,
  user: Express.Request["user"],
) {
  const room = (
    await c.query("SELECT data FROM rooms WHERE id=$1 FOR SHARE", [b.roomId])
  ).rows[0]?.data;
  if (!room || !canView(room, user)) throw fail(404, "会议室不存在");
  if (!canBook(room, user))
    throw fail(403, "没有该会议室的预订权限，或会议室暂停预订");
  if (b.repeat && !room.repeat) throw fail(403, "该会议室未开放周期预订");
  return room;
}
async function findConflicts(
  c: import("pg").PoolClient,
  roomId: string,
  ws: ReturnType<typeof windows>,
) {
  const result = await c.query(
    `SELECT w.date FROM jsonb_to_recordset($2::jsonb) AS w(date text,start timestamptz,"end" timestamptz) WHERE EXISTS(SELECT 1 FROM bookings b WHERE b.room_id=$1 AND b.status IN ('pending','confirmed') AND tstzrange(b.start_at,b.end_at,'[)') && tstzrange(w.start,w."end",'[)')) ORDER BY w.date`,
    [roomId, JSON.stringify(ws)],
  );
  return result.rows.map((r) => r.date as string);
}
export function reservationRoutes(expire: () => Promise<void>) {
  const routes = Router();
  routes.post("/bookings/preview", async (req, res) => {
    const b = windowSchema.parse(req.body),
      ws = windows(b);
    await expire();
    const conflicts = await transaction(async (c) => {
      await checkRoom(c, b, req.user);
      return findConflicts(c, b.roomId, ws);
    });
    res.json({ dates: ws.map((w) => w.date), conflicts });
  });
  routes.post("/bookings", async (req, res) => {
    const b = createSchema.parse(req.body),
      ws = windows(b),
      dates = ws.map((w) => w.date);
    if (
      b.skipDates.some((d) => !dates.includes(d)) ||
      (!b.repeat && b.skipDates.length)
    )
      throw fail(400, "跳过日期必须属于当前周期");
    const selected = ws.filter((w) => !b.skipDates.includes(w.date));
    if (!selected.length) throw fail(400, "至少保留一个有效时段");
    await expire();
    const seriesId = b.repeat ? randomUUID() : null,
      ids: string[] = [];
    await transaction(async (c) => {
      const actor = (
        await c.query(
          "SELECT id,role,department_id,active FROM users WHERE id=$1 FOR SHARE",
          [req.user.id],
        )
      ).rows[0];
      if (!actor?.active) throw fail(401, "账号已停用");
      if (b.userId && b.userId !== actor.id && actor.role !== "admin")
        throw fail(403, "仅管理员可以代订");
      const ownerId = b.userId || actor.id;
      if (
        ownerId !== actor.id &&
        !(
          await c.query(
            "SELECT id FROM users WHERE id=$1 AND active FOR SHARE",
            [ownerId],
          )
        ).rowCount
      )
        throw fail(400, "代订账号不存在或已停用");
      const room = await checkRoom(c, b, actor);
      const conflicts = await findConflicts(c, b.roomId, selected);
      if (conflicts.length)
        throw fail(
          409,
          "以下日期存在冲突，请调整时段或跳过冲突日期",
          conflicts,
        );
      if (seriesId) {
        await c.query(
          "INSERT INTO reservation_series(id,room_id,user_id,rule) VALUES($1,$2,$3,$4)",
          [
            seriesId,
            b.roomId,
            ownerId,
            JSON.stringify({
              ...b.repeat,
              firstDate: b.date,
              start: b.start,
              end: b.end,
              timeZone: "Asia/Shanghai",
            }),
          ],
        );
        for (const d of new Set(b.skipDates))
          await c.query(
            "INSERT INTO reservation_exceptions VALUES($1,$2,'conflict')",
            [seriesId, d],
          );
      }
      for (const w of selected) {
        const id = randomUUID();
        ids.push(id);
        const status = room.rule === "approval" ? "pending" : "confirmed";
        await c.query(
          "INSERT INTO bookings(id,room_id,user_id,title,contact,phone,hidden,start_at,end_at,status,expires_at,series_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $10='pending' THEN LEAST(now()+interval '24 hours',$8::timestamptz) END,$11)",
          [
            id,
            b.roomId,
            ownerId,
            b.title,
            b.contact,
            b.phone,
            b.hidden,
            w.start,
            w.end,
            status,
            seriesId,
          ],
        );
        await c.query(
          "INSERT INTO audit(actor,action,target) VALUES($1,'booking.created',$2)",
          [req.user.id, id],
        );
      }
    });
    res.status(201).json({ id: ids[0], ids, seriesId, skipped: b.skipDates });
  });
  routes.post("/series/:id/:action", async (req, res) => {
    const id = z.uuid().parse(req.params.id),
      action = z.enum(["cancel", "approve", "reject"]).parse(req.params.action);
    await expire();
    const count = await transaction(async (c) => {
      const series = (
        await c.query(
          "SELECT * FROM reservation_series WHERE id=$1 FOR NO KEY UPDATE",
          [id],
        )
      ).rows[0];
      if (!series) throw fail(404, "周期预订不存在");
      if (
        action === "cancel"
          ? series.user_id !== req.user.id && req.user.role !== "admin"
          : req.user.role !== "admin"
      )
        throw fail(403, "无操作权限");
      const status = {
        cancel: "cancelled",
        approve: "confirmed",
        reject: "rejected",
      }[action];
      const result = await c.query(
        `UPDATE bookings SET status=$1,revision=revision+1 WHERE series_id=$2 AND start_at>now() AND status=ANY($3::text[]) RETURNING start_at`,
        [
          status,
          id,
          action === "cancel" ? ["pending", "confirmed"] : ["pending"],
        ],
      );
      if (!result.rowCount) throw fail(409, "没有可处理的后续预订");
      if (action === "cancel")
        for (const r of result.rows)
          await c.query(
            "INSERT INTO reservation_exceptions VALUES($1,($2::timestamptz AT TIME ZONE 'Asia/Shanghai')::date,'cancelled') ON CONFLICT DO NOTHING",
            [id, r.start_at],
          );
      await c.query("INSERT INTO audit(actor,action,target) VALUES($1,$2,$3)", [
        req.user.id,
        `series.${action}`,
        id,
      ]);
      return result.rowCount;
    });
    res.json({ ok: true, count });
  });
  routes.get("/series/:id", async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const series = (
      await pool.query("SELECT * FROM reservation_series WHERE id=$1", [id])
    ).rows[0];
    if (
      !series ||
      (series.user_id !== req.user.id && req.user.role !== "admin")
    )
      throw fail(404, "周期预订不存在");
    res.json({
      ...series,
      exceptions: (
        await pool.query(
          "SELECT to_char(date,'YYYY-MM-DD') AS date,reason FROM reservation_exceptions WHERE series_id=$1 ORDER BY date",
          [id],
        )
      ).rows,
    });
  });
  return routes;
}
