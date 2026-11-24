import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export function mountScene(host,items,selected,onSelect,cameraState,onCamera){
 const scene=new THREE.Scene();scene.background=new THREE.Color("#edf0f3");
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));host.appendChild(renderer.domElement);
 const camera=new THREE.OrthographicCamera(-65,65,46,-46,.1,600);
 camera.position.set(103,118,106);camera.lookAt(0,0,0);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.minZoom=.55;controls.maxZoom=4;controls.maxPolarAngle=Math.PI/2.05;if(cameraState){camera.position.fromArray(cameraState.position);controls.target.fromArray(cameraState.target);camera.zoom=cameraState.zoom;camera.updateProjectionMatrix();}controls.update();
 scene.add(new THREE.HemisphereLight(0xffffff,0xb1b5bd,2.2));
 const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(-40,90,65);scene.add(light);
 const geo=new THREE.BoxGeometry(1,1,1), pick=[], materials=new Map(), extraGeos=[], textures=[];
 function mat(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.86}));return materials.get(color);}
 function label(parent,name,y){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.fillStyle='rgba(255,255,255,.93)';ctx.beginPath();ctx.roundRect(4,4,504,88,18);ctx.fill();ctx.font='500 42px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#28323f';ctx.fillText(name,256,48,476);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;textures.push(tex);const m=new THREE.SpriteMaterial({map:tex,depthTest:false,transparent:true});const sprite=new THREE.Sprite(m);sprite.position.set(0,y,0);sprite.scale.set(10,1.875,1);parent.add(sprite);}
 function polygon(parent,item,color,id){const shape=new THREE.Shape();item.points.forEach((p,i)=>{const x=(p[0]-.5)*item.w,z=(.5-p[1])*item.h;i?shape.lineTo(x,z):shape.moveTo(x,z);});shape.closePath();const g=new THREE.ShapeGeometry(shape);extraGeos.push(g);const mesh=new THREE.Mesh(g,mat(color));mesh.rotation.x=-Math.PI/2;mesh.position.y=.11;mesh.userData.id=id;parent.add(mesh);pick.push(mesh);}
 function box(parent,w,h,d,x,y,z,color,id){
  const material=mat(color);
  const mesh=new THREE.Mesh(geo,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);parent.add(mesh);
  if(id){mesh.userData.id=id;pick.push(mesh);}return mesh;
 }
 box(scene,100,.65,70,0,-.36,0,"#faf9f6");
 for(const item of items){
  const group=new THREE.Group();group.position.set(item.x+item.w/2-50,item.elevation||0,item.y+item.h/2-35);group.rotation.y=-item.rotation*Math.PI/180;scene.add(group);
  const color=item.id===selected?"#7058e8":item.color, id=item.id,w=item.w,d=item.h;
  const height=item.height??(item.kind==="wall"?3:(item.kind==="room"||item.kind==="zone")?.18:item.kind==="plant"?2:item.kind==="door"?.25:1);
  if(item.kind==="desk"){
   box(group,w*.94,.22,d*.72,0,1.2,-d*.1,color,id);
   for(const x of [-.38,.38])box(group,.18,1.2,d*.65,w*x,.6,-d*.1,"#c5c6c9",id);
   box(group,w*.42,.55,d*.28,0,.55,d*.35,"#9da5af",id);
  }else if(item.kind==="room"){
   if(item.points)polygon(group,item,color,id);else box(group,w,.15,d,0,.08,0,color,id);
   box(group,w,.95,.22,0,.48,-d/2,"#c2c7ce",id);
   box(group,.22,.95,d,-w/2,.48,0,"#c2c7ce",id);
   if(w>6&&d>5){box(group,w*.48,.24,d*.48,0,1,0,"#f3eee6",id);for(const z of [-.3,.3])for(const x of [-.18,.18])box(group,1.1,.55,1.1,w*x,.5,d*z,"#aab4be",id);}
   label(group,item.name,2.2);
  }else{
   if(item.points)polygon(group,item,color,id);else box(group,w,height,d,0,height/2,0,color,id);
   if(["building","level","zone","garden","parking","plaza"].includes(item.kind))label(group,item.name,height+1.4);if(item.kind==="garden"){for(let i=0;i<3;i++)box(group,Math.min(2,w/5),1.8,Math.min(2,d/4),(i-1)*w*.25,.9,0,"#8aaf94",id);}
   if(item.kind==="building" && height>4){
    for(let y=3;y<height-.5;y+=3)box(group,w+.08,.1,d+.08,0,y,0,"#c4c9d2",id);
   }
  }
 }
 const render=()=>renderer.render(scene,camera);
 const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),a=w/h,extent=Math.max(46,62/a,Math.max(0,...items.map(o=>(o.elevation||0)+(o.height||0)))*.8+28);camera.left=-extent*a;camera.right=extent*a;camera.top=extent;camera.bottom=-extent;camera.updateProjectionMatrix();renderer.setSize(w,h);render();};
 const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener("change",()=>{onCamera?.({position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom});render();});resize();
 let start;const down=e=>{start=[e.clientX,e.clientY]};const up=e=>{if(!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;const r=renderer.domElement.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(pick,false)[0];if(hit)onSelect(hit.object.userData.id);};
 renderer.domElement.addEventListener("pointerdown",down);renderer.domElement.addEventListener("pointerup",up);
 return ()=>{observer.disconnect();controls.dispose();renderer.domElement.removeEventListener("pointerdown",down);renderer.domElement.removeEventListener("pointerup",up);geo.dispose();scene.traverse(o=>{if(o.isSprite)o.material.dispose();});materials.forEach(m=>m.dispose());extraGeos.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
}
