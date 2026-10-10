import { useEffect, useRef } from 'react';
import { FRAME_FPS } from '@swarm/shared/cast';
import type { SwarmEvent } from '@swarm/shared/events';
type Frame = Extract<SwarmEvent,{type:'frame'}>['data'];
const sinks=new Map<string,(frame:Frame)=>void>();
export function drawFrame(frame:Frame){sinks.get(frame.botId)?.(frame);}
export function FrameCanvas({id,color,load,phone}:{id:string;color:string;load:boolean;phone:boolean}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current!,ctx=canvas.getContext('2d')!;let frame=0,disposed=false,decodeSeq=-1;let bitmap:ImageBitmap|undefined;
    const w=phone?390:1280,h=phone?844:800;canvas.width=w;canvas.height=h;
    const draw=()=>{if(document.hidden)return;frame++;ctx.fillStyle='#fafaf8';ctx.fillRect(0,0,w,h);ctx.fillStyle='#fff';ctx.fillRect(0,0,w,100);ctx.fillStyle='#191919';ctx.font=`500 ${phone?18:24}px Arial`;ctx.fillText('Example workspace',phone?24:55,58);ctx.fillStyle='#8b8b87';ctx.font=`${phone?12:17}px Arial`;ctx.fillText('Synthetic page · no website connected',phone?24:55,84);
      const pad=phone?24:55,cols=phone?1:2,gap=phone?15:30,cw=(w-pad*2-gap*(cols-1))/cols;
      for(let i=0;i<(phone?3:4);i++){const x=pad+(i%cols)*(cw+gap),y=140+Math.floor(i/cols)*250;ctx.fillStyle='#fff';ctx.fillRect(x,y,cw,215);ctx.strokeStyle='#e7e7e2';ctx.strokeRect(x,y,cw,215);ctx.fillStyle=color+'24';ctx.fillRect(x+20,y+20,54,54);ctx.fillStyle='#b8b8b0';ctx.fillRect(x+20,y+100,cw*0.6,8);ctx.fillStyle='#e4e4de';ctx.fillRect(x+20,y+124,cw*0.8,7);ctx.fillRect(x+20,y+145,cw*0.5,7);ctx.fillStyle=color;ctx.fillRect(x+20,y+172,90,24);}
      if(load){const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,color+'10');gradient.addColorStop(0.5+Math.sin(frame/14)*0.3,color+'45');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.fillRect(0,100,w,h-100);}
    };draw();const timer=load?setInterval(draw,1000/FRAME_FPS):undefined;
    sinks.set(id,async value=>{const seq=value.seq;if(seq<=decodeSeq)return;decodeSeq=seq;try{const binary=atob(value.jpeg),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const next=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));if(disposed||seq!==decodeSeq){next.close();return;}bitmap?.close();bitmap=next;ctx.drawImage(next,0,0,w,h);}catch(error){console.error('Could not decode browser frame',error);}});
    return()=>{disposed=true;clearInterval(timer);sinks.delete(id);bitmap?.close();};
  },[id,color,load,phone]);
  return <canvas ref={ref} className="frame-canvas" aria-label="Simulated browser page"/>;
}
