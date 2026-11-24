import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {app} from "../server/app.ts";
import {pool} from "../server/db.ts";
import {hashPassword} from "../server/auth.ts";
const adminId=randomUUID(),memberId=randomUUID(),campusId=randomUUID(),buildingId=randomUUID(),floorId=randomUUID(),roomId=randomUUID();
let admin="",member="";
const server=app.listen(0,"127.0.0.1");
await new Promise<void>(resolve=>server.once("listening",resolve));
const addr=server.address();if(!addr||typeof addr==="string")throw Error("address");
const base="http://127.0.0.1:"+addr.port+"/api";
async function req(path:string,token="",method="GET",body?:unknown){const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",Cookie:token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get("set-cookie")?.split(";")[0]||""};}
before(async()=>{
 const password="Workplace-test-1234",hash=await hashPassword(password);
 for(const [id,role] of [[adminId,"admin"],[memberId,"member"]]){await pool.query("INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)",[id,id,role,hash,role]);const r=await req("/login","","POST",{username:id,password});if(role==="admin")admin=r.cookie;else member=r.cookie;}
 await pool.query("INSERT INTO campuses(id,name) VALUES($1,$2)",[campusId,campusId]);
 await pool.query("INSERT INTO buildings(id,name,campus_id) VALUES($1,$2,$3)",[buildingId,buildingId,campusId]);
 await pool.query("INSERT INTO floors(id,building_id,name) VALUES($1,$2,'1F')",[floorId,buildingId]);
 await pool.query("INSERT INTO rooms(id,data,floor_id) VALUES($1,$2,$3)",[roomId,JSON.stringify({id:roomId,name:"Hidden room",status:"hidden",rule:"admin"}),floorId]);
});
after(async()=>{
 await pool.query("DELETE FROM audit WHERE actor=ANY($1::uuid[])",[[adminId,memberId]]);
 await pool.query("DELETE FROM rooms WHERE id=$1",[roomId]);await pool.query("DELETE FROM floors WHERE id=$1",[floorId]);await pool.query("DELETE FROM buildings WHERE id=$1",[buildingId]);await pool.query("DELETE FROM campuses WHERE id=$1",[campusId]);await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])",[[adminId,memberId]]);await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])",[[adminId,memberId]]);await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();
});
test("workplace authorization, persistence, revision and hidden room filtering",async()=>{
 const path="/workplace/floors/"+floorId;
 const payload={revision:0,objects:[{id:randomUUID(),kind:"desk",name:"Desk",x:2,y:2,w:4,h:3,rotation:0,userId:memberId},{id:randomUUID(),kind:"room",name:"Hidden room",x:10,y:10,w:15,h:10,rotation:0,roomId}]};
 assert.equal((await req("/workplace/catalog")).status,401);
 assert.equal((await req(path,member,"PUT",payload)).status,403);
 assert.equal((await req(path,admin,"PUT",payload)).status,200);
 assert.equal((await req(path,admin,"PUT",payload)).status,409);
 const scene=await req(path,member);
 assert.equal(scene.status,200);assert.equal(scene.data.revision,1);assert.equal(scene.data.objects.length,1);assert.equal(scene.data.people[0].id,memberId);
 assert.equal((await req(path,admin)).data.objects.length,2);
 const a=await req(path+"/availability?date=2030-01-01&start=09:00&end=10:00",member);
 assert.equal(a.status,200);assert.deepEqual(a.data.rooms,{});
});

test("drafts are isolated, revision guarded, published search and history work",async()=>{
 const path="/workplace/planning/floors/"+floorId;
 const pub=(await req("/workplace/floors/"+floorId,admin)).data;
 const objects=[...pub.objects,{id:randomUUID(),kind:"zone",name:"Planning zone",x:40,y:10,w:20,h:20,rotation:0,points:[[0,0],[1,0],[.7,1],[0,1]]}];
 const body={baseRevision:pub.revision,draftRevision:0,objects,referenceImage:null};
 assert.equal((await req(path+"/draft",member)).status,403);
 const d=await req(path+"/draft",admin,"PUT",body);
 assert.equal(d.status,200);assert.equal(d.data.draftRevision,1);
 assert.equal((await req(path+"/draft",admin,"PUT",body)).status,409);
 assert.equal((await req("/workplace/floors/"+floorId,member)).data.objects.length,1);
 assert.equal((await req("/workplace/planning/search?q=Planning",member)).data.length,0);
 const p=await req(path+"/publish",admin,"POST",{draftRevision:1});
 assert.equal(p.status,200);assert.equal(p.data.revision,2);
 assert.equal((await req("/workplace/floors/"+floorId,member)).data.objects.length,2);
 const search=(await req("/workplace/planning/search?q=Planning",member)).data;
 assert.equal(search[0].floor_id,floorId);
 assert.equal((await req("/workplace/planning/search?q=Hidden%20room",member)).data.length,0);
 const versions=await req(path+"/versions",admin);
 assert.equal(versions.data.length,2);
 assert.equal((await req(path+"/versions/1",admin)).data.objects.length,2);
 assert.equal((await req(path+"/versions/1",member)).status,403);
 const summary=(await req("/workplace/planning/summary",member)).data.find((x:any)=>x.floor_id===floorId);
 assert.equal(summary.desks,1);assert.equal(summary.assigned,1);assert.equal(summary.rooms,0);
});

test("cross-floor transfer is atomic and refuses a pending draft",async()=>{
 const other=randomUUID(),desk=randomUUID(),path="/workplace/planning/floors/"+other;
 await pool.query("INSERT INTO floors(id,building_id,name) VALUES($1,$2,'2F')",[other,buildingId]);
 try{
 const body={baseRevision:0,draftRevision:0,objects:[{id:desk,kind:"desk",name:"Target",x:4,y:4,w:4,h:3,rotation:0}],referenceImage:null};
 assert.equal((await req(path+"/draft",admin,"PUT",body)).status,200);
 assert.equal((await req(path+"/publish",admin,"POST",{draftRevision:1})).status,200);
 const move={floorId:other,revision:1,moves:[{deskId:desk,userId:memberId}]};
 assert.equal((await req("/workplace/planning/transfers",member,"POST",move)).status,403);
 const source="/workplace/planning/floors/"+floorId;
 const current=(await req(source+"/draft",admin)).data;
 assert.equal((await req(source+"/draft",admin,"PUT",{baseRevision:current.baseRevision,draftRevision:0,objects:current.objects,referenceImage:null})).status,200);
 assert.equal((await req("/workplace/planning/transfers",admin,"POST",move)).status,409);
 assert.equal((await req(source+"/draft",admin,"DELETE",{draftRevision:1})).status,200);
 const moved=await req("/workplace/planning/transfers",admin,"POST",move);
 assert.equal(moved.status,200);assert.equal(moved.data.floors,2);
 assert.equal((await req("/workplace/floors/"+other,member)).data.objects[0].userId,memberId);
 assert.ok(!(await req("/workplace/floors/"+floorId,member)).data.objects.some((o:any)=>o.userId===memberId));
 assert.equal((await req("/workplace/planning/transfers",admin,"POST",move)).status,409);
 assert.equal((await req("/workplace/planning/transfers",admin,"POST",{...move,revision:2,moves:[{deskId:desk,userId:null}]})).status,200);
 assert.equal((await req("/workplace/floors/"+other,member)).data.objects[0].userId,undefined);
 }finally{await pool.query("DELETE FROM floors WHERE id=$1",[other]);}
});
