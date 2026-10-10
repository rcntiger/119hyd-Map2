/* 119hyd-Map2 · js/pick.js — 개별 선택 후 지도에 표시 · 조 재배정 */
AppFiles.reg('js/pick.js','v3.5.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ━━ 개별 선택 후 지도에 표시 ━━
function togglePickMode(){
  pickMode=!pickMode;
  if(!pickMode)pickedIds.clear(); // 선택 모드 취소 시 담아둔 선택도 초기화
  document.getElementById('pickModeBtn')?.classList.toggle('active',pickMode);
  document.getElementById('pickBar').style.display=pickMode?'flex':'none';
  updatePickCount();
  renderList(); // 체크박스 유무가 바뀌므로 목록 다시 그림
}
function togglePicked(id){
  if(pickedIds.has(id))pickedIds.delete(id);else pickedIds.add(id);
  updatePickCount();
  // 체크박스만 즉시 갱신 (전체 renderList는 무겁고, 체크 반응이 느려 보일 수 있음)
  const idx=items.findIndex(d=>d.id===id);
  if(idx>-1){
    const chk=document.querySelector(`#item-${idx} .pick-chk`);
    if(chk)chk.checked=pickedIds.has(id);
  }
}
function updatePickCount(){
  const el=document.getElementById('pickCount');
  if(el)el.textContent=`${pickedIds.size}개 선택됨`;
}
// 현재 검색어/그룹 필터로 걸러진(화면에 보이는) 항목을 한 번에 전부 담는다.
// 예: 검색창에 "지상식"을 검색하거나 그룹 필터로 "1조"를 고른 뒤 이 버튼을 누르면 그 결과 전체가 선택됨.
function pickSelectAllVisible(){
  let n=0;
  items.forEach(d=>{if(!isListHidden(d)&&!pickedIds.has(d.id)){pickedIds.add(d.id);n++;}});
  updatePickCount();
  renderList();
  if(n)showToast(`${n}개 추가로 선택됨 (총 ${pickedIds.size}개)`,'ok');
  else showToast('추가할 항목이 없습니다 (이미 다 선택됨)','err');
}
function showRegroupModal(){
  if(!requireAdmin())return;
  if(!pickedIds.size){showToast('먼저 옮길 소화전을 선택하세요','err');return;}
  const picked=items.filter(d=>pickedIds.has(d.id));
  const from=[...new Set(picked.map(d=>d.group_name||'(미지정)'))];
  document.getElementById('regroupInfo').textContent=`선택 ${picked.length}개 (현재: ${from.slice(0,4).join(', ')}${from.length>4?' 외':''})`;
  document.getElementById('regroupSel').innerHTML=groups.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('')+'<option value="__new">+ 새 조 이름 입력</option>';
  document.getElementById('regroupNew').value='';
  document.getElementById('regroupNew').style.display=groups.length?'none':'block';
  if(!groups.length)document.getElementById('regroupSel').value='__new';
  showModal('regroupModal');
}
async function applyRegroup(){
  if(!requireAdmin())return;
  const sel=document.getElementById('regroupSel').value;
  let to=sel==='__new'?document.getElementById('regroupNew').value.trim().replace(/\s+/g,' '):sel;
  if(!to){showToast('옮길 조 이름을 입력하세요','err');return;}
  const picked=items.filter(d=>pickedIds.has(d.id)&&(d.group_name||'')!==to);
  if(!picked.length){showToast('이미 모두 그 조입니다','');hideModal('regroupModal');return;}
  const btn=document.getElementById('regroupBtn');btn.disabled=true;
  let ok=0,fail=0;
  for(let n=0;n<picked.length;n++){
    const d=picked[n];
    showToast(`조 변경 중… ${n+1}/${picked.length}`,'');
    try{
      const from=d.group_name||'';
      await SupabaseUtil.update('hydmap_items',{group_name:to},{id:d.id});
      d.group_name=to;ok++;
      logHistory(d,'조 변경',{from,to});
    }catch(e){fail++;console.error('조 변경 실패',d.name,e);}
  }
  btn.disabled=false;
  hideModal('regroupModal');
  // 그룹 목록·색·마커·목록 다시 그리기
  groups=[...new Set(items.map(d=>String(d.group_name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko',{numeric:true,sensitivity:'base'}));
  resetGroupColors();groups.forEach(g=>groupColor({group_name:g}));
  buildGroupFilter();renderAllMarkers();renderList();applyFilter();updateStats();
  showToast(fail?`${ok}개 변경 · 실패 ${fail}개 (구역 전환 SQL 실행 여부 확인)`:`${ok}개를 "${to}"(으)로 옮겼습니다. 홈에서 세분계획 갱신을 누르세요`,fail?'err':'ok');
}
function pickClearAll(){
  pickedIds.clear();
  updatePickCount();
  renderList();
}
function applyPickedFilter(){
  if(!pickedIds.size){showToast('선택된 소화전이 없습니다','err');return;}
  pickedFilterActive=true;
  pickMode=false;
  document.getElementById('pickModeBtn')?.classList.remove('active');
  document.getElementById('pickBar').style.display='none';
  const pill=document.getElementById('pickedActivePill');
  document.getElementById('pickedActiveText').textContent=`🗺 선택한 ${pickedIds.size}개만 표시 중`;
  pill.style.display='flex';
  renderList();
  applyFilter();
  // 선택한 소화전들이 다 보이도록 지도 범위를 맞춤
  const visible=items.filter(d=>pickedIds.has(d.id)&&d.lat&&d.lng);
  if(visible.length&&kakaoMap){
    const bounds=new kakao.maps.LatLngBounds();
    visible.forEach(d=>bounds.extend(new kakao.maps.LatLng(d.lat,d.lng)));
    kakaoMap.setBounds(bounds);
  }
  showToast(`${pickedIds.size}개 소화전을 지도에 표시합니다`,'ok');
}
function clearPickedFilter(){
  pickedFilterActive=false;
  pickedIds.clear();
  document.getElementById('pickedActivePill').style.display='none';
  renderList();
  applyFilter();
}
