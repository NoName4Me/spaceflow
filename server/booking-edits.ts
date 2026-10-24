import { Router } from "express";
import { z } from "zod";
import { transaction } from "./db.ts";
import { canBook, canView } from "./access.ts";
const fail = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
const text = z.string().trim().min(1).max(100),
  clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const schema = z
  .object({
    revision: z.number().int().positive(),
    title: text,
    contact: text,
    phone: text,
    hidden: z.boolean(),
    roomId: text,
    date: z.iso.date(),
    start: clock,
    end: clock,
    scope: z.enum(["single", "future"]).default("single"),
  })
  .strict();
export const bookingEdits = Router();
bookingEdits.put("/bookings/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    b = schema.parse(req.body);
  const start = new Date(`${b.date}T${b.start}:00+08:00`),
    end = new Date(`${b.date}T${b.end}:00+08:00`);
  if (
    start >= end ||
    start.valueOf() <= Date.now() ||
    end.valueOf() > Date.now() + 366 * 86400000
  )
    throw fail(400, "请选择未来一年内的有效时段");
  const result = await transaction(async (c) => {
    const initial = (
      await c.query("SELECT series_id FROM bookings WHERE id=$1", [id])
    ).rows[0];
    if (initial?.series_id)
      await c.query(
        "SELECT id FROM reservation_series WHERE id=$1 FOR NO KEY UPDATE",
        [initial.series_id],
      );
    const current = (
      await c.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!current) throw fail(404, "预订不存在");
    if (current.user_id !== req.user.id && req.user.role !== "admin")
      throw fail(403, "无修改权限");
    if (current.revision !== b.revision)
      throw fail(409, "预订已被修改，请刷新后重试");
    if (
      !["pending", "confirmed"].includes(current.status) ||
      current.start_at <= new Date() ||
      (current.status === "pending" && current.expires_at <= new Date())
    )
      throw fail(409, "仅能修改尚未开始的有效预订");
    const actor = (
      await c.query(
        "SELECT id,role,department_id,active FROM users WHERE id=$1 FOR SHARE",
        [req.user.id],
      )
    ).rows[0];
    if (!actor?.active) throw fail(401, "账号已停用");
    const room = (
      await c.query("SELECT data FROM rooms WHERE id=$1 FOR SHARE", [b.roomId])
    ).rows[0]?.data;
    if (!room || !canView(room, actor)) throw fail(404, "会议室不存在");
    if (!canBook(room, actor)) throw fail(403, "该会议室当前不可预订");
    if (b.scope === "future" && !current.series_id)
      throw fail(400, "该预订不属于周期系列");
    if (b.scope === "future" && !room.repeat)
      throw fail(403, "会议室未开放周期预订");
    const occurrences =
      b.scope === "future"
        ? (
            await c.query(
              "SELECT * FROM bookings WHERE series_id=$1 AND start_at>=$2 AND status IN ('pending','confirmed') ORDER BY start_at FOR UPDATE",
              [current.series_id, current.start_at],
            )
          ).rows
        : [current];
    const shift = start.valueOf() - current.start_at.valueOf(),
      duration = end.valueOf() - start.valueOf();
    const timeChanged = (o: any) =>
      b.roomId !== o.room_id ||
      shift !== 0 ||
      duration !== o.end_at.valueOf() - o.start_at.valueOf();
    if (
      occurrences.some(
        (o) =>
          o.start_at.valueOf() + shift <= Date.now() ||
          o.start_at.valueOf() + shift + duration > Date.now() + 366 * 86400000,
      )
    )
      throw fail(400, "修改后的全部时段必须在未来一年内");
    // Release all affected holds inside this transaction, so swaps among occurrences cannot conflict with themselves.
    await c.query(
      "UPDATE bookings SET status='cancelled' WHERE id=ANY($1::uuid[])",
      [occurrences.map((o) => o.id)],
    );
    for (const o of occurrences) {
      const movedStart = new Date(o.start_at.valueOf() + shift),
        movedEnd = new Date(movedStart.valueOf() + duration);
      if (
        movedStart.toLocaleDateString("en-CA", {
          timeZone: "Asia/Shanghai",
        }) !==
        movedEnd.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
      )
        throw fail(400, "预订不能跨日");
      const status =
        room.rule === "approval" && timeChanged(o) ? "pending" : o.status;
      await c.query(
        "UPDATE bookings SET room_id=$1,title=$2,contact=$3,phone=$4,hidden=$5,start_at=$6,end_at=$7,status=$8,expires_at=CASE WHEN $8='pending' THEN LEAST(COALESCE($10::timestamptz,now()+interval '24 hours'),$6::timestamptz) ELSE NULL END,revision=revision+1 WHERE id=$9",
        [
          b.roomId,
          b.title,
          b.contact,
          b.phone,
          b.hidden,
          movedStart,
          movedEnd,
          status,
          o.id,
          timeChanged(o) ? null : o.expires_at,
        ],
      );
      if (o.series_id && timeChanged(o))
        await c.query(
          "INSERT INTO reservation_exceptions VALUES($1,($2::timestamptz AT TIME ZONE 'Asia/Shanghai')::date,'modified') ON CONFLICT(series_id,date) DO UPDATE SET reason='modified'",
          [o.series_id, o.start_at],
        );
      await c.query(
        "INSERT INTO audit(actor,action,target) VALUES($1,'booking.updated',$2)",
        [req.user.id, o.id],
      );
    }
    if (current.series_id)
      await c.query(
        "UPDATE reservation_series SET revision=revision+1,rule=jsonb_set(rule,'{changes}',COALESCE(rule->'changes','[]'::jsonb) || $2::jsonb) WHERE id=$1",
        [
          current.series_id,
          JSON.stringify({
            from: current.start_at,
            scope: b.scope,
            roomId: b.roomId,
            date: b.date,
            start: b.start,
            end: b.end,
          }),
        ],
      );
    return occurrences.length;
  });
  res.json({ ok: true, count: result });
});
