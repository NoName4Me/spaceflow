import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "./db.ts";
const fail = (status: number, message: string) =>
  Object.assign(new Error(message), { status });
const name = z.string().trim().min(1).max(100),
  position = z.number().int().min(-10000).max(10000).default(0);
export const locations = Router();
locations.use((req, _res, next) => {
  if (req.user.role !== "admin") throw fail(403, "需要管理员权限");
  next();
});
locations.get("/admin/locations", async (_req, res) =>
  res.json({
    buildings: (
      await pool.query("SELECT * FROM buildings ORDER BY sort_order,name,id")
    ).rows,
    floors: (
      await pool.query("SELECT * FROM floors ORDER BY sort_order,name,id")
    ).rows,
  }),
);
locations.post("/buildings", async (req, res) => {
  const b = z.object({ name, sortOrder: position }).parse(req.body),
    id = randomUUID();
  await transaction(async (c) => {
    await c.query("INSERT INTO buildings VALUES($1,$2,$3)", [
      id,
      b.name,
      b.sortOrder,
    ]);
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'building.created',$2)",
      [req.user.id, id],
    );
  });
  res.status(201).json({ id });
});
locations.put("/buildings/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    b = z.object({ name, sortOrder: position }).parse(req.body);
  await transaction(async (c) => {
    const r = await c.query(
      "UPDATE buildings SET name=$1,sort_order=$2 WHERE id=$3",
      [b.name, b.sortOrder, id],
    );
    if (!r.rowCount) throw fail(404, "楼栋不存在");
    await c.query(
      "UPDATE rooms r SET data=data || jsonb_build_object('building',$1::text) FROM floors f WHERE r.floor_id=f.id AND f.building_id=$2",
      [b.name, id],
    );
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'building.updated',$2)",
      [req.user.id, id],
    );
  });
  res.json({ ok: true });
});
locations.post("/floors", async (req, res) => {
  const b = z
      .object({ name, buildingId: z.uuid(), sortOrder: position })
      .parse(req.body),
    id = randomUUID();
  await transaction(async (c) => {
    await c.query("INSERT INTO floors VALUES($1,$2,$3,$4)", [
      id,
      b.buildingId,
      b.name,
      b.sortOrder,
    ]);
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'floor.created',$2)",
      [req.user.id, id],
    );
  });
  res.status(201).json({ id });
});
locations.put("/floors/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id),
    b = z
      .object({ name, buildingId: z.uuid(), sortOrder: position })
      .parse(req.body);
  await transaction(async (c) => {
    const r = await c.query(
      "UPDATE floors SET building_id=$1,name=$2,sort_order=$3 WHERE id=$4",
      [b.buildingId, b.name, b.sortOrder, id],
    );
    if (!r.rowCount) throw fail(404, "楼层不存在");
    await c.query(
      "UPDATE rooms SET data=data || jsonb_build_object('floor',$1::text,'building',(SELECT name FROM buildings WHERE id=$2)) WHERE floor_id=$3",
      [b.name, b.buildingId, id],
    );
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'floor.updated',$2)",
      [req.user.id, id],
    );
  });
  res.json({ ok: true });
});
locations.delete("/buildings/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (c) => {
    if (
      (await c.query("SELECT 1 FROM floors WHERE building_id=$1", [id]))
        .rowCount
    )
      throw fail(409, "请先移走或删除所属楼层");
    const r = await c.query("DELETE FROM buildings WHERE id=$1", [id]);
    if (!r.rowCount) throw fail(404, "楼栋不存在");
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'building.deleted',$2)",
      [req.user.id, id],
    );
  });
  res.json({ ok: true });
});
locations.delete("/floors/:id", async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await transaction(async (c) => {
    if ((await c.query("SELECT 1 FROM rooms WHERE floor_id=$1", [id])).rowCount)
      throw fail(409, "请先移动所属会议室");
    const r = await c.query("DELETE FROM floors WHERE id=$1", [id]);
    if (!r.rowCount) throw fail(404, "楼层不存在");
    await c.query(
      "INSERT INTO audit(actor,action,target) VALUES($1,'floor.deleted',$2)",
      [req.user.id, id],
    );
  });
  res.json({ ok: true });
});
export async function resolveLocation(
  c: import("pg").PoolClient,
  b: { floorId?: string; building?: string; floor?: string },
) {
  if (b.floorId) {
    const r = (
      await c.query(
        "SELECT f.id,f.name AS floor,b.name AS building FROM floors f JOIN buildings b ON f.building_id=b.id WHERE f.id=$1 FOR SHARE OF f,b",
        [b.floorId],
      )
    ).rows[0];
    if (!r) throw fail(400, "请选择有效楼层");
    return r;
  }
  if (!b.building || !b.floor) throw fail(400, "请选择会议室所属楼层");
  const building = (
    await c.query(
      "INSERT INTO buildings(id,name) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
      [randomUUID(), b.building],
    )
  ).rows[0];
  const floor = (
    await c.query(
      "INSERT INTO floors(id,building_id,name) VALUES($1,$2,$3) ON CONFLICT(building_id,name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
      [randomUUID(), building.id, b.floor],
    )
  ).rows[0];
  return { id: floor.id, building: b.building, floor: b.floor };
}
