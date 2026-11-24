import {useEffect,useRef,useState} from "react";
import type {MapItem} from "./types";
import {mountScene} from "./three-view.js";
export function SceneView({items,selected,onSelect,onMove,mode}:{items:MapItem[];selected:string;onSelect:(id:string)=>void;onMove?:(id:string,x:number,y:number)=>void;mode:"2d"|"3d"}){
 const host=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
 const select=useRef(onSelect);select.current=onSelect;
 const [failed,setFailed]=useState(false);
 const drag=useRef<{id:string;dx:number;dy:number}|null>(null);
 useEffect(()=>{if(mode!=="3d"||!host.current)return;try{return mountScene(host.current,items,selected,id=>select.current(id));}catch{setFailed(true);}},[mode,items,selected]);
 const point=(e:React.PointerEvent)=>{const node=svg.current;if(!node)return null;const p=node.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const m=node.getScreenCTM();return m?p.matrixTransform(m.inverse()):null;};
 if(mode==="3d"&&!failed)return <div className="sf-scene" ref={host} aria-label="3D 空间地图"/>;
 return <div className="sf-scene sf-plan">{mode==="3d"&&failed&&<span className="sf-note">WebGL 不可用，已切换平面地图</span>}<svg ref={svg} viewBox="0 0 104 74" aria-label="平面地图" onPointerMove={e=>{const p=point(e),d=drag.current;if(p&&d&&onMove)onMove(d.id,p.x-d.dx,p.y-d.dy);}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
 <defs><pattern id="sf-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 H 0 V 5" fill="none" stroke="#d8dce1" strokeWidth=".12"/></pattern></defs>
 <rect x="2" y="2" width="100" height="70" rx="1" fill="#fdfcf9" stroke="#c9cbd1" strokeWidth=".25"/><rect x="2" y="2" width="100" height="70" fill="url(#sf-grid)"/>
 <g transform="translate(2 2)">{items.map(o=><g key={o.id} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation} ${o.w/2} ${o.h/2})`} role="button" tabIndex={0} aria-label={o.name} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(o.id);}}} onPointerDown={e=>{onSelect(o.id);if(onMove){const p=point(e);if(p){drag.current={id:o.id,dx:p.x-o.x,dy:p.y-o.y};e.currentTarget.setPointerCapture(e.pointerId);}}}} style={{cursor:onMove?"move":"pointer"}}>
 <rect width={o.w} height={o.h} rx={o.kind==="desk"?.35:.15} fill={o.color} stroke={selected===o.id?"#7058e8":"#a7aeb8"} strokeWidth={selected===o.id?.6:.2}/>{o.kind==="desk"&&<rect x={o.w*.3} y={o.h*.7} width={o.w*.4} height={o.h*.25} rx=".25" fill="#9ba3af"/>}
 {o.w>=5&&o.h>=3&&<text x={o.w/2} y={o.h/2} dominantBaseline="middle" textAnchor="middle" fontSize={Math.min(2,o.w/(o.name.length+1),o.h*.5)} fill="#394252" pointerEvents="none">{o.name}</text>}</g>)}</g></svg></div>;
}
