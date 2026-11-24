import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export function mountScene(host,items,selected,onSelect){
 const scene=new THREE.Scene();scene.background=new THREE.Color("#edf0f3");
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));host.appendChild(renderer.domElement);
 const camera=new THREE.OrthographicCamera(-65,65,46,-46,.1,600);
 camera.position.set(103,118,106);camera.lookAt(0,0,0);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.minZoom=.55;controls.maxZoom=4;controls.maxPolarAngle=Math.PI/2.05;controls.update();
 scene.add(new THREE.HemisphereLight(0xffffff,0xb1b5bd,2.2));
 const light=new THREE.DirectionalLight(0xffffff,2.8);light.position.set(-40,90,65);scene.add(light);
 const geo=new THREE.BoxGeometry(1,1,1), pick=[], materials=[];
 function box(parent,w,h,d,x,y,z,color,id){
  const material=new THREE.MeshStandardMaterial({color,roughness:.86});materials.push(material);
  const mesh=new THREE.Mesh(geo,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);parent.add(mesh);
  if(id){mesh.userData.id=id;pick.push(mesh);}return mesh;
 }
 box(scene,100,.65,70,0,-.36,0,"#faf9f6");
 for(const item of items){
  const group=new THREE.Group();group.position.set(item.x+item.w/2-50,item.elevation||0,item.y+item.h/2-35);group.rotation.y=-item.rotation*Math.PI/180;scene.add(group);
  const color=item.id===selected?"#7058e8":item.color, id=item.id,w=item.w,d=item.h;
  const height=item.height??(item.kind==="wall"?3:item.kind==="room"||item.kind==="zone"?.18:item.kind==="plant"?2:item.kind==="door"?.25:1);
  if(item.kind==="desk"){
   box(group,w*.94,.22,d*.72,0,1.2,-d*.1,color,id);
   for(const x of [-.38,.38])box(group,.18,1.2,d*.65,w*x,.6,-d*.1,"#c5c6c9",id);
   box(group,w*.42,.55,d*.28,0,.55,d*.35,"#9da5af",id);
  }else if(item.kind==="room"){
   box(group,w,.15,d,0,.08,0,color,id);
   box(group,w,.95,.22,0,.48,-d/2,"#c2c7ce",id);
   box(group,.22,.95,d,-w/2,.48,0,"#c2c7ce",id);
  }else{
   box(group,w,height,d,0,height/2,0,color,id);
   if(item.kind==="building" && height>4){
    for(let y=3;y<height-.5;y+=3)box(group,w+.08,.1,d+.08,0,y,0,"#c4c9d2",id);
   }
  }
 }
 const render=()=>renderer.render(scene,camera);
 const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),a=w/h;camera.left=-46*a;camera.right=46*a;camera.top=46;camera.bottom=-46;camera.updateProjectionMatrix();renderer.setSize(w,h);render();};
 const observer=new ResizeObserver(resize);observer.observe(host);controls.addEventListener("change",render);resize();
 let start;const down=e=>{start=[e.clientX,e.clientY]};const up=e=>{if(!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;const r=renderer.domElement.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(pick,false)[0];if(hit)onSelect(hit.object.userData.id);};
 renderer.domElement.addEventListener("pointerdown",down);renderer.domElement.addEventListener("pointerup",up);
 return ()=>{observer.disconnect();controls.dispose();renderer.domElement.removeEventListener("pointerdown",down);renderer.domElement.removeEventListener("pointerup",up);geo.dispose();materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();};
}
