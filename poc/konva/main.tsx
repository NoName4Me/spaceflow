import React,{useRef,useState,useEffect} from 'react';
import{createRoot}from'react-dom/client';
import{Stage,Layer,Rect,Text,Transformer}from'react-konva';
import type Konva from 'konva';

type Furniture={id:string;kind:'table'|'chair'|'screen';x:number;y:number;rotation:number;width:number;height:number};
const INITIAL:Furniture[]=[{id:'table-1',kind:'table',x:190,y:110,width:180,height:82,rotation:0},{id:'chair-1',kind:'chair',x:220,y:210,width:32,height:30,rotation:0},{id:'screen-1',kind:'screen',x:242,y:65,width:80,height:16,rotation:0}];
const colors={table:'#adc7b3',chair:'#dae7d6',screen:'#2c5040'};
function App(){
 const [items,setItems]=useState<Furniture[]>(INITIAL);
 const [selected,setSelected]=useState<string|null>(null);
 const [undo,setUndo]=useState<Furniture[][]>([]);
 const nodes=useRef<Record<string,Konva.Rect|null>>({});
 const transformer=useRef<Konva.Transformer>(null);
 useEffect(()=>{const n=selected?nodes.current[selected]:null;if(transformer.current){transformer.current.nodes(n?[n]:[]);transformer.current.getLayer()?.batchDraw()}},[selected,items]);
 const record=()=>setUndo(h=>[...h.slice(-29),items.map(v=>({...v}))]);
 const update=(id:string,patch:Partial<Furniture>)=>setItems(xs=>xs.map(x=>x.id===id?{...x,...patch}:x));
 const add=(kind:Furniture['kind'])=>{record();const dims=kind==='table'?[180,82]:kind==='chair'?[32,30]:[80,16];const id=`${kind}-${Date.now()}`;setItems(xs=>[...xs,{id,kind,x:220,y:135,width:dims[0],height:dims[1],rotation:0}]);setSelected(id)};
 const save=()=>{const blob=new Blob([JSON.stringify({schemaVersion:1,coordinateSystem:{width:640,height:400},elements:items},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='konva-layout.json';a.click();URL.revokeObjectURL(u)};
 return <div style={{padding:26,maxWidth:1100,margin:'auto'}}><h1 style={{fontSize:22,color:'#244735'}}>Spaceflow · React Konva 技术验证</h1><p style={{color:'#71887a'}}>可操作：添加 → 拖拽 → 选中 → 缩放/旋转 → 撤销 → 导出 JSON。此页面不包含生产预订服务。</p><div style={{display:'flex',gap:10,margin:'20px 0',flexWrap:'wrap'}}>{(['table','chair','screen'] as const).map(k=><button key={k} onClick={()=>add(k)} style={btn}>＋ {k}</button>)}<button style={btn} onClick={()=>{if(!selected)return;record();setItems(xs=>xs.filter(x=>x.id!==selected));setSelected(null)}}>删除选中</button><button style={btn} onClick={()=>{if(!undo.length)return;setItems(undo.at(-1)!);setUndo(v=>v.slice(0,-1));setSelected(null)}}>撤销</button><button style={{...btn,background:'#235a41',color:'white'}} onClick={save}>导出布局 JSON</button></div><div style={{display:'inline-block',background:'white',border:'1px solid #cddfd2',borderRadius:12,padding:12}}><Stage width={640} height={400} onMouseDown={e=>{if(e.target===e.target.getStage())setSelected(null)}}><Layer><Rect x={0} y={0} width={640} height={400} fill="#eef4ec"/><Rect x={45} y={30} width={550} height={330} fill="#fbfcf9" stroke="#adc3ac" strokeWidth={7}/><Text x={55} y={365} text="LAYOUT POC · NOT TO SCALE" fontSize={11} fill="#8ba18f"/>{items.map(x=><Rect key={x.id} ref={n=>{nodes.current[x.id]=n}} x={x.x} y={x.y} rotation={x.rotation} width={x.width} height={x.height} cornerRadius={x.kind==='table'?12:4} fill={colors[x.kind]} stroke={selected===x.id?'#317b54':'#93ae9b'} strokeWidth={selected===x.id?2:1} draggable onClick={()=>setSelected(x.id)} onTap={()=>setSelected(x.id)} onDragStart={record} onDragEnd={e=>update(x.id,{x:e.target.x(),y:e.target.y()})} onTransformStart={record} onTransformEnd={e=>{const n=e.target;update(x.id,{x:n.x(),y:n.y(),rotation:n.rotation(),width:Math.max(10,n.width()*n.scaleX()),height:Math.max(10,n.height()*n.scaleY())});n.scale({x:1,y:1})}}/>)}<Transformer ref={transformer} keepRatio={false} rotateEnabled={true} boundBoxFunc={(_,next)=>next.width<10||next.height<10?_:next}/></Layer></Stage></div><p style={{color:'#819386',fontSize:12}}>验收建议：测试拖拽、负缩放、边界、尺寸归一化与 100+ 元素性能；尚未在此环境完成依赖安装。</p></div>
}
const btn:React.CSSProperties={padding:'10px 14px',borderRadius:7,border:'1px solid #d5dfd5',background:'white',cursor:'pointer'};
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
