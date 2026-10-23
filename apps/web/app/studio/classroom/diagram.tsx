import type { ClassroomDiagram } from '@study-agent/contracts';

export function ClassroomFigure({ diagram }: { diagram: ClassroomDiagram }) {
  const { labels, title, kind } = diagram;
  return <figure className="cl-figure"><svg viewBox="0 0 640 350" role="img" aria-label={title}>
    {kind === 'venn' ? <>
      <circle cx="245" cy="170" r="128" fill="#e5f0fc" stroke="#4a82b7" strokeWidth="2" />
      <circle cx="395" cy="170" r="128" fill="#f7e9d4" fillOpacity=".68" stroke="#b68443" strokeWidth="2" />
      <text x="205" y="165" textAnchor="middle" fill="#2869a0">{labels[0]}</text>
      <text x="435" y="165" textAnchor="middle" fill="#996326">{labels[1]}</text>
      <text x="320" y="183" textAnchor="middle" fill="#6948bd" fontSize="17">{labels[2]}</text>
      <text x="205" y="196" textAnchor="middle" className="cl-svg-small">传记 · Biography</text>
      <text x="435" y="196" textAnchor="middle" className="cl-svg-small">历史 · History</text>
    </> : kind === 'bars' ? <>
      <text x="40" y="38" className="cl-svg-small">示意尺度 · 非统计数据</text>
      {labels.map((label, index) => <g key={index}>
        <text x="40" y={110 + index * 100} fontSize="18">{label}</text>
        <rect x="215" y={78 + index * 100} width={Math.max(25, (diagram.values?.[index] ?? 20) * 3.8)} height="44" rx="8" fill={index ? '#bdb0dd' : '#90b7d2'} />
      </g>)}
    </> : <>
      {labels.map((label, index) => <g key={index}>
        <rect x={42 + index * 195} y="112" width="168" height="112" rx="18" fill={['#e9f0fa', '#f2ecfa', '#f7f0dc'][index % 3]} stroke="#cad4e2" />
        <text x={126 + index * 195} y="174" textAnchor="middle" fontSize="17">{label}</text>
        {index < labels.length - 1 && <path d={'M ' + (214 + index * 195) + ' 168 h 18 m -6 -6 l 6 6 l -6 6'} fill="none" stroke="#8b99ae" strokeWidth="2" />}
      </g>)}
    </>}
  </svg><figcaption>{title}</figcaption></figure>;
}

export function CourseCover() {
  return <svg className="cl-cover" viewBox="0 0 300 280" role="img" aria-label="由阶梯与拱门构成的课程封面">
    <defs><linearGradient id="cl-cover-bg" x2="1" y2="1"><stop stopColor="#f4f3ed"/><stop offset="1" stopColor="#f1f2f5"/></linearGradient></defs>
    <rect width="300" height="280" rx="20" fill="url(#cl-cover-bg)"/>
    <g transform="translate(150 42)"><path d="M0 0 90 52 0 104 -90 52Z" fill="#e8ddd0"/>
      <path d="M-90 52 0 104 0 199 -90 147Z" fill="#e5d9ba"/><path d="M0 104 90 52 90 147 0 199Z" fill="#c1cbd5"/>
      {[-55,-20,15,50].map((x,i)=><g key={x} transform={'translate('+x+' '+(68+i*3)+')'}><path d="M0 0q11-24 22 0v48L0 36Z" fill={i%2?'#b5c4c9':'#c9a8aa'}/></g>)}
      <path d="M-100 157 -60 134 -20 157 20 134 60 157 20 180 -20 157 -60 180Z" fill="#c3ced0" stroke="#e5dfce" strokeWidth="4"/>
      <path d="M-40 57 0 34 40 57 40 91 0 114 -40 91Z" fill="#e8d9bf"/><path d="M-8 83q8-25 16 0v25l-16 9Z" fill="#afb6c9"/>
      <path d="M-70 128 -30 105 3 123 -37 146Z" fill="#e5bfd0"/><path d="M-70 128 -70 140 -37 158 -37 146Z" fill="#c9b5cc"/>
      <path d="M35 167 65 150 85 161 55 178Z" fill="#f1d8ad"/>
    </g>
  </svg>;
}
