import {useEffect,useRef,useState} from "react";
import type {MapItem} from "./types";

export function SceneView({items,selected,onSelect,onMove,onMoveStart,onDraw,drawPoints=[],referenceImage,mode}:{items:MapItem[];selected:string;onSelect:(id:string)=>void;onMove?:(id:string,x:number,y:number)=>void;onMoveStart?:()=>void;onDraw?:(x:number,y:number)=>void;drawPoints?:[number,number][];referenceImage?:string|null;mode:"2d"|"3d"}){
 const host=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
 const select=useRef(onSelect);select.current=onSelect;
 const camera=useRef<{position:number[];target:number[];zoom:number}|undefined>(undefined);
 const [failed,setFailed]=useState(false);
 const drag=useRef<{id:string;dx:number;dy:number}|null>(null);
 useEffect(()=>{if(mode!=="3d"||!host.current||failed)return;let cancelled=false,dispose:(()=>void)|undefined;const el=host.current;void import("./three-view.js").then(({mountScene})=>{if(!cancelled)dispose=mountScene(el,items,selected,id=>select.current(id),camera.current,state=>camera.current=state);}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;dispose?.();};},[mode,items,selected,failed]);
 const point=(e:React.PointerEvent)=>{const node=svg.current;if(!node)return null;const p=node.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const m=node.getScreenCTM();return m?p.matrixTransform(m.inverse()):null;};
 if(mode==="3d"&&!failed)return <div className="sf-scene" ref={host} aria-label="3D 空间地图"/>;
 return <div className="sf-scene sf-plan">{mode==="3d"&&failed&&<span className="sf-note">WebGL 不可用，已切换平面地图</span>}<svg ref={svg} viewBox="0 0 104 74" aria-label="平面地图" onPointerDown={e=>{if(onDraw){const p=point(e);if(p)onDraw(Math.max(0,Math.min(100,p.x-2)),Math.max(0,Math.min(70,p.y-2)));}}} onPointerMove={e=>{const p=point(e),d=drag.current;if(p&&d&&onMove)onMove(d.id,p.x-d.dx,p.y-d.dy);}} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}>
 <defs><pattern id="sf-grid" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M 5 0 H 0 V 5" fill="none" stroke="#d8dce1" strokeWidth=".12"/></pattern></defs>
 <rect x="2" y="2" width="100" height="70" rx="1" fill="#fdfcf9" stroke="#c9cbd1" strokeWidth=".25"/><rect x="2" y="2" width="100" height="70" fill="url(#sf-grid)"/>
 {referenceImage&&<image href={referenceImage} x="2" y="2" width="100" height="70" opacity=".48" preserveAspectRatio="none"/>}
 <g transform="translate(2 2)">{items.map(o=><g key={o.id} transform={`translate(${o.x} ${o.y}) rotate(${o.rotation} ${o.w/2} ${o.h/2})`} role="button" tabIndex={0} aria-label={o.name} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(o.id);}}} onPointerDown={e=>{if(onDraw)return;onSelect(o.id);if(onMove){onMoveStart?.();const p=point(e);if(p){drag.current={id:o.id,dx:p.x-o.x,dy:p.y-o.y};e.currentTarget.setPointerCapture(e.pointerId);}}}} style={{cursor:onMove?"move":"pointer"}}>
 {o.points?<polygon points={o.points.map(p=>[p[0]*o.w,p[1]*o.h].join(",")).join(" ")} fill={o.color} fillOpacity={referenceImage?.65:1} stroke={selected===o.id?"#345f57":"#a7aeb8"} strokeWidth={selected===o.id?.6:.2}/>:<rect width={o.w} height={o.h} rx={o.kind==="desk"?.35:.15} fill={o.color} fillOpacity={referenceImage&&o.kind==="zone"?.65:1} stroke={selected===o.id?"#345f57":"#a7aeb8"} strokeWidth={selected===o.id?.6:.2}/>}{o.kind==="desk"&&<rect x={o.w*.3} y={o.h*.7} width={o.w*.4} height={o.h*.25} rx=".25" fill="#9ba3af"/>}
 {o.w>=5&&o.h>=3&&<text x={o.w/2} y={o.h/2} dominantBaseline="middle" textAnchor="middle" fontSize={Math.min(2,o.w/(o.name.length+1),o.h*.5)} fill="#394252" pointerEvents="none">{o.name}</text>}</g>)}{drawPoints.length>0&&<><polyline points={drawPoints.map(p=>p.join(",")).join(" ")} stroke="#345f57" strokeWidth=".6" fill="none"/>{drawPoints.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r=".65" fill="#345f57"/>)}</>}</g></svg></div>;
}
