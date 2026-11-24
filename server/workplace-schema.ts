import { z } from "zod";
export const objectSchema = z.object({
 id: z.uuid(), kind: z.enum(["zone","room","desk","wall","door","plant","facility"]),
 name: z.string().trim().min(1).max(80),
 x: z.number().min(0).max(100), y: z.number().min(0).max(70),
 w: z.number().min(.3).max(100), h: z.number().min(.3).max(70),
 rotation: z.number().min(-360).max(360),
 roomId: z.string().max(100).optional(), userId: z.uuid().optional(), departmentId:z.uuid().optional(),
 points:z.array(z.tuple([z.number().min(0).max(1),z.number().min(0).max(1)])).min(3).max(40).optional(),
}).strict().refine(o => (!o.roomId || o.kind === "room") && (!o.userId || o.kind === "desk") && (!o.departmentId || o.kind === "zone" || o.kind === "desk") && (!o.points || o.kind === "zone" || o.kind === "room"),"业务关联类型不正确")
.refine(o => { const a=o.rotation*Math.PI/180, dx=(Math.abs(Math.cos(a))*o.w+Math.abs(Math.sin(a))*o.h)/2, dy=(Math.abs(Math.sin(a))*o.w+Math.abs(Math.cos(a))*o.h)/2; return o.x+o.w/2-dx>=-.001 && o.x+o.w/2+dx<=100.001 && o.y+o.h/2-dy>=-.001 && o.y+o.h/2+dy<=70.001; },"对象超出楼层范围");
export const sceneSchema = z.object({revision:z.number().int().nonnegative(),objects:z.array(objectSchema).max(800)}).strict()
 .refine(s=>new Set(s.objects.map(o=>o.id)).size===s.objects.length,"对象 ID 重复")
 .refine(s=>{const ids=s.objects.flatMap(o=>o.roomId?[o.roomId]:[]);return new Set(ids).size===ids.length;},"会议室重复绑定")
 .refine(s=>{const ids=s.objects.flatMap(o=>o.userId?[o.userId]:[]);return new Set(ids).size===ids.length;},"员工重复分配");
export type SpatialObject=z.infer<typeof objectSchema>;
