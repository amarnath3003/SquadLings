import { PERSONALITY } from '../characters/personality';
import type { BotId } from '@swarm/shared/types';
let context: AudioContext | undefined, enabled=false, starts: number[]=[];
export async function setSound(value:boolean) { enabled=value; if(value) { context??=new AudioContext(); await context.resume(); } }
export function sound(id:BotId,kind:'click'|'found'|'finish'|'approval',speed:number) {
  if(!enabled||!context||document.hidden||(kind==='click'&&speed===4))return;
  const now=performance.now();starts=starts.filter(t=>now-t<1000);if(starts.length>=8)return;starts.push(now);
  const notes=kind==='found'?[1,1.5]:kind==='finish'?[1,1.25,1.5]:[1];
  notes.forEach((ratio,i)=>{const osc=context!.createOscillator(),gain=context!.createGain(),t=context!.currentTime+i*0.09;osc.type='sine';osc.frequency.value=kind==='approval'?880:PERSONALITY[id].pitch*ratio;gain.gain.setValueAtTime(0.04,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.07);osc.connect(gain);gain.connect(context!.destination);osc.start(t);osc.stop(t+0.08);});
}
