/* 119hyd-Map2 · js/nocoord.js — 좌표 없는 소화전: 위치 지정 · 지도 없이 정보카드 · 모아 보기(좌표없음/겹친 위치) 버튼 */
AppFiles.reg('js/nocoord.js','v3.2.3'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 모아 보기 (목록 위 버튼) ══════════
   ''        : 평소
   'nocoord' : 좌표 없는 소화전만 — 목록만 거른다 (지도는 그대로 두어, 위치를 지정하면 마커가 바로 보이게)
   'overlap' : 같은 자리에 겹친 소화전만 — 목록과 지도 모두 (겹친 것만 남겨 위치를 고치기 쉽게)
   인쇄 미리보기·선택 표시 중에는 적용하지 않는다 (filter.js의 isHidden / isListHidden 참고) */
let quickFilter='';

function ncCount(){return items.filter(d=>!(d.lat&&d.lng)&&!_baseHidden(d)).length;}
function setQuickFilter(k){
  quickFilter=quickFilter===k?'':k;
  closeIw();
  applyFilter();
}
function updateQuickChips(){
  const row=document.getElementById('quickRow');if(!row)return;
  const nc=ncCount(), st=ovlStackCount();
  if(!nc&&!st.groups&&!quickFilter){row.style.display='none';row.innerHTML='';return;}
  const chip=(k,on,label,title)=>`<button class="fbtn quick-chip${on?' active':''}" onclick="setQuickFilter('${k}')" title="${title}">${label}${on?' ✕':''}</button>`;
  row.innerHTML=
    (nc||quickFilter==='nocoord'?chip('nocoord',quickFilter==='nocoord',`📍 좌표없음 ${nc}개`,'좌표가 없어 지도에 표시되지 않는 소화전만 목록에 보기'):'')
   +(st.groups||quickFilter==='overlap'?chip('overlap',quickFilter==='overlap',`⧉ 겹친 위치 ${st.groups}곳 (${st.items}개)`,'같은 자리에 겹쳐 찍힌 소화전만 목록과 지도에 보기'):'');
  row.style.display='flex';
}

/* ══════════ 위치 지정 (좌표 없는 소화전) ══════════
   기존 '위치 수정' 모드를 그대로 쓴다: 지도를 누르거나 현위치(GPS) → 확인 → 저장 → 마커가 새로 생긴다.
   지도에 마커(와 그 안의 작은 안내 카드)가 없으므로, 지도 위쪽에 안내 줄(#placeBar)을 대신 띄운다. */
function startPlaceLocation(idx){
  const d=items[idx];if(!d)return;
  if(!kakaoMap){showToast('지도가 준비되지 않았습니다','err');return;}
  if(_bf){showToast('일괄 위치수정을 먼저 종료하세요','err');return;}
  if(_area){showToast('인쇄 영역 지정을 먼저 끝내세요','err');return;}
  if(d.lat&&d.lng&&overlays[idx]){startFixLocation(idx);return;} // 이미 좌표가 있으면 평소의 위치 수정
  const go=()=>{
    closeIw();
    if(fixLocationIdx>=0&&fixLocationIdx!==idx)startFixLocation(fixLocationIdx); // 다른 소화전을 수정 중이었다면 먼저 취소
    if(fixLocationIdx!==idx)startFixLocation(idx);
    setActive(idx);
  };
  // 모바일: 목록 화면이면 지도 화면으로 바꾼 뒤 시작
  if(window.innerWidth<=600){switchToMapMode();setTimeout(go,560);}
  else go();
}
// 위치 지정 안내 줄: 마커가 없는 소화전의 위치를 지정하는 동안에만 보인다
function syncPlaceBar(){
  const bar=document.getElementById('placeBar');if(!bar)return;
  const idx=fixLocationIdx, d=idx>=0?items[idx]:null;
  if(!d||overlays[idx]){bar.style.display='none';return;}
  document.getElementById('placeBarName').textContent=d.name;
  const addr=(d.address||'').replace(/^서울특별시\s*/,'');
  document.getElementById('placeBarAddr').textContent=addr?`주소: ${addr}`:'주소 정보 없음';
  bar.style.display='flex';
}

/* ══════════ 지도 없이 정보카드 열기 ══════════
   좌표가 없으면 마커가 없어 정보카드(점검 입력·완료·메모·사진)를 열 길이 없었다.
   → 목록에서 누르면 화면 가운데에 같은 카드를 띄운다. 카드 내용은 marker.js의 renderPopup을 그대로 쓴다. */
let _ncIdx=-1;
function _ncEls(create){
  let bg=document.getElementById('ncCardBg');
  if(!bg&&create){
    bg=document.createElement('div');
    bg.id='ncCardBg';bg.className='nc-card-bg';
    bg.innerHTML='<div class="nc-card-box"><div class="nc-card-note" id="ncCardNote"></div><div class="iw-wrap" id="ncCardEl"></div></div>';
    bg.addEventListener('click',e=>{if(e.target===bg)ncCloseCard();});
    document.body.appendChild(bg);
  }
  return bg?{bg,note:document.getElementById('ncCardNote'),el:document.getElementById('ncCardEl')}:null;
}
function ncOpenCard(idx){
  const d=items[idx];if(!d)return;
  closeIw(); // 지도에 열린 카드·겹침 선택 창·이전 가운데 카드를 모두 닫음
  const e=_ncEls(true);
  _ncIdx=idx;
  e.note.innerHTML=`📍 좌표가 없어 지도에 표시되지 않습니다. 점검 내용은 여기서 입력할 수 있습니다.`;
  renderPopup(e.el,idx,d,null);
  e.el.scrollTop=0;
  e.bg.classList.add('open');
  setActive(idx);
}
// hyReRender(점검 입력 버튼을 누를 때마다 카드 다시 그리기)가 지도 카드가 없는 항목에 대해 부른다
function ncReRender(idx){
  if(_ncIdx!==idx)return;
  const d=items[idx], e=_ncEls(false);
  if(d&&e)renderPopup(e.el,idx,d,null);
}
function ncCloseCard(){
  if(_ncIdx<0)return;
  const idx=_ncIdx, d=items[idx], e=_ncEls(false);
  // 입력 후 2초 뒤 자동 저장되는 메모가 아직 저장 전이면, 카드가 사라지기 전에 지금 저장
  const ta=document.getElementById(`memo-${idx}`);
  const saving=(d&&ta&&ta.value.trim()!==(memoMap[d.id]||''))?saveMemoNow(idx):null; // 메모 글자는 이 줄에서 바로 읽어 감
  _ncIdx=-1;
  if(e){e.bg.classList.remove('open');e.el.innerHTML='';} // 같은 id가 지도 카드와 겹치지 않도록 비움
  updateListItem(idx); // 목록의 상태 표시(결과·메모·사진 수) 갱신
  if(saving)saving.then(()=>{if(items[idx]===d)updateListItem(idx);}).catch(()=>{}); // 메모 저장이 끝나면 한 번 더
}
