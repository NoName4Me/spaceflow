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
