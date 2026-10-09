/* 119hyd-Map2 · js/record.js — 완료 토글 · 점검일 · 메모 */
AppFiles.reg('js/record.js','v3.2.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

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
    if(inp&&newDone)inp.value=new Date().toISOString().slice(0,10);
  }
  const mk=document.getElementById(`mk-${idx}`);if(mk)mk.classList.toggle('done',newDone);
  const item=document.getElementById(`item-${idx}`);if(item)item.classList.toggle('done-item',newDone);
  updateStats();
}
async function updateDoneDate(idx,dateStr){
  const d=items[idx];if(!d||!doneMap[d.id])return;
  const iso=new Date(dateStr).toISOString();
  await SupabaseUtil.update('hydmap_done',{done_at:iso},{item_id:d.id});
  doneMap[d.id].done_at=iso;
  logHistory(d,'완료일 변경',{to:dateStr});
  showToast('날짜 수정됨','ok');
}

// ━━ 메모 ━━
function onMemoInput(idx,el){
  if(el.value.length>300)el.value=el.value.slice(0,300);
  const len=document.getElementById(`memoLen-${idx}`);if(len)len.textContent=el.value.length+'/300자';
  const st=document.getElementById(`memoSt-${idx}`);if(st)st.textContent='✏️ 입력 중...';
  clearTimeout(memoTimers[idx]);
  memoTimers[idx]=setTimeout(()=>saveMemoNow(idx),2000);
}
async function saveMemoNow(idx){
  clearTimeout(memoTimers[idx]);
  const d=items[idx];if(!d||!currentProject)return;
  const el=document.getElementById(`memo-${idx}`);if(!el)return;
  const text=el.value.trim();
  const before=memoMap[d.id]||'';
  await SupabaseUtil.upsert('hydmap_memo',{item_id:d.id,inspection_id:currentProject.id,memo:text},'item_id');
  memoMap[d.id]=text;
  if(before!==text)_logMemoChange(d,before,text);
  const st=document.getElementById(`memoSt-${idx}`);
  if(st){st.textContent='✅ 저장됨';setTimeout(()=>{if(st)st.textContent='';},2000);}
  showToast('메모 저장됨','ok');
}
async function deleteMemoNow(idx){
  if(!confirm('메모를 삭제하시겠습니까?'))return;
  const d=items[idx];if(!d)return;
  const before=memoMap[d.id]||'';
  await SupabaseUtil.remove('hydmap_memo',{item_id:d.id});
  memoMap[d.id]='';
  _flushMemoHist(d.id);
  if(before)logHistory(d,'메모 삭제',{from:before});
  const el=document.getElementById(`memo-${idx}`);if(el)el.value='';
  const len=document.getElementById(`memoLen-${idx}`);if(len)len.textContent='0/300자';
  const st=document.getElementById(`memoSt-${idx}`);if(st){st.textContent='🗑 삭제됨';setTimeout(()=>{if(st)st.textContent='';},2000);}
  showToast('메모 삭제됨','ok');
}
