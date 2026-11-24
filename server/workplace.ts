import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "./db.ts";
import { planning } from "./workplace-planning.ts";
import { canView, canBook } from "./access.ts";
import { sceneSchema, type SpatialObject } from "./workplace-schema.ts";
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const name=z.string().trim().min(1).max(80);
export const workplace=Router();
workplace.use("/planning",planning);
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
 let objects:SpatialObject[]=row.objects.flatMap((o:SpatialObject)=>!o.roomId||visible.has(o.roomId)?[o]:req.user.role==="admin"?[{...o,roomId:undefined}]:[]);
 const ids=objects.flatMap(o=>o.userId?[o.userId]:[]);
 const people=(await pool.query("SELECT u.id,u.name,u.department_id FROM users u WHERE u.active AND u.id=ANY($1::uuid[])",[ids])).rows;
 const active=new Set(people.map(p=>p.id));objects=objects.map(o=>o.userId&&!active.has(o.userId)?{...o,userId:undefined}:o);
 const deptIds=[...new Set([...objects.flatMap(o=>o.departmentId?[o.departmentId]:[]),...people.flatMap(p=>p.department_id?[p.department_id]:[])])];
 const departments=(await pool.query("SELECT id,name FROM departments WHERE id=ANY($1::uuid[])",[deptIds])).rows;
 res.json({floorId:id,revision:row.revision,objects,people,departments});
});
workplace.get("/floors/:id/availability",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),q=z.object({date:z.iso.date(),start:z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),end:z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)}).parse(req.query);
 if(q.start>=q.end)throw fail(400,"开始时间必须早于结束时间");
 const rows=(await pool.query(`SELECT r.id,r.data,EXISTS(SELECT 1 FROM bookings b WHERE b.room_id=r.id AND (b.status='confirmed' OR (b.status='pending' AND b.expires_at>now() AND b.start_at>now())) AND b.start_at < (($2::date+$4::time) AT TIME ZONE 'Asia/Shanghai') AND b.end_at > (($2::date+$3::time) AT TIME ZONE 'Asia/Shanghai')) AS occupied, (($2::date+$3::time) AT TIME ZONE 'Asia/Shanghai')>now() AS future FROM rooms r WHERE r.floor_id=$1`,[id,q.date,q.start,q.end])).rows;
 res.json({rooms:Object.fromEntries(rows.filter(r=>canView(r.data,req.user)).map(r=>[r.id,canBook(r.data,req.user)&&r.future&&!r.occupied]))});
});
workplace.use((req,_res,next)=>{if(req.user.role!=="admin")throw fail(403,"需要管理员权限");next();});
workplace.post("/campuses",async(req,res)=>{
 const id=randomUUID(),b=z.object({name}).parse(req.body);
 await transaction(async c=>{await c.query("INSERT INTO campuses(id,name) VALUES($1,$2)",[id,b.name]);await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'campus.created',$2)",[req.user.id,id]);});
 res.status(201).json({id});
});
workplace.put("/campuses/:id",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b=z.object({name}).parse(req.body);
 await transaction(async c=>{if(!(await c.query("UPDATE campuses SET name=$1 WHERE id=$2",[b.name,id])).rowCount)throw fail(404,"园区不存在");await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'campus.updated',$2)",[req.user.id,id]);});
 res.json({ok:true});
});
const campusObject=z.object({id:z.uuid(),kind:z.enum(["road","garden","parking","plaza"]),name:name,x:z.number().min(0).max(100),y:z.number().min(0).max(70),w:z.number().min(.5).max(100),h:z.number().min(.5).max(70),rotation:z.number().min(-360).max(360)}).strict().refine(o=>o.x+o.w<=100&&o.y+o.h<=70,"对象超出园区");
workplace.put("/campuses/:id/map",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b=z.object({revision:z.number().int().nonnegative(),objects:z.array(campusObject).max(100),buildings:z.array(z.object({id:z.uuid(),x:z.number().min(0).max(100),y:z.number().min(0).max(70),w:z.number().min(3).max(100),h:z.number().min(3).max(70),rotation:z.number().min(-360).max(360)}).refine(o=>o.x+o.w<=100&&o.y+o.h<=70)).max(200)}).strict().parse(req.body);
 if(new Set(b.objects.map(o=>o.id)).size!==b.objects.length||new Set(b.buildings.map(o=>o.id)).size!==b.buildings.length)throw fail(400,"对象重复");
 const revision=await transaction(async c=>{
 const campus=(await c.query("SELECT map_revision FROM campuses WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!campus)throw fail(404,"园区不存在");if(campus.map_revision!==b.revision)throw fail(409,"园区布局已被修改");
 const rows=(await c.query("SELECT id FROM buildings WHERE campus_id=$1 FOR UPDATE",[id])).rows;if(rows.length!==b.buildings.length||b.buildings.some(x=>!rows.some(r=>r.id===x.id)))throw fail(409,"楼栋归属已变化，请刷新");
 for(const o of b.buildings)await c.query("UPDATE buildings SET map_x=$1,map_y=$2,map_width=$3,map_depth=$4,map_rotation=$5 WHERE id=$6",[o.x,o.y,o.w,o.h,o.rotation,o.id]);
 await c.query("UPDATE campuses SET map_objects=$1,map_revision=map_revision+1 WHERE id=$2",[JSON.stringify(b.objects),id]);
 await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'campus.map.updated',$2)",[req.user.id,id]);return b.revision+1;
 });res.json({revision});
});
workplace.put("/buildings/:id",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b=z.object({campusId:z.uuid(),x:z.number().min(0).max(85),y:z.number().min(0).max(55)}).parse(req.body);
 await transaction(async c=>{
 if(!(await c.query("SELECT 1 FROM campuses WHERE id=$1",[b.campusId])).rowCount)throw fail(400,"园区不存在");
 const prev=(await c.query("SELECT campus_id FROM buildings WHERE id=$1",[id])).rows[0];if(!prev)throw fail(404,"楼栋不存在");
 await c.query("SELECT id FROM campuses WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[[prev.campus_id,b.campusId]]);
 if(!(await c.query("UPDATE buildings SET campus_id=$1,map_x=$2,map_y=$3 WHERE id=$4",[b.campusId,b.x,b.y,id])).rowCount)throw fail(404,"楼栋不存在");
 await c.query("UPDATE campuses SET map_revision=map_revision+1 WHERE id=ANY($1::uuid[])",[[prev.campus_id,b.campusId]]);
 await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'building.placement',$2)",[req.user.id,id]);});
 res.json({ok:true});
});
workplace.put("/floors/:id",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b=sceneSchema.parse(req.body);
 const revision=await transaction(async c=>{
 await c.query("SELECT pg_advisory_xact_lock(847299)");
 if(!(await c.query("SELECT 1 FROM floors WHERE id=$1 FOR UPDATE",[id])).rowCount)throw fail(404,"楼层不存在");
 if((await c.query("SELECT 1 FROM floor_scene_drafts WHERE floor_id=$1",[id])).rowCount)throw fail(409,"请通过草稿发布布局");
 const current=(await c.query("SELECT revision FROM floor_scenes WHERE floor_id=$1",[id])).rows[0]?.revision||0;
 if(current!==b.revision)throw fail(409,"布局已被修改，请重新加载");
 const roomIds=b.objects.flatMap(o=>o.roomId?[o.roomId]:[]);
 if(roomIds.length!==(await c.query("SELECT id FROM rooms WHERE floor_id=$1 AND id=ANY($2::text[]) FOR SHARE",[id,roomIds])).rowCount)throw fail(400,"会议室不属于当前楼层");
 const userIds=b.objects.flatMap(o=>o.userId?[o.userId]:[]);
 if(userIds.length!==(await c.query("SELECT id FROM users WHERE active AND id=ANY($1::uuid[]) FOR SHARE",[userIds])).rowCount)throw fail(400,"员工不存在或已停用");
 if((await c.query("SELECT 1 FROM floor_scenes s CROSS JOIN LATERAL jsonb_array_elements(s.objects) o WHERE s.floor_id<>$1 AND o->>'userId'=ANY($2::text[]) LIMIT 1",[id,userIds])).rowCount)throw fail(409,"员工已在其他楼层分配工位");
 const next=current+1,objects=JSON.stringify(b.objects);
 await c.query("INSERT INTO floor_scenes(floor_id,revision,objects) VALUES($1,$2,$3) ON CONFLICT(floor_id) DO UPDATE SET revision=EXCLUDED.revision,objects=EXCLUDED.objects",[id,next,objects]);
 await c.query("INSERT INTO floor_scene_versions(floor_id,revision,objects,actor,created_at) VALUES($1,$2,$3,$4,now())",[id,next,objects,req.user.id]);
 await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'floor.scene.saved',$2)",[req.user.id,id]);
 return next;
 });
 res.json({revision});
});
