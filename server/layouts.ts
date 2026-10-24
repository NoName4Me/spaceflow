import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db.ts";
export const elementsSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[\w-]{1,80}$/),
        type: z.enum([
          "table",
          "desk",
          "chair",
          "screen",
          "door",
          "window",
          "board",
        ]),
        x: z.number().min(0).max(600),
        y: z.number().min(0).max(390),
        r: z.number().min(-360).max(360),
        w: z.number().min(8).max(600).optional(),
        h: z.number().min(8).max(390).optional(),
      })
      .strict(),
  )
  .max(300)
  .refine((a) => new Set(a.map((e) => e.id)).size === a.length, "元素 ID 重复");
export const layoutSchema = z.object({
  version: z.number().int().positive(),
  elements: elementsSchema,
});
const fail = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
export const layouts = Router();
layouts.use((req, _res, next) => {
  if (req.user.role !== "admin") throw fail(403, "需要管理员权限");
  next();
});
layouts.get("/rooms/:id/versions", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT v.version,v.created_at,u.name AS actor FROM layout_versions v LEFT JOIN users u ON v.actor=u.id WHERE room_id=$1 ORDER BY version DESC LIMIT 50",
        [req.params.id],
      )
    ).rows,
  ),
);
layouts.get("/rooms/:id/versions/:version", async (req, res) => {
  const version = z.coerce.number().int().positive().parse(req.params.version);
  const row = (
    await pool.query(
      "SELECT version,layout FROM layout_versions WHERE room_id=$1 AND version=$2",
      [req.params.id, version],
    )
  ).rows[0];
  if (!row) throw fail(404, "版本不存在");
  res.json(row);
});
layouts.get("/layout-templates", async (_req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT id,name,layout FROM layout_templates ORDER BY name",
      )
    ).rows,
  ),
);
layouts.post("/layout-templates", async (req, res) => {
  const b = z
      .object({
        name: z.string().trim().min(1).max(100),
        elements: elementsSchema,
      })
      .parse(req.body),
    id = randomUUID();
  await transaction(async (c) => {
    await c.query(
      "INSERT INTO layout_templates(id,name,layout,created_by) VALUES($1,$2,$3,$4)",
      [id, b.name, JSON.stringify(b.elements), req.user.id],
    );
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'template.created',$2)",
      [req.user.id, id],
    );
  });
  res.status(201).json({ id });
});
layouts.delete("/layout-templates/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (c) => {
    await c.query("DELETE FROM layout_templates WHERE id=$1", [id]);
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'template.deleted',$2)",
      [req.user.id, id],
    );
  });
  res.json({ ok: true });
});
