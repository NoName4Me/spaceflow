import type { MapItem } from "./types";
export function mountScene(host:HTMLElement,items:MapItem[],selected:string,onSelect:(id:string)=>void,cameraState?:{position:number[];target:number[];zoom:number},onCamera?:(state:{position:number[];target:number[];zoom:number})=>void):()=>void;
