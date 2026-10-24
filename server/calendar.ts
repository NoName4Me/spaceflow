import { Router } from "express";
import { z } from "zod";
import { pool } from "./db.ts";
import { canView, canBook } from "./access.ts";
export const calendar = Router();
calendar.get("/calendar", async (req, res) => {
  const q = z
    .object({
      date: z.iso.date(),
      view: z.enum(["day", "week"]).default("day"),
      page: z.coerce.number().int().min(1).default(1),
      size: z.coerce.number().int().min(1).max(50).default(20),
      building: z.string().max(100).optional(),
      floor: z.string().max(100).optional(),
    })
    .parse(req.query);
  const first = new Date(q.date + "T00:00:00Z");
  if (q.view === "week")
    first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const dates = Array.from({ length: q.view === "week" ? 7 : 1 }, (_, i) => {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const all = (
    await pool.query(
      "SELECT data,floor_id FROM rooms ORDER BY data->>'building',data->>'floor',data->>'code',id",
    )
  ).rows.filter(
    (r) =>
      canView(r.data, req.user) &&
      (!q.building || q.building === r.data.building) &&
      (!q.floor || q.floor === r.data.floor),
  );
  const rooms = all
    .slice((q.page - 1) * q.size, q.page * q.size)
    .map((r) => ({ ...r.data, canBook: canBook(r.data, req.user) }));
  const end = new Date(first);
  end.setUTCDate(end.getUTCDate() + dates.length);
  const bookings = (
    await pool.query(
      "SELECT *,to_char(start_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS date,to_char(start_at AT TIME ZONE 'Asia/Shanghai','HH24:MI') AS start,to_char(end_at AT TIME ZONE 'Asia/Shanghai','HH24:MI') AS end FROM bookings WHERE room_id=ANY($1::text[]) AND status IN ('confirmed','pending') AND start_at>=$2 AND start_at<$3 ORDER BY start_at",
      [
        rooms.map((r) => r.id),
        dates[0] + "T00:00:00+08:00",
        end.toISOString().slice(0, 10) + "T00:00:00+08:00",
      ],
    )
  ).rows.map((b) => ({
    id: b.id,
    roomId: b.room_id,
    date: b.date,
    start: b.start,
    end: b.end,
    status: b.status,
    hidden: b.hidden,
    revision: b.revision,
    seriesId: b.series_id,
    owner: b.user_id === req.user.id ? "me" : "other",
    ...(!b.hidden || b.user_id === req.user.id || req.user.role === "admin"
      ? { title: b.title, contact: b.contact, phone: b.phone }
      : { title: "已占用" }),
  }));
  res.json({
    dates,
    rooms,
    bookings,
    page: q.page,
    pages: Math.max(1, Math.ceil(all.length / q.size)),
    total: all.length,
  });
});
