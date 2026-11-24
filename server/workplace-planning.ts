import { Router } from "express";
import { z } from "zod";
import type { PoolClient } from "pg";
import { pool, transaction } from "./db.ts";
import { canView } from "./access.ts";
import { sceneSchema, type SpatialObject } from "./workplace-schema.ts";
const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const imageSchema=z.string().max(100000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).nullable();
const draftSchema=z.object({baseRevision:z.number().int().nonnegative(),draftRevision:z.number().int().nonnegative(),objects:sceneSchema.shape.objects,referenceImage:imageSchema}).strict();
type Draft= z.infer<typeof draftSchema>;
async function lockFloor(c:PoolClient,id:string){
 await c.query("SELECT pg_advisory_xact_lock(847299)");
 if(!(await c.query("SELECT id FROM floors WHERE id=$1 FOR UPDATE",[id])).rowCount)throw fail(404,"楼层不存在");
}
async function validate(c:PoolClient,id:string,objects:SpatialObject[],published:boolean){
 sceneSchema.parse({revision:0,objects});
 const roomIds=objects.flatMap(o=>o.roomId?[o.roomId]:[]);
 if(roomIds.length!==(await c.query("SELECT id FROM rooms WHERE floor_id=$1 AND id=ANY($2::text[]) FOR SHARE",[id,roomIds])).rowCount)throw fail(400,"会议室不属于当前楼层");
 const userIds=objects.flatMap(o=>o.userId?[o.userId]:[]);
 if(userIds.length!==(await c.query("SELECT id FROM users WHERE active AND id=ANY($1::uuid[]) FOR SHARE",[userIds])).rowCount)throw fail(400,"员工不存在或已停用");
 const deptIds=[...new Set(objects.flatMap(o=>o.departmentId?[o.departmentId]:[]))];
 if(deptIds.length!==(await c.query("SELECT id FROM departments WHERE id=ANY($1::uuid[])",[deptIds])).rowCount)throw fail(400,"部门不存在");
 if(published&&(await c.query("SELECT 1 FROM floor_scenes s CROSS JOIN LATERAL jsonb_array_elements(s.objects) o WHERE s.floor_id<>$1 AND o->>'userId'=ANY($2::text[]) LIMIT 1",[id,userIds])).rowCount)throw fail(409,"员工已在其他楼层分配工位，请先释放原工位或使用调动");
}
async function snapshot(c:PoolClient,id:string,revision:number,objects:SpatialObject[],image:string|null,actor:string){
 const value=JSON.stringify(objects);
 await c.query("INSERT INTO floor_scenes(floor_id,revision,objects,reference_image) VALUES($1,$2,$3,$4) ON CONFLICT(floor_id) DO UPDATE SET revision=EXCLUDED.revision,objects=EXCLUDED.objects,reference_image=EXCLUDED.reference_image",[id,revision,value,image]);
 await c.query("INSERT INTO floor_scene_versions(floor_id,revision,objects,actor,reference_image) VALUES($1,$2,$3,$4,$5)",[id,revision,value,actor,image]);
}
export const planning=Router();
planning.get("/search",async(req,res)=>{
 const q=z.string().trim().min(1).max(100).parse(req.query.q).toLowerCase();
 const result=(await pool.query(`SELECT f.id AS floor_id,f.name AS floor_name,b.id AS building_id,b.name AS building_name,b.campus_id,o->>'id' AS object_id,o->>'kind' AS kind,o->>'name' AS name,u.name AS person,r.data AS room,d.name AS department
 FROM floor_scenes s JOIN floors f ON f.id=s.floor_id JOIN buildings b ON b.id=f.building_id
 CROSS JOIN LATERAL jsonb_array_elements(s.objects) o
 LEFT JOIN rooms r ON r.id=o->>'roomId' AND r.floor_id=f.id
 LEFT JOIN users u ON u.id::text=o->>'userId' AND u.active
 LEFT JOIN departments d ON d.id::text=o->>'departmentId'
 WHERE (o->>'roomId' IS NULL OR r.id IS NOT NULL) AND (strpos(lower(o->>'name'),$1)>0 OR strpos(lower(coalesce(u.name,'')),$1)>0 OR strpos(lower(coalesce(r.data->>'name','')),$1)>0 OR strpos(lower(coalesce(d.name,'')),$1)>0)
 ORDER BY b.name,f.sort_order,o->>'name'`,[q])).rows;
 res.json(result.filter(r=>!r.room||canView(r.room,req.user)).slice(0,50).map(({room,...r})=>({...r,name:room?.name||r.name})));
});
planning.get("/summary",async(req,res)=>{
 const rows=(await pool.query(`SELECT f.id AS floor_id,f.name AS floor_name,b.id AS building_id,b.name AS building_name,b.campus_id,
 count(*) FILTER(WHERE o->>'kind'='desk')::int AS desks,count(*) FILTER(WHERE o->>'kind'='desk' AND u.id IS NOT NULL)::int AS assigned
 FROM floors f JOIN buildings b ON b.id=f.building_id LEFT JOIN floor_scenes s ON s.floor_id=f.id
 LEFT JOIN LATERAL jsonb_array_elements(s.objects) o ON true LEFT JOIN users u ON u.id::text=o->>'userId' AND u.active
 GROUP BY f.id,b.id ORDER BY b.name,f.sort_order,f.name`)).rows;
 const rooms=(await pool.query("SELECT floor_id,data FROM rooms")).rows;
 res.json(rows.map(r=>({...r,rooms:rooms.filter(x=>x.floor_id===r.floor_id&&canView(x.data,req.user)).length})));
});
planning.get("/my-desk",async(req,res)=>{
 const row=(await pool.query(`SELECT f.id AS floor_id,f.name AS floor_name,b.id AS building_id,b.name AS building_name,b.campus_id,o->>'id' AS object_id,o->>'kind' AS kind,o->>'name' AS name
 FROM floor_scenes s JOIN floors f ON f.id=s.floor_id JOIN buildings b ON b.id=f.building_id
 CROSS JOIN LATERAL jsonb_array_elements(s.objects) o WHERE o->>'kind'='desk' AND o->>'userId'=$1 LIMIT 1`,[req.user.id])).rows[0];
 res.json(row||null);
});
planning.use((req,_res,next)=>{if(req.user.role!=="admin")throw fail(403,"需要管理员权限");next();});
planning.get("/floors/:id/draft",async(req,res)=>{
 const id=z.uuid().parse(req.params.id);
 const [draft,pub]=await Promise.all([pool.query("SELECT base_revision,revision,objects,reference_image FROM floor_scene_drafts WHERE floor_id=$1",[id]),pool.query("SELECT revision,objects,reference_image FROM floor_scenes WHERE floor_id=$1",[id])]);
 const d=draft.rows[0],p=pub.rows[0];const raw:SpatialObject[]=d?.objects??p?.objects??[];
 const rooms=new Set((await pool.query("SELECT id FROM rooms WHERE floor_id=$1",[id])).rows.map(r=>r.id));
 const active=new Set((await pool.query("SELECT id FROM users WHERE active")).rows.map(r=>r.id));
 const objects=raw.map(o=>({...o,roomId:o.roomId&&rooms.has(o.roomId)?o.roomId:undefined,userId:o.userId&&active.has(o.userId)?o.userId:undefined}));
 res.json({baseRevision:d?.base_revision??p?.revision??0,draftRevision:d?.revision??0,objects,referenceImage:d?d.reference_image:p?.reference_image??null,publishedRevision:p?.revision??0});
});
planning.put("/floors/:id/draft",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b:Draft=draftSchema.parse(req.body);
 const revision=await transaction(async c=>{
 await lockFloor(c,id);
 const pub=(await c.query("SELECT revision FROM floor_scenes WHERE floor_id=$1",[id])).rows[0]?.revision??0;
 const d=(await c.query("SELECT revision,base_revision FROM floor_scene_drafts WHERE floor_id=$1",[id])).rows[0];
 if(pub!==b.baseRevision||(d?.revision??0)!==b.draftRevision)throw fail(409,"布局或草稿已被其他操作修改，请重新加载");
 await validate(c,id,b.objects,false);const next=b.draftRevision+1;
 await c.query("INSERT INTO floor_scene_drafts(floor_id,base_revision,revision,objects,reference_image,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(floor_id) DO UPDATE SET base_revision=EXCLUDED.base_revision,revision=EXCLUDED.revision,objects=EXCLUDED.objects,reference_image=EXCLUDED.reference_image,updated_by=EXCLUDED.updated_by,updated_at=now()",[id,pub,next,JSON.stringify(b.objects),b.referenceImage,req.user.id]);
 return next;
 });res.json({draftRevision:revision});
});
planning.post("/floors/:id/publish",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b=z.object({draftRevision:z.number().int().positive()}).parse(req.body);
 const revision=await transaction(async c=>{
 await lockFloor(c,id);const d=(await c.query("SELECT * FROM floor_scene_drafts WHERE floor_id=$1",[id])).rows[0];
 const pub=(await c.query("SELECT revision FROM floor_scenes WHERE floor_id=$1",[id])).rows[0]?.revision??0;
 if(!d||d.revision!==b.draftRevision||d.base_revision!==pub)throw fail(409,"草稿已更新或正式布局发生变化，请重新加载");
 await validate(c,id,d.objects,true);await snapshot(c,id,pub+1,d.objects,d.reference_image,req.user.id);
 await c.query("DELETE FROM floor_scene_drafts WHERE floor_id=$1",[id]);
 await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'floor.scene.published',$2)",[req.user.id,id]);return pub+1;
 });res.json({revision});
});
planning.delete("/floors/:id/draft",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),b=z.object({draftRevision:z.number().int().positive()}).parse(req.body);
 await transaction(async c=>{await lockFloor(c,id);if(!(await c.query("DELETE FROM floor_scene_drafts WHERE floor_id=$1 AND revision=$2",[id,b.draftRevision])).rowCount)throw fail(409,"草稿已变化");});res.json({ok:true});
});
planning.get("/floors/:id/versions",async(req,res)=>{
 const id=z.uuid().parse(req.params.id);res.json((await pool.query("SELECT v.revision,v.created_at,u.name AS actor FROM floor_scene_versions v LEFT JOIN users u ON u.id=v.actor WHERE floor_id=$1 ORDER BY revision DESC LIMIT 50",[id])).rows);
});
planning.get("/floors/:id/versions/:revision",async(req,res)=>{
 const id=z.uuid().parse(req.params.id),rev=z.coerce.number().int().positive().parse(req.params.revision);
 const row=(await pool.query("SELECT objects,reference_image FROM floor_scene_versions WHERE floor_id=$1 AND revision=$2",[id,rev])).rows[0];if(!row)throw fail(404,"版本不存在");res.json({objects:row.objects,referenceImage:row.reference_image});
});

planning.get("/assignments",async(_req,res)=>{
 const rows=(await pool.query(`SELECT o->>'userId' AS user_id,o->>'id' AS desk_id,o->>'name' AS desk_name,f.id AS floor_id,f.name AS floor_name,b.name AS building_name
 FROM floor_scenes s JOIN floors f ON f.id=s.floor_id JOIN buildings b ON b.id=f.building_id
 CROSS JOIN LATERAL jsonb_array_elements(s.objects) o JOIN users u ON u.id::text=o->>'userId' AND u.active WHERE o->>'kind'='desk' ORDER BY b.name,f.sort_order,o->>'name'`)).rows;
 res.json(rows);
});
planning.post("/transfers",async(req,res)=>{
 const b=z.object({floorId:z.uuid(),revision:z.number().int().positive(),moves:z.array(z.object({deskId:z.uuid(),userId:z.uuid().nullable()})).min(1).max(200)}).strict().parse(req.body);
 if(new Set(b.moves.map(m=>m.deskId)).size!==b.moves.length)throw fail(400,"目标工位重复");
 const users=b.moves.flatMap(m=>m.userId?[m.userId]:[]);
 if(new Set(users).size!==users.length)throw fail(400,"人员重复");
 const result=await transaction(async c=>{
 await lockFloor(c,b.floorId);
 const rows=(await c.query("SELECT floor_id,revision,objects,reference_image FROM floor_scenes WHERE floor_id=$1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(objects) o WHERE o->>'userId'=ANY($2::text[])) ORDER BY floor_id FOR UPDATE",[b.floorId,users])).rows as {floor_id:string;revision:number;objects:SpatialObject[];reference_image:string|null}[];
 const dest=rows.find(r=>r.floor_id===b.floorId);if(!dest||dest.revision!==b.revision)throw fail(409,"目标楼层已更新，请刷新");
 if((await c.query("SELECT 1 FROM floor_scene_drafts WHERE floor_id=ANY($1::uuid[]) LIMIT 1",[rows.map(r=>r.floor_id)])).rowCount)throw fail(409,"涉及楼层存在未发布草稿，请先发布或删除草稿");
 if(users.length!==(await c.query("SELECT id FROM users WHERE active AND id=ANY($1::uuid[]) FOR SHARE",[users])).rowCount)throw fail(400,"员工不存在或已停用");
 const active=new Set((await c.query("SELECT id FROM users WHERE active")).rows.map(r=>r.id));
 const targets=new Map(b.moves.map(m=>[m.deskId,m.userId]));
 for(const m of b.moves){const desk=dest.objects.find(o=>o.id===m.deskId&&o.kind==="desk");if(!desk)throw fail(400,"目标工位不存在");if(m.userId&&desk.userId&&active.has(desk.userId)&&desk.userId!==m.userId&&!users.includes(desk.userId))throw fail(409,"目标工位已分配，请先释放");}
 let changes=0;
 for(const row of rows){
 const next=row.objects.map(o=>{
 if(row.floor_id===b.floorId&&targets.has(o.id))return {...o,userId:targets.get(o.id)||undefined};
 if(o.userId&&users.includes(o.userId))return {...o,userId:undefined};
 return o;
 });
 if(JSON.stringify(next)===JSON.stringify(row.objects))continue;
 sceneSchema.parse({revision:row.revision,objects:next});
 await snapshot(c,row.floor_id,row.revision+1,next,row.reference_image,req.user.id);
 await c.query("INSERT INTO audit(actor,action,target) VALUES($1,'floor.desk.transferred',$2)",[req.user.id,row.floor_id]);changes++;
 }
 return {floors:changes};
 });res.json(result);
});
