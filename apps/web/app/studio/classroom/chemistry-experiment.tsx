'use client';
import * as React from 'react';
import type { ClassroomExperiment } from '@study-agent/contracts';
import './chemistry-experiment.css';

const colors = { H: '#f8e9bc', O: '#d56449', C: '#46535e', N: '#7b9eb1' };
function Atom({ element, x, y }: { element: keyof typeof colors; x: number; y: number }) {
  return <g><circle cx={x} cy={y} r={element === 'H' ? 13 : 17} fill={colors[element]} stroke="#394744" strokeWidth="1.5"/>
    <text x={x} y={y + 5} textAnchor="middle" fill={element === 'O' || element === 'C' ? 'white' : '#263a34'} fontSize="15">{element}</text></g>;
}
function Molecule({ kind, x, y }: { kind: 'water' | 'hydrogen' | 'oxygen'; x: number; y: number }) {
  return <g>{kind === 'water' ? <><path d={`M${x - 24},${y + 15}L${x},${y}L${x + 24},${y + 15}`} stroke="#6b7870" strokeWidth="4" fill="none"/>
    <Atom element="O" x={x} y={y}/><Atom element="H" x={x - 24} y={y + 15}/><Atom element="H" x={x + 24} y={y + 15}/></> :
    <><path d={`M${x - 14},${y}h28`} stroke="#6b7870" strokeWidth="4"/><Atom element={kind === 'hydrogen' ? 'H' : 'O'} x={x - 14} y={y}/><Atom element={kind === 'hydrogen' ? 'H' : 'O'} x={x + 14} y={y}/></>}</g>;
}
function Graphic({ label, children }: { label: string; children: React.ReactNode }) {
  return <svg className="cl-chem-graphic" role="img" aria-label={label} viewBox="0 0 600 245" xmlns="http://www.w3.org/2000/svg">{children}</svg>;
}
function Range({ label, value, onChange, min = 0, max = 100, step = 1, disabled = false }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return <label className="cl-chem-range"><span>{label}<output>{value}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}/></label>;
}
function Model({ kind }: { kind: ClassroomExperiment['kind'] }) {
  const [mode, setMode] = React.useState('physical'), [amount, setAmount] = React.useState(kind === 'air-mixture' ? 100 : kind === 'water-electrolysis' ? 5 : 30);
  const [enabled, setEnabled] = React.useState(false), [escape, setEscape] = React.useState(22);
  const [coefficients, setCoefficients] = React.useState([1, 1, 1]), [conditions, setConditions] = React.useState([true, true, false]);
  if (kind === 'particle-change') return <>
    <label>选择变化<select aria-label="选择变化" value={mode} onChange={event => setMode(event.target.value)}><option value="physical">水汽化</option><option value="chemical">水分解</option></select></label>
    <Graphic label={mode === 'physical' ? '两个水分子汽化后种类不变，间隔改变' : '两个水分子分解为两个氢分子和一个氧分子，H四个O两个守恒'}>
      <rect x="20" y="38" width="230" height="180" rx="14" fill="#e9f1ee"/><rect x="350" y="38" width="230" height="180" rx="14" fill="#f7f1e6"/>
      <text x="135" y="27" textAnchor="middle">变化前：2H₂O</text><text x="465" y="27" textAnchor="middle">{mode === 'physical' ? '汽化后：仍是2H₂O' : '分解后：2H₂ + O₂'}</text>
      <Molecule kind="water" x={100} y={145}/><Molecule kind="water" x={175} y={145}/><text x="300" y="135" textAnchor="middle" fontSize="30">→</text>
      {mode === 'physical' ? <><Molecule kind="water" x={410} y={90}/><Molecule kind="water" x={525} y={175}/></> :
        <><Molecule kind="hydrogen" x={405} y={90}/><Molecule kind="hydrogen" x={525} y={90}/><Molecule kind="oxygen" x={465} y={175}/></>}
    </Graphic><output className="cl-chem-result">{mode === 'physical' ? '分子种类不变：物理变化。' : '分子种类改变：化学变化。'}两侧均有4个H原子、2个O原子。</output></>;
  if (kind === 'air-mixture') return <>
    <Range label="空气总体积（mL）" value={amount} onChange={setAmount} min={100} max={1000} step={50}/>
    <Graphic label="空气体积组成：氮气约78%，氧气约21%，其他约1%">
      <rect x="30" y="85" width="421.2" height="65" fill="#7b9eb1"/><rect x="451.2" y="85" width="113.4" height="65" fill="#d56449"/><rect x="564.6" y="85" width="5.4" height="65" fill="#bca26e"/>
      <text x="30" y="65">N₂ 约78%</text><text x="455" y="65">O₂ 约21%</text><text x="30" y="192">其余约1%：稀有气体、CO₂等</text>
    </Graphic><output className="cl-chem-result">按体积估算：N₂约{+(amount * .78).toFixed(1)} mL，O₂约{+(amount * .21).toFixed(1)} mL，其余约{+(amount * .01).toFixed(1)} mL。</output></>;
  if (kind === 'catalysis') {
    const fraction = Math.min(amount / (enabled ? 25 : 100), 1);
    return <><label className="cl-chem-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/>使用适当催化剂</label>
      <Range label="示意时间进度（不是秒数）" value={amount} onChange={setAmount}/>
      <Graphic label="有催化剂时更快到达同一产气终点，两条示意曲线平台相同">
        <path d="M50,30V205H570" fill="none" stroke="#5b6a62" strokeWidth="2"/><path d="M50,195L175,55H550" fill="none" stroke="#28725a" strokeWidth="4"/><path d="M50,195L550,55" fill="none" stroke="#b88c4a" strokeWidth="4"/>
        <path d={`M${50 + amount * 5},205V35`} stroke="#9ca8a0" strokeDasharray="5 5"/><circle cx={50 + amount * 5} cy={195 - fraction * 140} r="7" fill="#263e33"/>
        <text x="75" y="27">终点：相对产气量100</text><text x="210" y="90" fill="#28725a">适当催化剂</text><text x="330" y="170" fill="#926a32">未加催化剂</text><text x="440" y="235">示意时间 →</text>
      </Graphic><output className="cl-chem-result">当前相对产气量：{Math.round(fraction * 100)}；两种条件的理论终点均为100。</output></>;
  }
  if (kind === 'atom-ion') return <>
    <label className="cl-chem-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/>失去1个核外电子</label>
    <Graphic label={enabled ? 'Na离子：11质子10电子，净电荷正1，失去的电子画在系统外' : 'Na原子：11质子11电子，整体不带电'}>
      {[48, 82, 108].filter((_, index) => !enabled || index < 2).map(r => <circle key={r} cx="285" cy="122" r={r} fill="none" stroke="#b2c4b9"/>)}
      <circle cx="285" cy="122" r="27" fill="#e5c5a4"/><text x="285" y="127" textAnchor="middle">11p⁺</text>
      {[2, 8, enabled ? 0 : 1].map((n, shell) => Array.from({ length: n }, (_, index) => {
        const angle = index * Math.PI * 2 / n, r = [48, 82, 108][shell];
        return <circle key={shell + ':' + index} cx={285 + r * Math.cos(angle)} cy={122 + r * Math.sin(angle)} r="5" fill="#36715e"/>;
      }))}
      {enabled && <><path d="M400,120h65" stroke="#657c70" strokeWidth="2"/><circle cx="490" cy="122" r="5" fill="#36715e"/><text x="490" y="158" textAnchor="middle">e⁻（离开）</text></>}
      <text x="30" y="48" fontSize="28">{enabled ? 'Na⁺' : 'Na'}</text>
    </Graphic><output className="cl-chem-result">质子11个，核外电子{enabled ? 10 : 11}个，净电荷{enabled ? '+1' : '0'}。元素种类保持不变。</output></>;
  if (kind === 'filtration') return <>
    <label className="cl-chem-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/>观察过滤后</label>
    <Graphic label={enabled ? '过滤后不溶颗粒在滤纸上，滤液中仍有溶解物' : '过滤前的水中同时有不溶颗粒和溶解物'}>
      <path d="M60,50V200H235V50M375,135V220H535V135" stroke="#5c7368" strokeWidth="3" fill="none"/>
      <path d="M310,45h250L440,130v35" stroke="#5c7368" strokeWidth="3" fill="none"/><path d="M337,62h194l-91,58Z" fill="#eee3c9"/>
      <rect x="62" y="105" width="171" height="93" fill="#e4efeb"/><rect x="377" y="173" width="156" height="45" fill="#e4efeb"/>
      {Array.from({ length: 5 }, (_, index) => <React.Fragment key={index}>
        <rect x={enabled ? 398 + index * 16 : 83 + index * 27} y={enabled ? 75 : 127 + index % 2 * 35} width="10" height="10" fill="#64594b"/>
        <circle cx={enabled ? 395 + index * 27 : 90 + index * 27} cy={enabled ? 192 + index % 2 * 13 : 180 - index % 2 * 30} r="4" fill="#497dad"/>
      </React.Fragment>)}
      <text x="70" y="30">原混合物</text><text x="375" y="30">滤纸与滤液</text><text x="50" y="238">■ 不溶颗粒　● 溶解物（符号示意）</text>
    </Graphic><output className="cl-chem-result">{enabled ? '不溶颗粒被截留；滤液仍含溶解物，不能据此认定是纯水或可饮用。' : '先分别追踪两类杂质，再切换过滤后的模型。'}</output></>;
  if (kind === 'water-electrolysis') return <>
    <Range label="阳极氧气体积（mL）" min={1} max={20} value={amount} onChange={setAmount}/>
    <Graphic label={`同温同压下，阴极氢气${amount * 2}mL，阳极氧气${amount}mL，体积比二比一`}>
      <rect x="100" y="40" width="100" height="170" fill="#f2f0e6" stroke="#7e9387"/><rect x="380" y="40" width="100" height="170" fill="#f2f0e6" stroke="#7e9387"/>
      <rect x="102" y={208 - amount * 8} width="96" height={amount * 8} fill="#dfc985"/><rect x="382" y={208 - amount * 4} width="96" height={amount * 4} fill="#d89481"/>
      <text x="150" y="28" textAnchor="middle">H₂ {amount * 2} mL</text><text x="430" y="28" textAnchor="middle">O₂ {amount} mL</text>
      <text x="150" y="236" textAnchor="middle">阴极（−）</text><text x="430" y="236" textAnchor="middle">阳极（+）</text>
    </Graphic><output className="cl-chem-result">氢气∶氧气体积比约2∶1；质量比为1∶8，两个比值不能混用。</output></>;
  if (kind === 'mass-conservation') {
    const lost = enabled ? escape : 0;
    return <><label className="cl-chem-toggle"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/>开口：允许CO₂逸出</label>
      <Range label="逸出CO₂质量（g，模型值）" max={44} value={escape} onChange={setEscape} disabled={!enabled}/>
      <Graphic label={`生成44克CO2，称量范围内${44 - lost}克，范围外${lost}克，总质量44克`}>
        <rect x="40" y="35" width="270" height="165" rx="10" fill="#edf2ee" stroke="#537562" strokeWidth="2" strokeDasharray="8 5"/>
        <text x="175" y="75" textAnchor="middle">称量范围内</text><text x="175" y="138" textAnchor="middle" fontSize="36">{44 - lost} g</text>
        <text x="450" y="75" textAnchor="middle">范围外CO₂</text><text x="450" y="138" textAnchor="middle" fontSize="36">{lost} g</text><text x="340" y="130" textAnchor="middle" fontSize="30">+</text>
        <text x="300" y="232" textAnchor="middle">反应前：12 g C + 32 g O₂ = 44 g</text>
      </Graphic><output className="cl-chem-result">{44 - lost} g + {lost} g = 44 g。{enabled ? '范围内变轻，不能漏算逸出的气体。' : '封闭且无物质交换时，称量范围内质量保持44 g。'}</output></>;
  }
  if (kind === 'balance-water') {
    const [a, b, c] = coefficients, balanced = 2 * a === 2 * c && 2 * b === c;
    return <><div className="cl-chem-coefficients">{['H₂系数', 'O₂系数', 'H₂O系数'].map((label, index) => <label key={label}>{label}<select aria-label={label} value={coefficients[index]}
      onChange={event => setCoefficients(current => current.map((n, i) => i === index ? Number(event.target.value) : n))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select></label>)}</div>
      <p className="cl-chem-equation">{a}H₂ + {b}O₂ <span>→<small>点燃</small></span> {c}H₂O</p>
      <div className="cl-table-wrap"><table><caption>逐种元素核对原子数</caption><thead><tr><th>元素</th><th>反应前</th><th>反应后</th><th>相等吗</th></tr></thead><tbody>
        <tr><th>H</th><td>{2 * a}</td><td>{2 * c}</td><td>{a === c ? '相等' : '不等'}</td></tr><tr><th>O</th><td>{2 * b}</td><td>{c}</td><td>{2 * b === c ? '相等' : '不等'}</td></tr>
      </tbody></table></div><output className="cl-chem-result" data-balanced={balanced}>{balanced ? a === 2 && b === 1 && c === 2 ? '已配平，且为最简整数比2∶1∶2。' : '原子数已守恒，还可约为最简整数比2∶1∶2。' : '尚未配平。保持化学式不变，继续调整系数。'}</output></>;
  }
  if (kind === 'co2-test') {
    const state = mode === 'wet' ? ['#ba5c6b', '湿润石蕊变红', 'CO₂ + H₂O → H₂CO₃'] : mode === 'lime' ? ['#f5f5ed', '石灰水变浑浊', 'CO₂ + Ca(OH)₂ → CaCO₃↓ + H₂O'] : ['#8f749e', '干燥石蕊不变红', '缺少水参与，不能据CO₂本身称其为酸'];
    return <><label>检验条件<select aria-label="检验条件" value={mode} onChange={event => setMode(event.target.value)}><option value="physical">干燥石蕊与干燥CO₂</option><option value="wet">湿润石蕊与CO₂</option><option value="lime">足量澄清石灰水与少量CO₂</option></select></label>
      <Graphic label={state[1]}><path d="M150,30V215H450V30" fill="none" stroke="#698075" strokeWidth="3"/><rect x="153" y="115" width="294" height="97" fill={state[0]}/>
        <text x="300" y="75" textAnchor="middle">通入少量CO₂（条件模型）</text>{mode === 'lime' && Array.from({ length: 12 }, (_, i) => <circle key={i} cx={175 + i * 23} cy={195 - i % 3 * 20} r="5" fill="#b8b8ae"/>)}
        <text x="300" y="153" textAnchor="middle" fill={mode === 'lime' ? '#3e5149' : 'white'}>{state[1]}</text>
      </Graphic><output className="cl-chem-result">{state[1]}。{state[2]}</output></>;
  }
  const burning = conditions.every(Boolean);
  return <><fieldset className="cl-chem-conditions"><legend>逐一改变燃烧条件</legend>{['有可燃物', '接触氧气', '达到着火点'].map((label, index) => <label key={label}><input type="checkbox" checked={conditions[index]}
    onChange={event => setConditions(current => current.map((value, i) => i === index ? event.target.checked : value))}/>{label}</label>)}</fieldset>
    <Graphic label={burning ? '三个条件均满足，模型显示燃烧' : '缺少至少一个必要条件，模型显示不燃烧'}>
      <path d="M300,35L80,205H520Z" fill={burning ? '#f9e5cd' : '#edf2ee'} stroke="#9eac9e" strokeWidth="3"/>
      {[[300, 35], [80, 205], [520, 205]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="12" fill={conditions[i] ? '#377962' : '#ac6f59'}/>)}
      <text x="300" y="135" textAnchor="middle" fontSize="29">{burning ? '燃烧条件满足' : '燃烧条件不足'}</text><text x="300" y="25" textAnchor="middle">可燃物</text><text x="80" y="238" textAnchor="middle">氧气</text><text x="505" y="238" textAnchor="middle">达到着火点</text>
    </Graphic><output className="cl-chem-result">{burning ? '三个条件同时成立。试着去掉任意一个条件。' : '缺少：' + ['可燃物', '氧气', '达到着火点的温度'].filter((_, i) => !conditions[i]).join('、') + '。'}</output></>;
}

export function ChemistryExperiment({ experiment, print = false, onInteract }: { experiment: ClassroomExperiment; print?: boolean; onInteract?: () => void }) {
  const [prediction, setPrediction] = React.useState<number | null>(null), [observed, setObserved] = React.useState(false), id = React.useId();
  if (print) return <section className="cl-chem-print"><h3>{experiment.title} · 模型演示</h3><p>{experiment.prediction.question}</p><p>{experiment.observation}</p><p>{experiment.explanation}</p><p>{experiment.limitation}</p></section>;
  return <section className="cl-chem-experiment" data-experiment={experiment.kind} aria-label={experiment.title}>
    <header><span>模型演示</span><h3>{experiment.title}</h3><p>先预测，再改变条件观察，最后解释。</p></header>
    <fieldset className="cl-chem-prediction"><legend>{experiment.prediction.question}</legend>{experiment.prediction.options.map((option, index) => <label key={option}>
      <input type="radio" name={id} value={index} checked={prediction === index} onChange={() => { onInteract?.(); setPrediction(index); setObserved(false); }}/>{option}</label>)}</fieldset>
    <button className="cl-chem-observe" disabled={prediction === null} onClick={() => { onInteract?.(); setObserved(true); }}>观察变化</button>
    {observed && <div className="cl-chem-observation"><p>{experiment.observation}</p><Model kind={experiment.kind}/>
      <details><summary>用证据解释，并核对预测</summary><p>{experiment.explanation}</p><p>我的预测：{prediction === null ? '' : experiment.prediction.options[prediction]}</p></details></div>}
    <p className="cl-chem-limitation">{experiment.limitation} 演示操作和预测不计入独立考核。</p>
  </section>;
}
