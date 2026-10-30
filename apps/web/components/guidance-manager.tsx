'use client';
import * as React from 'react';
import type { GuidancePlanRevision, GuidancePlanView, ReviewTask } from '@study-agent/contracts';
import { apiRequest,ApiRequestError } from '../lib/api';
import { useSessionUser,refreshSessionUser } from '../lib/session-user';
import { usePracticeLocalCopy } from '../lib/use-practice-local-copy';
import { useWorkspaceExitGuard } from '../lib/use-workspace-exit-guard';
import { guidancePlanCopySchema,guidanceAdjustmentCommandSchema,type GuidancePlanCopy } from '../lib/guidance-plan-copy';
import { PracticeCopyControls } from './practice-copy-controls';
import './guidance-manager.css';
import { GuidanceModelPanel } from './guidance-model-panel';
import { GuidanceCalendarManager } from './guidance-calendar-manager';

const send = <T,>(path: string, body?: unknown) => apiRequest<T>(path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
const kindNames = { created: '建立计划', legacy: '开始保留历史', adjusted: '调整活动', status: '执行状态', retrospective: '确认复盘' };

export function GuidanceManager({plan,onChange}:{plan:GuidancePlanView;onChange:(plan:GuidancePlanView)=>void}){
 const user=useSessionUser();return user?<GuidanceManagerEditor key={user.id+':'+plan.id} ownerId={user.id} plan={plan} onChange={onChange}/>:<p role="status">正在核对指导计划的当前身份…</p>;
}
function GuidanceManagerEditor({ownerId,plan,onChange}:{ownerId:string;plan:GuidancePlanView;onChange:(plan:GuidancePlanView)=>void}){
 const initial:GuidancePlanCopy={format:'guidance-plan-edit-copy-v1',ownerId,planId:plan.id,studentId:plan.studentId,editing:false,budget:plan.minutesPerDay,actions:plan.actions.map(a=>({actionId:a.id,activity:a.activity,minutes:a.minutes})),reason:'',acknowledged:false,editVersion:plan.revision??1,reportVersion:plan.impact.currentReportVersion,pending:null,rejected:[],lastReceipt:null};
 const decode=(value:unknown)=>{const copy=guidancePlanCopySchema.parse(value);if(copy.ownerId!==ownerId||copy.planId!==plan.id||copy.studentId!==plan.studentId||copy.pending&&copy.pending.expectedRevision!==copy.editVersion)throw Error('副本不属于当前作者、原计划或编辑版本。');return copy;};
 const local=usePracticeLocalCopy({identity:JSON.stringify([ownerId,'guidance-plan-edit',plan.id]),initial,decode,filename:'指导计划完整副本.json'}),copy=local.value;
 const {editing=false,budget=plan.minutesPerDay,actions=[],reason='',acknowledged=false,editVersion=plan.revision??1}=copy??{};
 const update=(change:Partial<GuidancePlanCopy>)=>{const current=local.current.current;if(current&&!current.pending)local.update({...current,...change});};
 const setBudget=(value:number)=>update({budget:value}),setReason=(value:string)=>update({reason:value}),setAcknowledged=(value:boolean)=>update({acknowledged:value}),setEditing=(value:boolean)=>update({editing:value}),setActions=(value:React.SetStateAction<GuidancePlanCopy['actions']>)=>update({actions:typeof value==='function'?value(local.current.current!.actions):value});
 const [history,setHistory]=React.useState<GuidancePlanRevision[]|null>(null),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState(''),[rejection,setRejection]=React.useState<string|null>(null);
 const running=React.useRef(false),mounted=React.useRef(true),operation=React.useRef<AbortController|null>(null),change=React.useRef(onChange);change.current=onChange;
 const requiresNewAssessment=!!(plan.impact.definitionChangedActionIds?.length||plan.impact.definitionUnverifiedActionIds?.length),stale=copy?.editing&&editVersion!==(plan.revision??1);
 React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;operation.current?.abort();};},[]);
 React.useEffect(()=>{const abort=new AbortController();void apiRequest<GuidancePlanView>('/diagnostics/plans/'+plan.id,{signal:abort.signal}).then(value=>{if(!abort.signal.aborted)change.current(value);}).catch(reason=>{if(!abort.signal.aborted)setError(reason.message);});return()=>abort.abort();},[plan.id]);
 useWorkspaceExitGuard(ownerId,true,{request:(_href,proceed)=>{if(busy){local.setNotice('原计划操作正在核对，请稍后离开。');return;}local.request(proceed);},isInternal:(next,current)=>{const a=new URL(next,current),b=new URL(current);return a.origin===b.origin&&a.pathname===b.pathname&&a.search===b.search;}});
 async function run(fn:(signal:AbortSignal)=>Promise<void>){if(running.current)return;running.current=true;setBusy(true);setError('');setNotice('');const abort=new AbortController();operation.current=abort;try{await fn(abort.signal);}catch(reason){if(!abort.signal.aborted&&mounted.current){setError((reason as Error).message);if(reason instanceof ApiRequestError&&[401,403].includes(reason.status))void refreshSessionUser();}}finally{running.current=false;if(!abort.signal.aborted&&mounted.current)setBusy(false);}}
 function changed(){}
 async function begin(){if(!copy||copy.pending||!local.preserve())return;await run(async signal=>{const fresh=await apiRequest<GuidancePlanView>('/diagnostics/plans/'+plan.id,{signal});if(signal.aborted)return;change.current(fresh);local.update({...local.current.current!,editing:true,budget:fresh.minutesPerDay,actions:fresh.actions.map(a=>({actionId:a.id,activity:a.activity,minutes:a.minutes})),editVersion:fresh.revision??1,reportVersion:fresh.impact.currentReportVersion,reason:'',acknowledged:false,pending:null});});}
 async function execute(command:NonNullable<GuidancePlanCopy['pending']>,protectedNow=false){if(local.unsafe&&!protectedNow)return;setRejection(null);await run(async signal=>{try{const fresh=await apiRequest<GuidancePlanView&{adjustmentReceipt:{requestKey:string;revision:number}}>('/diagnostics/plans/'+encodeURIComponent(plan.id)+'/adjust',{method:'POST',body:JSON.stringify(command),signal});if(signal.aborted)return;if(fresh.id!==plan.id||fresh.studentId!==plan.studentId||fresh.adjustmentReceipt?.requestKey!==command.requestKey||fresh.adjustmentReceipt.revision!==command.expectedRevision+1)throw Error('原计划调整回执与完整命令不一致。');change.current(fresh);local.update({...local.current.current!,pending:null,lastReceipt:fresh.adjustmentReceipt,editing:false});setHistory(null);setNotice('原调整已保存为第'+fresh.adjustmentReceipt.revision+'版。完整原输入继续保留；当前计划另有后续版本时先比较。');}catch(reason){if(reason instanceof ApiRequestError&&[400,409].includes(reason.status))setRejection(command.requestKey);throw reason;}});}
 async function retainRejected(){const current=local.current.current;if(!current?.pending||rejection!==current.pending.requestKey||!local.preserve())return;if(current.rejected.length>=20){local.setNotice('原拒绝命令已达本份副本预算，请下载后另存完整副本；没有裁切。');return;}local.update({...current,rejected:[...current.rejected,current.pending],pending:null});setRejection(null);await run(async signal=>{const fresh=await apiRequest<GuidancePlanView>('/diagnostics/plans/'+plan.id,{signal});if(!signal.aborted)change.current(fresh);});}
 async function save(event:React.FormEvent){event.preventDefault();if(!copy||copy.pending||running.current)return;try{const command=guidanceAdjustmentCommandSchema.parse({expectedRevision:copy.editVersion,requestKey:crypto.randomUUID(),minutesPerDay:copy.budget,actions:copy.actions,reason:copy.reason,acknowledgeReportVersion:copy.reportVersion});const protectedNow=local.update({...copy,pending:command});if(protectedNow)await execute(command,true);}catch(reason){setError((reason as Error).message);}}
 if(!copy)return <p role="status">正在恢复完整指导输入…</p>;
  return <section className="guidance-manager" aria-label="指导计划调整与历史">
    <GuidanceCalendarManager ownerId={ownerId} plan={plan} onChanged={async()=>{const value=await apiRequest<GuidancePlanView>('/diagnostics/plans/'+encodeURIComponent(plan.id));change.current(value);}}/>
    <div className="guidance-version"><span>第 {plan.revision ?? 1} 版</span><small>{plan.source === 'human' ? '家长调整' : plan.source === 'ai' ? 'AI 辅助说明' : '依据评测安排'} · {new Date(plan.createdAt).toLocaleDateString('zh-CN')}</small></div>
    {plan.impact && <div className={plan.impact.needsReview ? 'guidance-impact' : 'guidance-evidence'} role={plan.impact.needsReview ? 'status' : undefined}>
      <strong>{requiresNewAssessment ? '知识目标需要重新核对与评测。' : plan.impact.needsReview ? '评测有了修订，指导也要重新核对。' : '每次调整，都保留当时的依据。'}</strong>
      <p>{plan.impact.message}</p>{plan.impact.needsReview && <a href={requiresNewAssessment
        ? `/student/assessment?studentId=${plan.studentId}&subject=${plan.subject}`
        : `/student/assessment?studentId=${plan.studentId}&subject=${plan.subject}&session=${plan.baselineSessionId}`}>{requiresNewAssessment ? '重新确认范围与评测 ↗' : '查看修订后的报告 ↗'}</a>}
    </div>}
    <PracticeCopyControls noun="指导" local={local} busy={busy} renderCopy={value=><><p>{value.budget}分钟 · 原计划第{value.editVersion}版 / 报告第{value.reportVersion}版</p>{value.actions.map(action=><p key={action.actionId}>{action.minutes}分钟：{action.activity}</p>)}<p>{value.reason}</p><p>{value.acknowledged?'已核对依据':'尚未核对依据'}</p><p>{value.pending?'包含完整原待确认命令':'没有待确认命令'}</p></>}/>
    {copy.pending&&<aside className="guidance-impact"><h3>原调整操作尚待确认</h3><p>原预算、活动、理由和版本已完整保留。</p><button disabled={busy||local.unsafe} onClick={()=>void execute(copy.pending!)}>核对并继续原指导调整</button>{rejection===copy.pending.requestKey&&<button disabled={busy||local.unsafe} onClick={()=>void retainRejected()}>保留原拒绝命令，核对当前计划</button>}</aside>}
    {!!copy.rejected.length&&<p>完整副本保留{copy.rejected.length}条原拒绝调整命令。</p>}
    {stale&&<aside className="guidance-impact"><h3>当前计划已有后续版本，本机全文保持</h3><p>当前每日{plan.minutesPerDay}分钟，第{plan.revision}版。</p>{plan.actions.map(action=><p key={action.id}>{action.minutes}分钟：{action.activity}</p>)}<button disabled={busy||!!copy.pending||local.unsafe} onClick={()=>void begin()}>保留本机全文，采用当前计划版本</button></aside>}
    {error && <p className="studio-error" role="alert">{error}</p>}{notice && <p role="status" className="studio-notice">{notice}</p>}
    <fieldset className="guidance-model-boundary" disabled={busy||!!copy.pending||!!stale||editing}><GuidanceModelPanel key={plan.id} plan={plan} onChange={value=>{onChange(value);setHistory(null);}}/></fieldset>
    <div className="guidance-controls">{plan.status !== 'completed' && <button className="studio-secondary" disabled={busy || !!copy.pending || requiresNewAssessment || plan.impact.measurementRulesChanged} onClick={begin}>{plan.impact?.needsReview ? '核对依据并调整计划' : '调整时间与指导活动'}</button>}
      <button className="studio-text-button" disabled={busy} onClick={() => run(async () => setHistory(history ? null : await send<GuidancePlanRevision[]>(`/diagnostics/plans/${plan.id}/history`)))}>{history ? '收起历史' : '查看每次调整 ↗'}</button></div>
    {editing && <form className="guidance-edit" onSubmit={save}><fieldset disabled={busy||!!copy.pending||!!stale}>
      <div className="guidance-edit-heading"><span className="studio-eyebrow">下一步，按实际情况调整</span><h3>让指导时间合适，也让每一步有依据。</h3><p>可调整当前知识目标的活动和时间。需要更换知识目标时，请根据最新评测建立新计划。</p></div>
      <label>每天学习几分钟<input type="number" min={5} max={60} required value={budget} onChange={e => { setBudget(Number(e.target.value)); changed(); }} /></label>
      {actions.map((action, index) => <fieldset key={action.actionId}><legend>{plan.actions.find(a => a.id === action.actionId)?.title}</legend>
        <label>这个活动用几分钟<input type="number" min={1} max={60} required value={action.minutes} onChange={e => { setActions(rows => rows.map((a, i) => i === index ? { ...a, minutes: Number(e.target.value) } : a)); changed(); }} /></label>
        <label>怎样陪孩子完成<textarea rows={4} minLength={5} maxLength={2500} required value={action.activity} onChange={e => { setActions(rows => rows.map((a, i) => i === index ? { ...a, activity: e.target.value } : a)); changed(); }} /></label>
      </fieldset>)}
      <p className={actions.reduce((s, a) => s + a.minutes, 0) === budget ? 'studio-muted' : 'guidance-budget-error'}>活动合计 {actions.reduce((s, a) => s + a.minutes, 0)} 分钟 / 每日预算 {budget} 分钟</p>
      <label>这次为什么调整<textarea rows={3} minLength={5} maxLength={1500} required placeholder="例如：孩子能说清步骤，但连续练习时间过长，先缩短每次活动再观察。" value={reason} onChange={e => { setReason(e.target.value); changed(); }} /></label>
      <label className="guidance-ack"><input type="checkbox" required checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /><span>我已查看当前评测依据，知道仍需通过独立新题和间隔复测验证。</span></label>
      <div className="guidance-controls"><button className="studio-primary" disabled={busy || !acknowledged || reason.trim().length < 5 || actions.reduce((s, a) => s + a.minutes, 0) !== budget}>保存为新版本</button><button type="button" className="studio-text-button" disabled={busy} onClick={() => setEditing(false)}>收起调整</button></div>
    </fieldset></form>}
    {history && <div className="guidance-history">{history.length ? history.map(h => <details key={h.id}><summary><span>第 {h.revision} 版 · {kindNames[h.kind]}</span><small>{new Date(h.at).toLocaleString('zh-CN')}</small></summary><p>{h.reason}</p><p>每日 {h.snapshot.minutesPerDay} 分钟 · {h.snapshot.actions.length} 个活动</p>{h.snapshot.actions.map(a => <div key={a.id}><strong>{a.title} · {a.minutes} 分钟</strong><p>{a.activity}</p><small>{a.evidenceIds.length} 条评测依据</small></div>)}</details>) : <p>此历史计划尚未纳入版本记录。下一次调整开始保留快照。</p>}</div>}
  </section>;
}

export function ReviewScheduleEditor({ review, plan, onChange }: { review: ReviewTask; plan: GuidancePlanView; onChange: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false), [time, setTime] = React.useState(''), [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
  const requestKey = React.useRef('');
  if (review.status !== 'pending' || review.sessionId || plan.status === 'completed') return null;
  return <div className="guidance-schedule"><button className="studio-text-button" disabled={busy} onClick={() => { setOpen(!open); const d = new Date(review.dueAt); setTime(new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)); requestKey.current = ''; }}>调整复测时间</button>
    {open && <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError('');
      try { requestKey.current ||= crypto.randomUUID(); await send(`/diagnostics/reviews/${encodeURIComponent(review.id)}/reschedule`, {
        expectedPlanRevision: plan.revision ?? 1, expectedScheduleRevision: review.scheduleRevision ?? 1, requestKey: requestKey.current,
        dueAt: new Date(time).toISOString(), reason }); await onChange(); setOpen(false); }
      catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
    }}><p>安排在未来 90 天内，保留原定测量间隔。已经开始的复测保留原安排。</p><label>复测时间<input type="datetime-local" required value={time} onChange={e => { setTime(e.target.value); requestKey.current = ''; }} /></label><label>调整原因<textarea required minLength={5} maxLength={1500} rows={2} value={reason} onChange={e => { setReason(e.target.value); requestKey.current = ''; }} /></label>{error && <p className="studio-error" role="alert">{error}</p>}<button className="studio-secondary" disabled={busy || reason.trim().length < 5}>保存复测时间</button></form>}
    {!!review.scheduleHistory?.length && <details><summary>时间调整记录（{review.scheduleHistory.length}）</summary>{review.scheduleHistory.map(h => <p key={h.revision}>{new Date(h.previousDueAt).toLocaleString('zh-CN')} → {new Date(h.dueAt).toLocaleString('zh-CN')}<br />{h.reason}</p>)}</details>}
  </div>;
}
