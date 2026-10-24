import { Router } from "express";
import { z } from "zod";
import { transaction } from "./db.ts";
import { resolveLocation } from "./locations.ts";
import { resolveTemplate } from "./template-choice.ts";
export const bulkRooms = Router();
bulkRooms.post("/rooms/bulk", async (req, res) => {
  if (req.user.role !== "admin")
    throw Object.assign(new Error("需要管理员权限"), { status: 403 });
  const patch = z
    .object({
      capacity: z.number().int().min(1).max(1000).optional(),
      area: z.number().min(0).max(100000).optional(),
      equip: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
      rule: z.enum(["instant", "approval", "admin"]).optional(),
      status: z
        .enum(["enabled", "disabled", "hidden", "maintenance"])
        .optional(),
      repeat: z.boolean().optional(),
      floorId: z.uuid().optional(),
      layoutTemplateId: z.uuid().optional(),
    })
    .strict()
    .refine((p) => Object.keys(p).length > 0, "请选择修改属性");
  const b = z
    .object({
      roomIds: z
        .array(z.string().min(1).max(100))
        .min(1)
        .max(200)
        .refine((ids) => new Set(ids).size === ids.length),
      patch,
    })
    .strict()
    .parse(req.body);
  await transaction(async (c) => {
    const changes: Record<string, unknown> = { ...b.patch };
    let floorId = null,
      templateId = null;
    if (b.patch.floorId) {
      const location = await resolveLocation(c, { floorId: b.patch.floorId });
      floorId = location.id;
      changes.building = location.building;
      changes.floor = location.floor;
    }
    if (b.patch.layoutTemplateId) {
      const template = await resolveTemplate(
        c,
        undefined,
        b.patch.layoutTemplateId,
      );
      templateId = template.id;
      changes.type = template.type;
    }
    const rows = await c.query(
      "SELECT id FROM rooms WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",
      [b.roomIds],
    );
    if (rows.rowCount !== b.roomIds.length)
      throw Object.assign(new Error("部分会议室不存在，请刷新后重试"), {
        status: 409,
      });
    await c.query(
      "UPDATE rooms SET data=data || $1::jsonb,floor_id=COALESCE($2::uuid,floor_id),layout_template_id=COALESCE($3::uuid,layout_template_id) WHERE id=ANY($4::text[])",
      [JSON.stringify(changes), floorId, templateId, b.roomIds],
    );
    for (const id of b.roomIds)
      await c.query(
        "INSERT INTO audit(actor,action,target) VALUES($1,'room.bulk-updated',$2)",
        [req.user.id, id],
      );
  });
  res.json({ ok: true, count: b.roomIds.length });
});
