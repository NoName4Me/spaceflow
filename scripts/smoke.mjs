import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../prototype/app.js',import.meta.url),'utf8');
const elements=new Map();const element=()=>({innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelectorAll(){return []},querySelector(){return null},style:{}});
const document={body:{addEventListener(){}},querySelector(sel){if(!elements.has(sel))elements.set(sel,element());return elements.get(sel)},querySelectorAll(){return []},addEventListener(){}};
const storage=new Map();const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const ctx=vm.createContext({document,localStorage,window:{scrollTo(){}},Date,Math,JSON,setTimeout,clearTimeout,console});
vm.runInContext(source,ctx,{filename:'prototype/app.js'});
const titles={explore:'找到刚好合适的空间',detail:'空间布局',schedule:'会议室占用矩阵',mine:'我的预订',editor:'属性面板',settings:'预订生效方式'};
for(const [page,needle] of Object.entries(titles)){
 vm.runInContext(`state.page=${JSON.stringify(page)};render();`,ctx);
 assert.ok(elements.get('#content').innerHTML.includes(needle),`missing ${needle} on ${page}`);
}
const n=vm.runInContext("conflicts('r1',TODAY,'10:30','11:00').length",ctx);
assert.equal(n,1);
console.log('Spaceflow smoke: 6 pages rendered, conflict model responded');
