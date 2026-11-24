import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {sceneSchema} from "../server/workplace-schema.ts";
const desk={id:randomUUID(),kind:"desk",name:"A-001",x:4,y:4,w:5,h:3,rotation:0};
test("workplace validates bounds and stable ids",()=>{
 assert.equal(sceneSchema.safeParse({revision:0,objects:[desk]}).success,true);
 assert.equal(sceneSchema.safeParse({revision:0,objects:[desk,desk]}).success,false);
 assert.equal(sceneSchema.safeParse({revision:0,objects:[{...desk,x:99}]}).success,false);
 assert.equal(sceneSchema.safeParse({revision:0,objects:[{...desk,roomId:"room"}]}).success,false);
});
test("workplace rejects duplicate employee assignment",()=>{
 const userId=randomUUID();
 assert.equal(sceneSchema.safeParse({revision:0,objects:[{...desk,userId},{...desk,id:randomUUID(),userId}]}).success,false);
});
