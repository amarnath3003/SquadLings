import { CAST } from '@swarm/shared/cast';
import { useDashboard } from '../store';
import { MasterLogo } from '../characters/MasterLogo';
import { BotCharacter } from '../characters/BotCharacter';
import { Icon,STATUS_META } from '../characters/icons';
import { currentMood } from '../mood/engine';
import { useMasterTick } from '../director/director';
export function MasterCard({reduced,count}:{reduced:boolean;count:number}) {
  const bots=useDashboard(s=>s.state.bots),master=useDashboard(s=>s.state.master),pending=useDashboard(s=>s.state.approvals.some(a=>a.status==='pending')),tick=useMasterTick(s=>s.tick);
  const total=Object.values(bots).length,done=Object.values(bots).filter(b=>b?.status==='finished').length;
  return <section className="master-card"><div className="master-card-top"><MasterLogo state={pending?'needs you':master} reduced={reduced} size={44} tick={tick}/><div><strong>Master</strong><span>{pending?'Needs your input':master==='idle'?'The big-picture thinker':master.charAt(0).toUpperCase()+master.slice(1)}</span></div><span className="micro-tag">COORDINATOR</span></div><p className="master-description">A place for every finding.<br/>A plan that brings it all together.</p>
    <div className="master-roster">{CAST.slice(0,count).map(c=>{const b=bots[c.id],m=b?currentMood(b.conditions,useDashboard.getState().state.now):c.signature;return <div key={c.id} data-master-row={c.id} className="roster-row"><BotCharacter id={c.id} mood={m} size={22} reduced/><div><strong>{c.name}<span>{b?` / ${b.roleName}`:''}</span></strong><small>{b?.report?.slice(0,40)??(b?STATUS_META[b.status][1]:'Waiting for assignment')}</small><div className="roster-progress"><i style={{background:c.color,transform:`scaleX(${b?b.steps/b.maxSteps:0})`}}/></div></div>{b?.status==='finished'?<Icon name="check" size={14}/>:<span className="roster-dot" style={{background:c.color}}/>}</div>;})}</div>
    <div className="master-bottom"><span><Icon name="note" size={14}/> Reports received</span><strong>{done} / {total||count}</strong></div>
  </section>;
}
