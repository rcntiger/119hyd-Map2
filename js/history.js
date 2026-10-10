/* 119hyd-Map2 · js/history.js — 변경 이력 (hydmap_history) */
AppFiles.reg('js/history.js','v3.5.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 변경 이력 ══════════
   위치 수정·점검 입력·완료·메모·사진 변경을 hydmap_history 표에 한 줄씩 쌓는다 (수정·삭제 불가, 계속 누적).
   기록 실패는 원래 작업을 막지 않는다 (경고만). */
let _histWarned=false;
// 메모는 입력을 멈출 때마다(2초) 자동 저장되므로, 그때마다 이력을 남기면 한 번 쓰는 데 수십 줄이 쌓였다.
// 같은 소화전의 메모 변경은 30초 동안 모아 "처음 내용 → 마지막 내용" 한 줄로 기록한다.
const _memoHist={};
function _logMemoChange(d,before,after){
  const k=d.id;
  if(!_memoHist[k])_memoHist[k]={d,from:before,pid:currentProject?.id};
  _memoHist[k].to=after;
  clearTimeout(_memoHist[k].t);
  _memoHist[k].t=setTimeout(()=>_flushMemoHist(k),30000);
}
function _flushMemoHist(k){
  const h=_memoHist[k];if(!h)return;
  clearTimeout(h.t);delete _memoHist[k];
  if((h.from||'')!==(h.to||''))logHistory(h.d,'메모',{from:h.from,to:h.to},h.pid);
}
function _flushAllMemoHist(){Object.keys(_memoHist).forEach(_flushMemoHist);}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')_flushAllMemoHist();});
window.addEventListener('pagehide',_flushAllMemoHist);
function logHistory(d,action,detail,pid){
  const insp=pid||currentProject?.id;
  if(!d||!insp)return;
  const row={inspection_id:insp,item_id:d.id,item_name:d.name,action,detail:detail||null,actor:getInspName()||null};
  SupabaseUtil.insert('hydmap_history',row).catch(e=>{
    console.warn('변경 이력 기록 실패',e);
    if(!_histWarned){_histWarned=true;showToast('변경 이력이 기록되지 않았습니다 — Supabase에 hydmap_history 표가 있는지 확인하세요','err');}
  });
}
const _HY_FIELD_LABEL={hydrant_type:'소화전종류',paint:'도색',insul:'보온',protect:'보호틀',roadmark:'노면표시',result:'사용가부',defect_detail:'고장내용'};
function _hyFieldText(k,v){
  if(v===null||v===undefined||v==='')return '-';
  if(k==='hydrant_type')return HY_TYPE_LABEL[v]||v;
  if(k==='paint')return PAINT_LABEL[v]||v;
  if(k==='insul')return INSUL_LABEL[v]||v;
  if(k==='protect')return ({yes:'설치',no:'미설치'})[v]||v;
  return String(v);
}
function _hyDiff(prev,next){
  const ch=[];
  Object.keys(_HY_FIELD_LABEL).forEach(k=>{
    const a=prev?prev[k]:null,b=next[k];
    if((a??'')!==(b??''))ch.push({f:_HY_FIELD_LABEL[k],from:_hyFieldText(k,a),to:_hyFieldText(k,b)});
  });
  return ch;
}
function _histText(h){
  const x=h.detail||{};
  const short=a=>(a||'').replace('서울특별시 금천구 ','');
  switch(h.action){
    case '위치 수정':return `${x.method?`(${esc(x.method)}) `:''}${x.from?`${(+x.from.lat).toFixed(6)}, ${(+x.from.lng).toFixed(6)}`:'-'} → ${(+x.to.lat).toFixed(6)}, ${(+x.to.lng).toFixed(6)}`
      +((x.from?.address||x.to?.address)&&x.from?.address!==x.to?.address?`<br>주소: ${esc(short(x.from?.address)||'-')} → ${esc(short(x.to?.address)||'-')}`:'');
    case '점검 입력':return (x.changes||[]).map(c=>`${esc(c.f)}: ${esc(c.from)} → <b>${esc(c.to)}</b>`).join('<br>')||'-';
    case '메모':return `${esc((x.from||'').slice(0,60))||'(없음)'} → <b>${esc((x.to||'').slice(0,60))||'(없음)'}</b>`;
    case '메모 삭제':return esc((x.from||'').slice(0,80));
    case '완료일 변경':return `→ ${esc(x.to||'')}`;
    case '조 변경':return `${esc(x.from||'(미지정)')} → <b>${esc(x.to||'')}</b>`;
    case '사진 추가':case '사진 삭제':return x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">사진 보기</a>`:'';
    default:return '';
  }
}
function _histTime(t){const d=new Date(t);return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
async function showHistory(idx){
  const d=items[idx];if(!d)return;
  document.getElementById('histTitle').textContent=`📜 변경 이력 — ${d.name}`;
  const body=document.getElementById('histBody');
  body.innerHTML='<div style="color:var(--mt);padding:20px;text-align:center">불러오는 중...</div>';
  showModal('histModal');
  try{
    const rows=await SupabaseUtil.select('hydmap_history',{eq:{item_id:d.id},order:{column:'created_at',ascending:false}});
    if(!rows||!rows.length){body.innerHTML='<div style="color:var(--mt);padding:20px;text-align:center">기록된 변경 이력이 없습니다</div>';return;}
    body.innerHTML=rows.map(h=>`<div style="padding:8px 4px;border-bottom:1px solid var(--bd)">
      <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><span style="color:var(--mt);font-size:11.5px">${_histTime(h.created_at)}</span><b>${esc(h.action)}</b><span style="color:var(--mt);font-size:11.5px">${esc(h.actor||'(점검자 미입력)')}</span></div>
      <div style="margin-top:3px;line-height:1.5">${_histText(h)}</div></div>`).join('');
  }catch(e){
    body.innerHTML=`<div style="color:var(--hi);padding:14px">이력을 불러오지 못했습니다.<br><span style="font-size:11.5px;color:var(--mt)">Supabase에 hydmap_history 표가 만들어져 있는지 확인하세요. (${esc(e?.message||'')})</span></div>`;
  }
}
