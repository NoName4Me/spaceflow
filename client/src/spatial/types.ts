import type { SpatialObject } from "../../../server/workplace-schema";
export type { SpatialObject };
export type Campus={id:string;name:string};
export type Building={id:string;name:string;campus_id:string;map_x:number|null;map_y:number|null};
export type Floor={id:string;name:string;building_id:string};
export type Catalog={campuses:Campus[];buildings:Building[];floors:Floor[]};
export type Person={id:string;name:string};
export type Scene={floorId:string;revision:number;objects:SpatialObject[];people:Person[]};
export type MapItem={id:string;name:string;kind:string;x:number;y:number;w:number;h:number;rotation:number;color:string;height?:number;elevation?:number};
