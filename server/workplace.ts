import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "./db.ts";
import { canView } from "./access.ts";
import { sceneSchema, type SpatialObject } from "./workplace-schema.ts";
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const name=z.string().trim().min(1).max(80);
export const workplace=Router();
workplace.get("/catalog",async (_req,res)=>{
 const [campuses,buildings,floors]=await Promise.all([pool.query("SELECT * FROM campuses ORDER BY name"),pool.query("SELECT * FROM buildings ORDER BY sort_order,name"),pool.query("SELECT * FROM floors ORDER BY sort_order,name")]);
 res.json({campuses:campuses.rows,buildings:buildings.rows,floors:floors.rows});
});
workplace.get("/floors/:id",async(req,res)=>{
 const id=z.uuid().parse(req.params.id);
 const floor=(await pool.query("SELECT id FROM floors WHERE id=$1",[id])).rows[0];
 if(!floor)throw fail(404,"楼层不存在");
 const row=(await pool.query("SELECT revision,objects FROM floor_scenes WHERE floor_id=$1",[id])).rows[0]||{revision:0,objects:[]};
 const rooms=(await pool.query("SELECT id,data FROM rooms WHERE floor_id=$1",[id])).rows;
 const visible=new Set(rooms.filter(r=>canView(r.data,req.user)).map(r=>r.id));
 const objects:SpatialObject[]=row.objects.filter((o:SpatialObject)=>!o.roomId||visible.has(o.roomId));
 const ids=objects.flatMap(o=>o.userId?[o.userId]:[]);
 const people=(await pool.query("SELECT id,name FROM users WHERE active AND id=ANY($1::uuid[])",[ids])).rows;
 res.json({floorId:id,revision:row.revision,objects,people});
});
workplace.use((req,_res,next)=>{if(req.user.role!=="admin")throw fail(403,"需要管理员权限");next();});
workplace.post("/campuses",async(req,res)=>{
 const id=randomUUID(),b=z.object({name}).parse(req.body);
 await transaction(async c=>{await c.query("INSERT INTO campuses VALUES($1,$2)",[id,b.name]);await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'campus.created',$2)",[req.user.id,id]);});
 res.status(201).json({id});
});
workplace.put("/campuses/:id",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b=z.object({name}).parse(req.body);
 await transaction(async c=>{if(!(await c.query("UPDATE campuses SET name=$1 WHERE id=$2",[b.name,id])).rowCount)throw fail(404,"园区不存在");await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'campus.updated',$2)",[req.user.id,id]);});
 res.json({ok:true});
});
workplace.put("/buildings/:id",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b=z.object({campusId:z.uuid(),x:z.number().min(0).max(85),y:z.number().min(0).max(55)}).parse(req.body);
 await transaction(async c=>{
 if(!(await c.query("SELECT 1 FROM campuses WHERE id=$1",[b.campusId])).rowCount)throw fail(400,"园区不存在");
 if(!(await c.query("UPDATE buildings SET campus_id=$1,map_x=$2,map_y=$3 WHERE id=$4",[b.campusId,b.x,b.y,id])).rowCount)throw fail(404,"楼栋不存在");
 await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'building.placement',$2)",[req.user.id,id]);});
 res.json({ok:true});
});
workplace.put("/floors/:id",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b=sceneSchema.parse(req.body);
 const revision=await transaction(async c=>{
 await c.query("SELECT pg_advisory_xact_lock(847299)");
 if(!(await c.query("SELECT 1 FROM floors WHERE id=$1 FOR UPDATE",[id])).rowCount)throw fail(404,"楼层不存在");
 const current=(await c.query("SELECT revision FROM floor_scenes WHERE floor_id=$1",[id])).rows[0]?.revision||0;
 if(current!==b.revision)throw fail(409,"布局已被修改，请重新加载");
 const roomIds=b.objects.flatMap(o=>o.roomId?[o.roomId]:[]);
 if(roomIds.length!==(await c.query("SELECT id FROM rooms WHERE floor_id=$1 AND id=ANY($2::text[]) FOR SHARE",[id,roomIds])).rowCount)throw fail(400,"会议室不属于当前楼层");
 const userIds=b.objects.flatMap(o=>o.userId?[o.userId]:[]);
 if(userIds.length!==(await c.query("SELECT id FROM users WHERE active AND id=ANY($1::uuid[]) FOR SHARE",[userIds])).rowCount)throw fail(400,"员工不存在或已停用");
 if((await c.query("SELECT 1 FROM floor_scenes s CROSS JOIN LATERAL jsonb_array_elements(s.objects) o WHERE s.floor_id<>$1 AND o->>'userId'=ANY($2::text[]) LIMIT 1",[id,userIds])).rowCount)throw fail(409,"员工已在其他楼层分配工位");
 const next=current+1,objects=JSON.stringify(b.objects);
 await c.query("INSERT INTO floor_scenes(floor_id,revision,objects) VALUES($1,$2,$3) ON CONFLICT(floor_id) DO UPDATE SET revision=EXCLUDED.revision,objects=EXCLUDED.objects",[id,next,objects]);
 await c.query("INSERT INTO floor_scene_versions VALUES($1,$2,$3,$4,now())",[id,next,objects,req.user.id]);
 await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'floor.scene.saved',$2)",[req.user.id,id]);
 return next;
 });
 res.json({revision});
});
