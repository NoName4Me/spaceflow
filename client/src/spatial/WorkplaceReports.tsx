import {useState} from "react";
import {useResource} from "../workspace";

type DepartmentRow={department_id:string|null;department_name:string;desks:number;assigned:number;reserved:number;zones:number;cross_department:number};
type DeskEvent={revision:number;created_at:string;actor:string|null;previous_user_id:string|null;previous_name:string|null;user_id:string|null;user_name:string|null;desk_name:string|null};
const base="/workplace/planning";
export function DepartmentReport({campus,building,floor,refresh}:{campus:string;building:string;floor:string;refresh:number}){
 const q=new URLSearchParams({campusId:campus,refresh:String(refresh)});if(building)q.set("buildingId",building);if(floor)q.set("floorId",floor);
 const {result,loading}=useResource<DepartmentRow[]>(base+"/department-summary?"+q,[]);
 const [open,setOpen]=useState(true);
 function download(){
  const csv=(v:unknown)=>{let s=String(v??"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const rows=[["部门","工位","已分配","未分配","明确归属工位","办公区域","跨部门分配"],...result.map(r=>[r.department_name,r.desks,r.assigned,r.desks-r.assigned,r.reserved,r.zones,r.cross_department])];
  const url=URL.createObjectURL(new Blob(["\uFEFF"+rows.map(r=>r.map(csv).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="spaceflow-部门空间统计.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="sf-report">
 <div className="sf-report-heading"><div><h3>部门空间统计</h3><small>已发布布局 · 按工位明确归属优先、人员部门次之统计，不代表实时在岗。</small></div><button className="button" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?"收起":"展开"}</button>{open&&<button className="button" disabled={loading||!result.length} onClick={download}>导出 CSV</button>}</div>
 {open&&(loading?<p className="sf-note">正在统计…</p>:<div className="sf-stat-table"><table><thead><tr><th>部门</th><th>工位数</th><th>已分配</th><th>未分配</th><th>分配率</th><th>明确归属工位</th><th>办公区域</th><th>跨部门分配</th></tr></thead><tbody>{result.map(r=><tr key={r.department_id||"none"}><td>{r.department_name}</td><td>{r.desks}</td><td>{r.assigned}</td><td>{r.desks-r.assigned}</td><td><meter min={0} max={Math.max(1,r.desks)} value={r.assigned}/>{r.desks?Math.round(r.assigned/r.desks*100):0}%</td><td>{r.reserved}</td><td>{r.zones}</td><td>{r.cross_department}</td></tr>)}{!result.length&&<tr><td colSpan={8}>当前空间尚无已发布的工位或区域</td></tr>}</tbody></table></div>)}
 </section>;
}
export function DeskHistory({floor,desk,revision}:{floor:string;desk:string;revision:number}){
 const [open,setOpen]=useState(false);
 const {result,loading}=useResource<DeskEvent[]>(open?base+"/floors/"+floor+"/desks/"+desk+"/history?revision="+revision:null,[]);
 return <section className="sf-desk-history"><button className="button" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?"收起分配历史":"查看分配历史"}</button>{open&&(loading?<small>正在加载…</small>:result.length?<ol>{result.map(e=><li key={e.revision}><strong>{e.previous_user_id?(e.previous_name||"原员工"):"未分配"} → {e.user_id?(e.user_name||"员工"):"未分配"}</strong><small>{new Date(e.created_at).toLocaleString("zh-CN")} · {e.actor||"系统"} · 版本 {e.revision}</small></li>)}</ol>:<small>暂无分配变更记录</small>)}</section>;
}
