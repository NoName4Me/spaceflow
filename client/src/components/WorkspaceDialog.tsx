import { useRef, type ReactNode } from "react";
import { Dialog, DialogContent } from "./ui/dialog";

export function WorkspaceDialog({open,onClose,children,detail=false}:{open:boolean;onClose:()=>void;children:ReactNode;detail?:boolean}){
 const opener=useRef<HTMLElement|null>(null);
 return <Dialog open={open} onOpenChange={v=>{if(!v)onClose();}}>
   {!open&&!detail&&<div id="modal" hidden aria-hidden="true"/>}
   {open&&<DialogContent
     id={detail?"roomDialog":undefined}
     className={detail?"room-dialog sf-dialog-detail":"modal-card sf-dialog-card"}
     overlayClassName="modal-backdrop open sf-dialog-overlay"
     overlayId={detail?undefined:"modal"}
     showCloseButton={false}
     aria-describedby={undefined}
     onOpenAutoFocus={e=>{
       opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
       const panel=document.querySelector<HTMLElement>(detail?"#roomDialog":".sf-dialog-card");
       const first=panel?.querySelector<HTMLElement>("input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)");
       if(first&&!detail){e.preventDefault();first.focus();}
     }}
     onCloseAutoFocus={e=>{e.preventDefault();if(opener.current?.isConnected)opener.current.focus();}}
     onPointerDownOutside={e=>{if(!detail)e.preventDefault();}}
   >{children}</DialogContent>}
 </Dialog>;
}
