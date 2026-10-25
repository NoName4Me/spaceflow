import { Router } from "express";
import { z } from "zod";
import { pool } from "./db.ts";
import { canView } from "./access.ts";
import { bookingView } from "./booking-view.ts";
const fail = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
export const roomBookings = Router();
roomBookings.get("/rooms/:id/bookings", async (req, res) => {
  const q = z
    .object({
      from: z.iso.date(),
      to: z.iso.date(),
      page: z.coerce.number().int().min(1).default(1),
      size: z.coerce.number().int().min(1).max(50).default(20),
    })
    .parse(req.query);
  const duration = new Date(q.to).valueOf() - new Date(q.from).valueOf();
  if (duration < 0 || duration > 365 * 86400000)
    throw fail(400, "日期范围须在一年以内");
  const room = (
    await pool.query("SELECT data FROM rooms WHERE id=$1", [req.params.id])
  ).rows[0];
  if (!room || !canView(room.data, req.user)) throw fail(404, "会议室不存在");
  const args = [req.params.id, q.from, q.to];
  const where =
    "b.room_id=$1 AND (b.status='confirmed' OR (b.status='pending' AND b.expires_at>now() AND b.start_at>now())) AND b.start_at>=($2::date::timestamp AT TIME ZONE 'Asia/Shanghai') AND b.start_at<(($3::date+1)::timestamp AT TIME ZONE 'Asia/Shanghai')";
  const total = Number(
    (
      await pool.query(
        `SELECT count(*) AS total FROM bookings b WHERE ${where}`,
        args,
      )
    ).rows[0].total,
  );
  const rows = (
    await pool.query(
      `SELECT b.*,u.name AS owner_name,to_char(b.start_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS date,to_char(b.start_at AT TIME ZONE 'Asia/Shanghai','HH24:MI') AS start,to_char(b.end_at AT TIME ZONE 'Asia/Shanghai','HH24:MI') AS end FROM bookings b JOIN users u ON u.id=b.user_id WHERE ${where} ORDER BY b.start_at DESC,b.id DESC LIMIT $4 OFFSET $5`,
      [...args, q.size, (q.page - 1) * q.size],
    )
  ).rows;
  res.json({
    bookings: rows.map((b) => bookingView(b, req.user, "主题保密")),
    page: q.page,
    pages: Math.max(1, Math.ceil(total / q.size)),
    total,
  });
});
