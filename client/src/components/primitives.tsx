import type { ComponentProps } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect } from "./ui/native-select";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { cn } from "../lib/utils";

// Preserve native form submission and specialized calendar/map controls.
export function AppButton({className, ...props}:ComponentProps<"button">){
 const classes=className?.split(/\s+/)||[];
 if(!classes.includes("button")&&!classes.includes("icon-btn"))
   return <button className={className} {...props}/>;
 return <Button variant={classes.includes("primary")?"default":classes.includes("ghost")?"ghost":"outline"}
   size={classes.includes("icon-btn")?"icon":classes.includes("small")?"sm":"default"}
   className={className} {...props}/>;
}
export function AppInput({type,className,...props}:ComponentProps<"input">){
 if(type==="checkbox"||type==="radio"||type==="range"||type==="hidden"||type==="color")
   return <input type={type} className={className} {...props}/>;
 return <Input type={type} className={className} {...props}/>;
}
export function AppSelect({multiple,size,className,...props}:ComponentProps<"select">){
 if(multiple||size!==undefined) return <select data-slot="native-select-list" multiple={multiple} size={size} className={className} {...props}/>;
 return <NativeSelect className={className} {...props}/>;
}
export function AppTextarea(props:ComponentProps<"textarea">){return <Textarea {...props}/>;}
export function AppLabel({className,...props}:ComponentProps<"label">){return <Label className={cn("app-label",className)} {...props}/>;}
