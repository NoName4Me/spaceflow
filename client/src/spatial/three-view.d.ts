import type { MapItem } from "./types";
export function mountScene(host:HTMLElement,items:MapItem[],selected:string,onSelect:(id:string)=>void):()=>void;
