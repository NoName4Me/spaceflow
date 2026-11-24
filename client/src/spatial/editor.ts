import type {SpatialObject} from "./types";
export const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export const fit=(o:SpatialObject):SpatialObject=>{
 const w=clamp(o.w,.3,100),h=clamp(o.h,.3,70),a=o.rotation*Math.PI/180;
 const dx=(Math.abs(Math.cos(a))*w+Math.abs(Math.sin(a))*h)/2,dy=(Math.abs(Math.sin(a))*w+Math.abs(Math.cos(a))*h)/2;
 if(dx>50||dy>35)return {...o,w,h};
 return {...o,w,h,x:clamp(o.x+w/2,dx,100-dx)-w/2,y:clamp(o.y+h/2,dy,70-dy)-h/2};
};
export async function readReference(file:File):Promise<string>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>20*1024*1024)throw Error("请选择 20MB 以内的 PNG、JPG 或 WebP");
 const url=URL.createObjectURL(file);
 try{
 const im=new Image();im.src=url;await im.decode();
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");if(!ctx)throw Error("无法读取图片");
 for(const max of [1400,1100,800,600,400]){
 const scale=Math.min(1,max/Math.max(im.width,im.height));canvas.width=Math.max(1,Math.round(im.width*scale));canvas.height=Math.max(1,Math.round(im.height*scale));ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);
 const out=canvas.toDataURL("image/jpeg",.72);if(out.length<=100000)return out;
 }throw Error("图片压缩后仍过大");
 }finally{URL.revokeObjectURL(url);}
}
