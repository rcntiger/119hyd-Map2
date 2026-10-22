/* 119hyd-Map2 · js/record.js — 완료 토글 · 점검일 · 메모 */
AppFiles.reg('js/record.js','v3.11.1'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ━━ 완료 토글 ━━
async function toggleDone(idx){
  const d=items[idx];if(!d||!currentProject)return;
  const isDone=!!doneMap[d.id];
  try{
    if(isDone){
      // 취소
      await SupabaseUtil.remove('hydmap_done',{item_id:d.id});
      delete doneMap[d.id];
      logHistory(d,'완료 취소');
      showToast('점검완료 취소','');
    }else{
      // 완료
      const now=new Date().toISOString();
      await SupabaseUtil.upsert('hydmap_done',{item_id:d.id,inspection_id:currentProject.id,done_at:now},'item_id');
      doneMap[d.id]={done_at:now};showToast('점검완료 ✓','ok');
      logHistory(d,'점검 완료');
    }
  }catch(e){showToast('저장 실패','err');return;}
  // UI 갱신
  const newDone=!!doneMap[d.id];
  const btn=document.getElementById(`doneBtn-${idx}`);
  if(btn){btn.textContent=newDone?'✓ 점검 완료 (취소)':'점검 완료시 클릭';btn.classList.toggle('is-done',newDone);}
  const btnTop=document.getElementById(`doneBtnTop-${idx}`);
  if(btnTop){btnTop.textContent=newDone?'✓ 완료(취소)':'완료시 클릭';btnTop.classList.toggle('is-done',newDone);}
  const badge=document.querySelector(`#doneBtnTop-${idx}`)?.closest('.iw-wrap')?.querySelector('.iw-team-badge');
  if(badge){
    badge.textContent=newDone?'점검 완료':(d.group_name||'점검 대상');
    badge.classList.toggle('done',newDone);
  }
  const dateRow=document.getElementById(`dateRow-${idx}`);
  if(dateRow){
    dateRow.style.display=newDone?'flex':'none';
    const inp=dateRow.querySelector('input');
    if(inp&&newDone)inp.value=localDate(doneMap[d.id]?.done_at);
  }
  // 마커는 화면 밖이거나 축소 중이면 문서에서 빠져 있어 id로 못 찾으므로, 오버레이가 가진 요소를 직접 고친다 (v3.10.1)
  const mk=overlays[idx]?.overlay?.getContent?.();if(mk)mk.classList.toggle('done',newDone);
  const item=document.getElementById(`item-${idx}`);if(item)item.classList.toggle('done-item',newDone);
  updateStats();
}
async function updateDoneDate(idx,dateStr){
  const d=items[idx];if(!d||!doneMap[d.id]||!dateStr)return;
  const iso=localDateToIso(dateStr); // 고른 날짜의 정오 — 어느 시간대에서 읽어도 같은 날짜 (v3.10.1)
  try{await SupabaseUtil.update('hydmap_done',{done_at:iso},{item_id:d.id});}
  catch(e){showToast('날짜 저장 실패: '+(e?.message||''),'err');return;}
  doneMap[d.id].done_at=iso;
  logHistory(d,'완료일 변경',{to:dateStr});
  showToast('날짜 수정됨','ok');
}

// ━━ 메모 ━━
// 입력하고 2초 멈추면 자동 저장. 저장 전 글자는 _memoDraft(소화전 id → 글자)에 따로 둔다 (v3.10.1).
// 예전엔 글자가 카드의 입력칸에만 있어서, 2초 안에 ① 카드를 닫거나 ② 도색·사용가부 등을 눌러 카드가 다시 그려지거나
// ③ 다른 계획·홈으로 가면 입력한 메모가 저장되지 않고 사라졌다.
const _memoDraft={};
function memoShown(d){return _memoDraft[d.id]!==undefined?_memoDraft[d.id]:(memoMap[d.id]||'');} // 카드에 보일 메모
function onMemoInput(idx,el){
  if(el.value.length>300)el.value=el.value.slice(0,300);
  const d=items[idx];if(d)_memoDraft[d.id]=el.value;
  const len=document.getElementById(`memoLen-${idx}`);if(len)len.textContent=el.value.length+'/300자';
  const st=document.getElementById(`memoSt-${idx}`);if(st)st.textContent='✏️ 입력 중...';
  clearTimeout(memoTimers[idx]);
  memoTimers[idx]=setTimeout(()=>saveMemoNow(idx),2000);
}
async function saveMemoNow(idx){
  clearTimeout(memoTimers[idx]);delete memoTimers[idx];
  const d=items[idx];if(!d||!currentProject)return;
  const el=document.getElementById(`memo-${idx}`);
  const raw=el?el.value:_memoDraft[d.id]; // 카드가 닫혔으면 따로 둔 글자로
  if(raw===undefined)return;
  const text=raw.trim(), pid=currentProject.id; // 여기까지는 바로 읽어 둔다 (저장 중에 계획이 바뀌어도 원래 계획에 저장)
  const before=memoMap[d.id]||'';
  try{
    await SupabaseUtil.upsert('hydmap_memo',{item_id:d.id,inspection_id:pid,memo:text},'item_id');
  }catch(e){
    const st=document.getElementById(`memoSt-${idx}`);if(st)st.textContent='⚠️ 저장 실패';
    showToast('메모 저장 실패 — 글자는 남아 있으니 💾 저장을 다시 눌러 주세요 ('+(e?.message||'')+')','err');
    return;
  }
  if(_memoDraft[d.id]===raw)delete _memoDraft[d.id]; // 저장하는 동안 더 입력했으면 그 글자는 남겨 둠
  if(currentProject?.id!==pid||items[idx]!==d)return; // 그 사이 다른 계획을 열었으면 화면은 건드리지 않음
  memoMap[d.id]=text;
  if(before!==text)_logMemoChange(d,before,text);
  const st=document.getElementById(`memoSt-${idx}`);
  if(st){st.textContent='✅ 저장됨';setTimeout(()=>{if(st)st.textContent='';},2000);}
  if(document.getElementById(`item-${idx}`))updateListItem(idx); // 목록의 📝 메모 표시
  showToast('메모 저장됨','ok');
}
// 저장을 기다리는 메모를 지금 저장 — 카드를 닫거나 다른 계획·홈으로 가기 직전에 부른다
function flushPendingMemos(){
  Object.keys(memoTimers).forEach(k=>saveMemoNow(+k));
  if(typeof flushPendingAutoSaves==='function')flushPendingAutoSaves(); // 점검 입력 자동 저장도 (hydrant-form.js)
}
async function deleteMemoNow(idx){
  if(!confirm('메모를 삭제하시겠습니까?'))return;
  const d=items[idx];if(!d)return;
  clearTimeout(memoTimers[idx]);delete memoTimers[idx];
  const before=memoMap[d.id]||'';
  try{await SupabaseUtil.remove('hydmap_memo',{item_id:d.id});}
  catch(e){showToast('메모 삭제 실패: '+(e?.message||''),'err');return;}
  memoMap[d.id]='';delete _memoDraft[d.id];
  _flushMemoHist(d.id);
  if(before)logHistory(d,'메모 삭제',{from:before});
  const el=document.getElementById(`memo-${idx}`);if(el)el.value='';
  const len=document.getElementById(`memoLen-${idx}`);if(len)len.textContent='0/300자';
  const st=document.getElementById(`memoSt-${idx}`);if(st){st.textContent='🗑 삭제됨';setTimeout(()=>{if(st)st.textContent='';},2000);}
  if(document.getElementById(`item-${idx}`))updateListItem(idx);
  showToast('메모 삭제됨','ok');
}
