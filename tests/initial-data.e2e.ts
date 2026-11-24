import {chromium,expect} from "@playwright/test";
import assert from "node:assert/strict";
import {readFile,mkdir} from "node:fs/promises";
import {app} from "../server/app.ts";
import {pool} from "../server/db.ts";
import {sceneSchema} from "../server/workplace-schema.ts";
const count=async(sql:string)=>Number((await pool.query(sql)).rows[0].n);
assert.equal(await count("SELECT count(*) n FROM seed_profiles WHERE key='workplace-initial-v1'"),1);
assert.equal(await count("SELECT count(*) n FROM campuses"),2);
assert.equal(await count("SELECT count(*) n FROM buildings"),5);
assert.equal(await count("SELECT count(*) n FROM floors"),17);
assert.equal(await count("SELECT count(*) n FROM floor_scenes"),17);
assert.equal(await count("SELECT count(*) n FROM departments"),10);
assert.ok(await count("SELECT count(*) n FROM users")>500);
assert.ok(await count("SELECT count(*) n FROM rooms")>40);
assert.ok(await count("SELECT count(*) n FROM bookings")>250);
assert.equal(await count("SELECT count(*) n FROM email_outbox"),0);
const scenes=(await pool.query("SELECT floor_id,revision,objects FROM floor_scenes")).rows;
const users=new Set<string>();
for(const scene of scenes){
 const parsed=sceneSchema.parse({revision:scene.revision,objects:scene.objects});
 for(const o of parsed.objects){if(o.userId){assert.ok(!users.has(o.userId));users.add(o.userId);}}
 const actual=(await pool.query("SELECT id FROM rooms WHERE floor_id=$1",[scene.floor_id])).rows.map(r=>r.id).sort();
 assert.deepEqual(parsed.objects.flatMap(o=>o.roomId?[o.roomId]:[]).sort(),actual);
}
const file=await readFile(process.env.LOCAL_ACCOUNTS_FILE||".local-accounts","utf8");
const password=file.split("\n").find(s=>s.startsWith("member: "))?.slice(8);assert.ok(password);
const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
const addr=server.address();if(!addr||typeof addr==="string")throw Error("address");
const base="http://127.0.0.1:"+addr.port;process.env.APP_ORIGIN=base;
const browser=await chromium.launch({headless:true,...(process.env.CI?{}:{channel:"chrome"}),args:["--enable-unsafe-swiftshader"]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(base);
 await page.getByLabel("账号",{exact:true}).fill("member");await page.getByLabel("密码",{exact:true}).fill(password);await page.getByRole("button",{name:"登录",exact:true}).click();
 await page.getByRole("button",{name:"办公空间",exact:true}).click();
 await expect(page.locator(".sf-scene canvas")).toBeVisible();
 await mkdir("test-results",{recursive:true});await page.screenshot({path:"test-results/workplace-initial-campus.png"});
 await page.getByRole("button",{name:"我的工位",exact:true}).click();await expect(page.locator(".sf-properties")).toContainText("林同事");
 await expect(page.locator(".sf-scene canvas")).toBeVisible();await page.screenshot({path:"test-results/workplace-initial-floor-3d.png"});
 await page.getByRole("button",{name:"平面",exact:true}).click();await expect(page.locator(".sf-plan svg")).toBeVisible();await page.screenshot({path:"test-results/workplace-initial-floor-2d.png"});
 console.log("Initial workplace: 2 campuses, 5 buildings, 17 populated floors, directory, booking data and live 2D/3D verified");
}finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));await pool.end();}
