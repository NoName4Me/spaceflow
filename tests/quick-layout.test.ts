import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {quickLayout} from "../client/src/spatial/quick-layout.ts";
import {sceneSchema} from "../server/workplace-schema.ts";
test("quick layout generates unique valid objects without engineering parameters",()=>{
 const rooms=Array.from({length:12},(_,i)=>({id:"r"+i,name:"Room "+i}));
 const objects=quickLayout(rooms,96,randomUUID);
 assert.equal(objects.filter(o=>o.kind==="desk").length,96);
 assert.equal(objects.filter(o=>o.kind==="room").length,12);
 assert.equal(sceneSchema.safeParse({revision:0,objects}).success,true);
 assert.throws(()=>quickLayout(rooms,97,randomUUID));
});
