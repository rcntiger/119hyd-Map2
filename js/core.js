/* 119hyd-Map2 · js/core.js — 기본 도구 (esc · DOM 캐시 · safeStorage · 토스트 · 모달 · sbClient) */
AppFiles.reg('js/core.js','v3.12.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ Utils & DOM Cache ══════════ */
// 따옴표도 바꾼다 — value="…"·title="…" 같은 속성 안에 넣을 때 글자에 "가 있으면 속성이 끊겼다 (v3.10.1)
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
const sleep=Utils.sleep;
// 오늘(또는 d) 날짜를 이 기기 시간대 기준 'YYYY-MM-DD'로 (v3.10.1)
// ⚠ new Date().toISOString().slice(0,10)은 세계표준시(UTC) 날짜라, 한국에서는 오전 9시 전에 '어제'가 된다.
//   그래서 아침 점검의 점검일자·완료일이 하루 전으로 저장되던 문제.
function localDate(d=new Date()){
  if(!(d instanceof Date))d=new Date(d);
  if(isNaN(d))return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// 'YYYY-MM-DD'(이 기기 시간대의 날짜) → 저장용 ISO 시각. 정오로 잡아 어느 시간대에서 읽어도 같은 날짜가 되게 한다.
function localDateToIso(s){
  const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?new Date(+m[1],+m[2]-1,+m[3],12).toISOString():new Date().toISOString();
}
// 표 전체 읽기 (v3.10.1) — Supabase는 한 번에 최대 1000행만 돌려주므로(서버 설정) 1000행씩 나눠 끝까지 받는다.
// 공통 SupabaseUtil.select는 나눠 받지 않아, 소화전·완료 기록이 1000개를 넘으면 뒤쪽이 말없이 빠졌다.
// key: 나눠 받을 때 순서를 고정하는 칸 (id가 없는 hydmap_done·hydmap_memo는 'item_id')
async function sbSelectAll(table,{eq,order,columns='*',key='id'}={}){
  const c=SupabaseUtil.getClient(),PAGE=1000;
  let out=[];
  for(let from=0;;from+=PAGE){
    let q=c.from(table).select(columns);
    if(eq)Object.entries(eq).forEach(([k,v])=>{q=q.eq(k,v);});
    if(order)q=q.order(order.column,{ascending:order.ascending??true});
    if(key&&key!==order?.column)q=q.order(key,{ascending:true});
    const {data,error}=await q.range(from,from+PAGE-1);
    if(error)throw new Error(`[SupabaseUtil] select(${table}): ${error.message}`);
    out=out.concat(data||[]);
    if(!data||data.length<PAGE)break;
  }
  return out;
}
// DOM 캐시 (반복 getElementById 호출 절감)
const _domCache={};
function $(id){return _domCache[id]||(_domCache[id]=document.getElementById(id));}
// 안전한 localStorage 접근: 사파리 프라이빗 모드, 저장공간 초과, 브라우저 정책 등으로
// setItem/getItem이 예외를 던져도 앱 전체가 멈추지 않도록 감싼다.
const safeStorage={
  get(key,fallback=''){try{return localStorage.getItem(key)??fallback;}catch(e){console.warn('localStorage 읽기 실패:',e);return fallback;}},
  set(key,val){try{localStorage.setItem(key,val);return true;}catch(e){console.warn('localStorage 저장 실패(프라이빗 모드이거나 저장공간 초과일 수 있음):',e);return false;}}
};

let _toastTimer=null;
function showToast(msg,type=''){
  const t=$('toast');
  t.textContent=msg;
  t.className=`toast show ${type}`;
  if(_toastTimer)clearTimeout(_toastTimer); // 이전 타이머가 남아있으면 새 메시지를 조기에 지워버리는 문제 방지
  const duration=type==='err'?9000:4000; // 에러 메시지는 읽을 시간을 더 준다
  _toastTimer=setTimeout(()=>{t.className='toast';_toastTimer=null;},duration);
}
function showModal(id){$(id).classList.add('open');}
function hideModal(id){$(id).classList.remove('open');}
// Supabase는 공통 모듈 SupabaseUtil 사용 (init은 DOMContentLoaded에서)
const sbClient=()=>SupabaseUtil.getClient();
