import {createHash,randomBytes} from "node:crypto";
import type {PoolClient} from "pg";
import {sceneSchema,type SpatialObject} from "./workplace-schema.ts";
import {resolveTemplate} from "./template-choice.ts";
const profile="workplace-initial-v1";
const defaultCampus="00000000-0000-4000-8000-000000000001";
export const stableId=(key:string)=>{
 const b=createHash("sha256").update(profile+"/"+key).digest().subarray(0,16);
 b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;
 const h=b.toString("hex");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20);
};
const departmentNames=["综合管理部","战略发展部","财务管理部","风险合规部","人力资源部","信息科技部","产品研发部","数据运营部","客户服务部","品牌与培训部"];
const surnames=["陈","林","王","李","张","刘","周","赵","徐","杨","孙","黄","吴","郑","何","胡","高","许","梁","谢","宋","唐","罗","韩","顾","沈","陆","叶"];
const given=["子墨","亦宁","清禾","思远","嘉言","知行","予安","景明","若溪","云舟","明轩","书瑶","舒然","安琪","文博","晓晨","静怡","雨桐","佳悦","泽宇","一诺","宁远","星河","语桐","心怡","嘉宁","可欣","亦凡","明哲","思齐","沐阳","婉清"];
const campuses=[
 {key:"hq",name:"总部办公园区",buildings:[
 {key:"A",name:"综合办公 A 座",x:8,y:10,w:26,h:24,floors:[{n:1,kind:"lobby",depts:[0,4]},{n:3,kind:"office",depts:[0,4,2,1]},{n:5,kind:"office",depts:[2,3,1,0]},{n:8,kind:"office",depts:[1,3,2,0]},{n:12,kind:"executive",depts:[1,0,3,2]}]},
 {key:"B",name:"科技中心 B 座",x:44,y:8,w:23,h:28,floors:[{n:1,kind:"lobby",depts:[5,6]},{n:3,kind:"research",depts:[5,6,5,7]},{n:6,kind:"research",depts:[6,5,7,6]},{n:9,kind:"office",depts:[5,7,6,5]}]},
 {key:"C",name:"运营中心 C 座",x:72,y:39,w:22,h:23,floors:[{n:1,kind:"lobby",depts:[8,7]},{n:2,kind:"office",depts:[8,7,8,7]},{n:5,kind:"office",depts:[7,8,7,4]}]},
 ]},
 {key:"innovation",name:"创新协作园区",buildings:[
 {key:"D",name:"创新中心 D 座",x:10,y:10,w:30,h:26,floors:[{n:1,kind:"lobby",depts:[6,9]},{n:2,kind:"research",depts:[6,5,7,6]},{n:4,kind:"office",depts:[6,7,9,5]}]},
 {key:"E",name:"培训中心 E 座",x:58,y:12,w:30,h:22,floors:[{n:1,kind:"training",depts:[9,4]},{n:3,kind:"training",depts:[9,0]}]},
 ]},
] as const;
type FloorPlan=typeof campuses[number]["buildings"][number]["floors"][number];
type SeedRoom={id:string;name:string;code:string;building:string;floor:string;capacity:number;type:string;equip:string[];area:number;desc:string;rule:"instant"|"approval"|"admin";repeat:boolean;status:"enabled"|"maintenance";color:string};
type Staff={id:string;name:string;dept:string;username:string};
type GeneratedFloor={objects:SpatialObject[];rooms:SeedRoom[];staff:Staff[]};
const roomNames=["云栖","松风","知远","澄明","青禾","映月","启明","望岳","星澜","栖霞","观澜","听竹","望舒","明德","致远","海棠","云帆","拾光","远山","新知"];
const kinds=["洽谈式","董事会式","U 型","教室式"];
function outdoor(key:string){
 const shapes=key==="hq"?[
 ["road","园区主路",3,36,94,5],["road","东侧通道",68,3,4,63],["plaza","中心广场",32,44,30,15],["garden","中央花园",6,46,23,17],["parking","访客停车区",75,5,21,25],["garden","休闲绿地",36,3,6,29]
 ]:[
 ["road","园区主路",3,39,94,5],["road","连接通道",47,5,5,34],["plaza","交流广场",36,47,24,16],["garden","林荫花园",7,48,23,15],["parking","停车区",66,49,27,14],["garden","庭院绿地",43,10,4,25]
 ];
 return shapes.map(([kind,name,x,y,w,h],i)=>({id:stableId(key+"/outdoor/"+i),kind,name,x,y,w,h,rotation:0}));
}
function generateFloor(building:{key:string;name:string},floor:FloorPlan,deptIds:string[],staffIndex:{value:number},member?:Staff):GeneratedFloor{
 const key=building.key+"/"+floor.n,objects:SpatialObject[]=[],rooms:SeedRoom[]=[],staff:Staff[]=[];
 const add=(kind:SpatialObject["kind"],name:string,x:number,y:number,w:number,h:number,options:Partial<SpatialObject>={})=>{
  const o:SpatialObject={id:stableId(key+"/object/"+objects.length),kind,name,x,y,w,h,rotation:0,...options};objects.push(o);return o;
 };
 const office=floor.kind==="office"||floor.kind==="research"||floor.kind==="executive";
 const zones=[[3,3,31,28],[38,3,31,28],[3,39,31,28],[38,39,31,28]];
 add("zone","主通道",3,32,94,6);add("zone","纵向通道",70,3,3,64);
 add("wall","北侧边界",2,2,96,.6);add("wall","南侧边界",2,67.4,96,.6);
 add("wall","西侧边界",2,3,.6,64);add("wall","东侧边界",97.4,3,.6,64);
 let deskNumber=0;
 for(let z=0;z<4;z++){
  const [x,y,w,h]=zones[z],departmentId=deptIds[floor.depts[z%floor.depts.length]];
  if(!office&&z>=2){
   const name=floor.kind==="training"?(z===2?"交流学习区":"培训休息区"):(z===2?"访客接待区":"共享休闲区");
   add("zone",name,x,y,w,h);for(let i=0;i<3;i++)add("facility",z===2?"交流桌":"休息座",x+3+i*9,y+8,7,5);
   add("plant","绿植",x+2,y+22,2,2);add("plant","绿植",x+25,y+22,2,2);continue;
  }
  const deptName=departmentNames[floor.depts[z%floor.depts.length]];
  add("zone",deptName+" · "+["北区","东北区","南区","东南区"][z],x,y,w,h,{departmentId});
  const cols=floor.kind==="executive"?4:5,rows=!office?2:floor.kind==="research"?4:3;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
   const n=++deskNumber,id=stableId(key+"/desk/"+n),occupied=(n+floor.n+z)%5!==0;
   let userId:string|undefined;
   if(member&&building.key==="A"&&floor.n===3&&n===1){userId=member.id;}
   else if(occupied){
    const i=staffIndex.value++,dept=departmentId;
    const name=surnames[i%surnames.length]+given[Math.floor(i/surnames.length)%given.length];
    const p={id:stableId("staff/"+i),name,dept,username:"sf-staff-"+String(i+1).padStart(4,"0")};
    staff.push(p);userId=p.id;
   }
   add("desk",building.key+"-"+String(floor.n).padStart(2,"0")+"-"+String(n).padStart(3,"0"),x+2+c*5.5,y+3+r*5.7,4.7,3.6,{id,departmentId,userId,rotation:r%2?180:0});
  }
  add("plant","绿植",x+2,y+24,1.6,1.6);add("facility","储物 / 打印",x+21,y+24,7,2.4);
  if(z<2){add("wall","区域隔断",x,y+28,12,.45);add("wall","区域隔断",x+17,y+28,14,.45);}
 }
 const positions=[[74,3,23,13],[74,18,23,13],[74,39,23,13],[74,54,23,13]];
 const count=floor.kind==="training"?4:floor.kind==="executive"?3:floor.kind==="lobby"?2:3;
 for(let j=0;j<4;j++){
  const [x,y,w,h]=positions[j];
  if(j>=count){add("facility",floor.kind==="lobby"?"前台 / 服务台":"茶水间",x,y,w,h);continue;}
  const id="sf-room-"+building.key.toLowerCase()+"-"+floor.n+"-"+(j+1),code="SF-"+building.key+"-"+String(floor.n).padStart(2,"0")+String(j+1).padStart(2,"0");
  const typeIndex=floor.kind==="training"?3:(floor.n+j)%kinds.length,type=kinds[typeIndex],capacity=typeIndex===3?24:typeIndex===2?10:typeIndex===1?12:6;
  const name=roomNames[(floor.n*3+j+building.key.charCodeAt(0))%roomNames.length]+" · "+building.key+floor.n+"-"+(j+1);
  const room:SeedRoom={id,code,name,building:building.name,floor:floor.n+"F",type,capacity,equip:typeIndex===3?["投屏","视频会议","白板","音响"]:typeIndex===0?["投屏","白板"]:["投屏","视频会议","白板"],area:capacity*3+12,desc:typeIndex===3?"适合专题培训、分享交流与集中研讨。":"适合团队协作、项目评审和日常沟通。",rule:j===2?"approval":"instant",repeat:j!==0,status:building.key==="C"&&floor.n===5&&j===2?"maintenance":"enabled",color:["#b4c5bb","#c7d2df","#d6c6e2","#d9c7ad"][j]};
  rooms.push(room);add("room",name,x,y,w,h,{roomId:id});add("wall","会议室隔断",x,y+h,w,.45);add("door","会议室入口",x-1,y+4,.65,3);
 }
 add("facility","电梯 / 楼梯",35,3,2.6,16);add("facility","消防通道",35,51,2.6,16);
 sceneSchema.parse({revision:1,objects});
 return {objects,rooms,staff};
}
export async function seedWorkplace(c:PoolClient,force=false){
 await c.query("SELECT pg_advisory_xact_lock(2042813)");
 if((await c.query("SELECT 1 FROM seed_profiles WHERE key=$1",[profile])).rowCount)return {status:"exists" as const};
 if(!force){
  const r=(await c.query(`SELECT EXISTS(SELECT 1 FROM users WHERE username NOT IN ('admin','member')) OR EXISTS(SELECT 1 FROM rooms WHERE id NOT IN ('r1','r2','r3','r4','r5','r6')) OR EXISTS(SELECT 1 FROM bookings) OR EXISTS(SELECT 1 FROM floor_scenes) OR EXISTS(SELECT 1 FROM floor_scene_drafts) OR EXISTS(SELECT 1 FROM departments) OR EXISTS(SELECT 1 FROM campuses WHERE id<>$1 OR name<>'默认园区') OR EXISTS(SELECT 1 FROM buildings WHERE name NOT IN ('总部 A 座','研发 B 座')) AS occupied`,[defaultCampus])).rows[0];
  if(r.occupied)return {status:"existing-data" as const};
 }
 const deptIds:string[]=[];
 for(const name of departmentNames){
  await c.query("INSERT INTO departments(id,name) VALUES($1,$2) ON CONFLICT(name) DO NOTHING",[stableId("department/"+name),name]);
  deptIds.push((await c.query("SELECT id FROM departments WHERE name=$1",[name])).rows[0].id);
 }
 const admin=(await c.query("SELECT id FROM users WHERE username='admin' AND role='admin'")).rows[0];
 const initialMember=(await c.query("SELECT id,name,department_id FROM users WHERE username='member' AND active AND role='member'")).rows[0];
 let member:Staff|undefined;
 if(initialMember&&!force){
  const already=(await c.query("SELECT 1 FROM floor_scenes s CROSS JOIN LATERAL jsonb_array_elements(s.objects) o WHERE o->>'userId'=$1 LIMIT 1",[initialMember.id])).rowCount;
  if(!already){member={id:initialMember.id,name:initialMember.name,dept:deptIds[0],username:"member"};if(!initialMember.department_id)await c.query("UPDATE users SET department_id=$1 WHERE id=$2 AND department_id IS NULL",[deptIds[0],member.id]);}
 }
 const staffIndex={value:0},staff:Staff[]=[],rooms:SeedRoom[]=[],floorRows:{id:string;objects:SpatialObject[]}[]=[];
 const existingCampus=(await c.query("SELECT name,(SELECT count(*) FROM buildings WHERE campus_id=$1)::int AS buildings,map_revision FROM campuses WHERE id=$1 FOR UPDATE",[defaultCampus])).rows[0];
 for(const campus of campuses){
  const reuse=campus.key==="hq"&&!force&&existingCampus?.name==="默认园区"&&existingCampus.buildings===0&&existingCampus.map_revision===0;
  const id=reuse?defaultCampus:stableId("campus/"+campus.key);
  if(reuse)await c.query("UPDATE campuses SET name=$1,map_objects=$2,map_revision=1 WHERE id=$3",[campus.name,JSON.stringify(outdoor(campus.key)),id]);
  else await c.query("INSERT INTO campuses(id,name,map_objects,map_revision) VALUES($1,$2,$3,1)",[id,campus.name,JSON.stringify(outdoor(campus.key))]);
  for(const building of campus.buildings){
   const buildingId=stableId("building/"+building.key);
   await c.query("INSERT INTO buildings(id,name,sort_order,campus_id,map_x,map_y,map_width,map_depth) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[buildingId,building.name,building.key.charCodeAt(0),id,building.x,building.y,building.w,building.h]);
   for(const floor of building.floors){
    const floorId=stableId("floor/"+building.key+"/"+floor.n),plan=generateFloor(building,floor,deptIds,staffIndex,member);
    await c.query("INSERT INTO floors(id,building_id,name,sort_order) VALUES($1,$2,$3,$4)",[floorId,buildingId,floor.n+"F",floor.n]);
    staff.push(...plan.staff);rooms.push(...plan.rooms);
    for(const room of plan.rooms){
     const t=await resolveTemplate(c,room.type),layout=(await c.query("SELECT layout FROM layout_templates WHERE id=$1",[t.id])).rows[0].layout;
     await c.query("INSERT INTO rooms(id,data,layout,floor_id,layout_template_id) VALUES($1,$2,$3,$4,$5)",[room.id,JSON.stringify(room),JSON.stringify(layout),floorId,t.id]);
     await c.query("INSERT INTO layout_versions(room_id,version,layout,actor) VALUES($1,1,$2,$3)",[room.id,JSON.stringify(layout),admin?.id??null]);
    }
    floorRows.push({id:floorId,objects:plan.objects});
   }
  }
 }
 // Directory records are active for assignment/search, but no shared or known login password.
 for(let i=0;i<staff.length;i+=100){
  const batch=staff.slice(i,i+100).map(p=>({...p,hash:randomBytes(16).toString("hex")+":"+randomBytes(64).toString("hex")}));
  await c.query(`INSERT INTO users(id,username,name,password_hash,role,department_id) SELECT x.id::uuid,x.username,x.name,x.hash,'member',x.dept::uuid FROM jsonb_to_recordset($1::jsonb) AS x(id text,username text,name text,hash text,dept text)`,[JSON.stringify(batch)]);
 }
 for(const f of floorRows){
  const value=JSON.stringify(f.objects);
  await c.query("INSERT INTO floor_scenes(floor_id,revision,objects) VALUES($1,1,$2)",[f.id,value]);
  await c.query("INSERT INTO floor_scene_versions(floor_id,revision,objects,actor) VALUES($1,1,$2,$3)",[f.id,value,admin?.id??null]);
 }
 const bookingStaff=member?[member,...staff]:staff;
 const titles=["项目周例会","季度经营分析","跨部门协作沟通","产品需求评审","系统上线评审","风险专题研讨","新员工培训","客户方案交流","数据质量复盘","部门工作计划","年度预算讨论","技术方案交流"];
 let bookings=0;
 for(const [i,room] of rooms.entries()){
  if(room.status!=="enabled")continue;
  // Past, current and next working-day records. Each room/day/slot is unique.
  const slots=[[-12,10,11],[-5,14,15],[-1,9,10],[0,9,10],[0,14,15],[1,10,11],[2,14,15],[5,10,11],[7,15,16]];
  for(const [j,[day,start,end]] of slots.entries()){
   if((i+j)%4===0)continue;
   const p=bookingStaff[(i*13+j*7)%bookingStaff.length],id=stableId("booking/"+room.id+"/"+j);
   const status=day<0&&j===0&&i%3===0?"cancelled":day>=1&&room.rule==="approval"&&j===5?"pending":day<0&&i%7===0?"rejected":"confirmed";
   await c.query(`INSERT INTO bookings(id,room_id,user_id,title,contact,phone,hidden,start_at,end_at,status,expires_at,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,(((now() AT TIME ZONE 'Asia/Shanghai')::date+$8::int)+make_time($9::int,0,0)) AT TIME ZONE 'Asia/Shanghai',(((now() AT TIME ZONE 'Asia/Shanghai')::date+$8::int)+make_time($10::int,0,0)) AT TIME ZONE 'Asia/Shanghai',$11,CASE WHEN $11='pending' THEN now()+interval '24 hours' ELSE NULL END,now()-interval '2 days')`,[id,room.id,p.id,titles[(i+j)%titles.length],p.name,"分机 "+String(8000+(i*13+j)%1000),(i+j)%13===0,day,start,end,status]);
   bookings++;
  }
 }
 // No queued emails from initialization; retain in-app notifications and all real outbox records.
 await c.query("DELETE FROM email_outbox e USING notifications n WHERE e.notification_id=n.id AND n.booking_id IN (SELECT id FROM bookings WHERE room_id=ANY($1::text[]))",[rooms.map(r=>r.id)]);
 await c.query("INSERT INTO seed_profiles(key) VALUES($1)",[profile]);
 return {status:"created" as const,campuses:campuses.length,buildings:campuses.reduce((n,c)=>n+c.buildings.length,0),floors:floorRows.length,desks:floorRows.reduce((n,f)=>n+f.objects.filter(o=>o.kind==="desk").length,0),staff:staff.length,rooms:rooms.length,bookings};
}
