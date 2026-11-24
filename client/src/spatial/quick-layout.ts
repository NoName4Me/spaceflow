import type { SpatialObject } from "../../../server/workplace-schema.js";
type RoomRef={id:string;name:string};
export function quickLayout(rooms:RoomRef[],deskCount:number,makeId:()=>string):SpatialObject[]{
 if(!Number.isInteger(deskCount)||deskCount<0||deskCount>96||rooms.length>12)throw Error("快速布局支持 0–96 个工位、最多 12 间会议室");
 const objects:SpatialObject[]=[];
 const add=(kind:SpatialObject["kind"],name:string,x:number,y:number,w:number,h:number,roomId?:string)=>objects.push({id:makeId(),kind,name,x,y,w,h,rotation:0,roomId});
 add("zone","办公区 A",3,4,43,27);
 add("zone","办公区 B",54,4,43,27);
 add("zone","公共通道",3,32,94,6);
 const cols=8,perZone=48;
 for(let i=0;i<deskCount;i++){
 const j=i%perZone,zone=i<perZone?0:1;
 add("desk","D-"+String(i+1).padStart(3,"0"),5+zone*51+(j%cols)*5,6+Math.floor(j/cols)*4,4.2,3.1);
 }
 const count=rooms.length,roomCols=Math.min(6,Math.max(1,count)),roomWidth=Math.min(18,90/roomCols-1);
 for(let i=0;i<count;i++)add("room",rooms[i].name,3+(i%roomCols)*(roomWidth+1),40+Math.floor(i/roomCols)*14,roomWidth,12,rooms[i].id);
 if(count<=6){add("facility","茶水区",3,54,16,12);add("facility","打印区",21,54,12,12);add("facility","电梯与楼梯",80,54,17,12);}
 add("plant","绿植",48,6,3,3);add("plant","绿植",48,26,3,3);
 return objects;
}
