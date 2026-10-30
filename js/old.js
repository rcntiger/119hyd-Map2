/* 119hyd-Map2 · js/old.js — 노후 소화전 표시 (기준일보다 먼저 설치된 소화전) */
AppFiles.reg('js/old.js','v3.12.1'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 노후 소화전 ══════════
   올린 엑셀의 '설치년도'(설치연도·설치일자·설치년월일 등 '설치'가 들어간 칸) 값을 읽어,
   설치 후 N년(기본 30년) 이상 지난 소화전을 '노후'로 표시한다 (v3.12.1 — 고정 기준일 대신 오늘에서 N년 전으로 자동 계산).
   예: 2026.10.30에 30년 → 1996.10.30 이전(당일 포함) 설치. 연도만 있으면 그해 1월 1일로 보므로 1996년 설치까지 노후.
     · 지도: 마커 둘레에 주황 테두리   · 목록: '⏳ 노후 (1993)' 꼬리표   · 정보카드: 설치년도 옆 '노후'
     · 목록 위 '⏳ 노후 N개' 버튼: 노후 소화전만 목록과 지도에 보기
   폐전 소화전은 노후로 세지 않는다. 설치 정보가 없으면 판단하지 않는다(개수는 따로 알려 줌).
   켜기/끄기와 년수는 이 기기 브라우저에 기억한다. 데이터(DB)는 바꾸지 않는다. */
let oldOn=safeStorage.get('hy_old_on')==='1';
let oldYears=(()=>{const n=parseInt(safeStorage.get('hy_old_years','30'),10);return n>=1&&n<=100?n:30;})();

// 설치 정보가 든 칸 찾기: 이름에 '설치'가 들어간 추가정보 ('_'로 시작하는 내부 값 제외). 연도 칸을 먼저.
function _oldInstallRaw(d){
  if(!d||!d.extra)return null;
  const keys=Object.keys(d.extra).filter(k=>!String(k).startsWith('_')&&/설치/.test(String(k).replace(/\s/g,'')));
  if(!keys.length)return null;
  keys.sort((a,b)=>(/(연|년)도$/.test(b)?1:0)-(/(연|년)도$/.test(a)?1:0));
  for(const k of keys){const v=d.extra[k];if(v!==null&&v!==undefined&&String(v).trim()!=='')return v;}
  return null;
}
// 글자 → {y,m,d} (월·일은 없을 수 있음). 엑셀 날짜 숫자(예: 34700), 19950312, 1995.03.12, 1995-3, 1995년 3월, 95 등
function _oldParse(v){
  const s=String(v).trim();
  if(!s)return null;
  let y,m,dd;
  if(/^\d{5}(\.\d+)?$/.test(s)){ // 엑셀 날짜 숫자
    const n=parseFloat(s);if(n<1000||n>80000)return null;
    const dt=new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000);
    y=dt.getUTCFullYear();m=dt.getUTCMonth()+1;dd=dt.getUTCDate();
  }else{
    let k=s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if(k){y=+k[1];m=+k[2];dd=+k[3];}
    else if((k=s.match(/^(\d{4})\s*(?:[.\-\/년]\s*(\d{1,2})\s*(?:[.\-\/월]\s*(\d{1,2}))?)?/))){y=+k[1];m=k[2]?+k[2]:null;dd=k[3]?+k[3]:null;}
    else if((k=s.match(/^(\d{2})\s*(?:년)?$/))){const yy=+k[1];y=yy>=50?1900+yy:2000+yy;}
    else return null;
  }
  if(!(y>=1900&&y<=2100))return null;
  if(m&&!(m>=1&&m<=12))m=null;
  if(dd&&!(dd>=1&&dd<=31))dd=null;
  return {y,m,d:dd};
}
// 설치일(알 수 있는 만큼). 연도만 있으면 그해 1월 1일로 본다.
const _oldCache=new WeakMap(); // 소화전 → {extra, info}
function installInfo(d){
  const c=_oldCache.get(d);
  if(c&&c.extra===d.extra)return c.info;
  const raw=_oldInstallRaw(d), p=raw==null?null:_oldParse(raw);
  const info=p?{...p,date:new Date(p.y,(p.m||1)-1,p.d||1),text:p.m?`${p.y}.${p.m}${p.d?'.'+p.d:''}`:String(p.y)}:null;
  _oldCache.set(d,{extra:d.extra,info});
  return info;
}
// 기준일 = 오늘에서 N년 전 (이 날까지 설치된 것이 N년 이상)
function _oldCutoffDate(){const t=new Date();return new Date(t.getFullYear()-oldYears,t.getMonth(),t.getDate());}
// 노후 여부 (표시가 꺼져 있어도 판단은 함 — 표시할지는 oldOn으로)
function isOldRaw(d){
  if(!d||isClosed(d))return false;
  const i=installInfo(d);
  return !!(i&&i.date<=_oldCutoffDate()); // 기준일 당일 설치도 N년 이상
}
function isOld(d){return oldOn&&isOldRaw(d);}
function oldCount(){return items.filter(d=>isOldRaw(d)&&!_baseHidden(d)).length;}
function oldUnknownCount(){return items.filter(d=>!isClosed(d)&&!installInfo(d)&&!_baseHidden(d)).length;}

// 마커 테두리 맞추기 (화면 밖이라 지도에서 빠져 있는 마커도 요소를 직접 고친다)
function oldSyncMarkers(){
  Object.entries(overlays).forEach(([i,o])=>{
    const el=o.overlay?.getContent?.();if(!el||!items[i])return;
    el.classList.toggle('old',isOld(items[i]));
  });
}
// 켜기/끄기·기준일이 바뀐 뒤: 마커 · 목록 꼬리표 · 열린 카드 · 모아 보기 버튼
function oldApply(){
  if(!oldOn&&quickFilter==='old')quickFilter='';
  oldSyncMarkers();
  renderList();
  applyFilter();
  if(activeIdx>=0&&overlays[activeIdx]?.popupRendered)hyReRender(activeIdx);
  _oldPanelInfo();
  document.getElementById('btnOld')?.classList.toggle('on',oldOn);
}

/* ── 설정 창 (지도 위쪽 도구의 '⏳ 노후' 버튼) ── */
function toggleOldPanel(){
  const w=document.getElementById('oldPanel'),btn=document.getElementById('btnOld');
  if(!w||!btn)return;
  if(w.style.display==='flex'){w.style.display='none';return;}
  // 버튼 바로 아래에 (검색창과 같은 방식)
  const wrap=document.querySelector('.map-wrap');
  if(wrap){
    const wr=wrap.getBoundingClientRect(),br=btn.getBoundingClientRect();
    let left=br.left-wr.left;const maxLeft=wr.width-266;if(left>maxLeft)left=Math.max(10,maxLeft);
    w.style.left=left+'px';w.style.top=(br.bottom-wr.top+6)+'px';
  }
  document.getElementById('oldOnChk').checked=oldOn;
  document.getElementById('oldYearsInp').value=oldYears;
  _oldYearsHint();
  _oldPanelInfo();
  w.style.display='flex';
}
function closeOldPanel(){const w=document.getElementById('oldPanel');if(w)w.style.display='none';}
function setOldOn(on){
  oldOn=!!on;safeStorage.set('hy_old_on',oldOn?'1':'0');
  oldApply();
  if(oldOn){
    const n=oldCount();
    showToast(n?`⏳ 설치 후 ${oldYears}년 이상(${_oldCutoffText()} 이전 설치) 소화전 ${n}개를 주황 테두리로 표시합니다`:`설치 후 ${oldYears}년 이상 된 소화전이 없습니다`+(oldUnknownCount()?' (설치 정보가 없는 소화전은 판단하지 않음)':''),n?'ok':'');
  }
}
function setOldYears(v){
  const n=parseInt(v,10);
  if(!(n>=1&&n<=100)){showToast('년수는 1~100 사이로 넣어 주세요','err');document.getElementById('oldYearsInp').value=oldYears;return;}
  oldYears=n;safeStorage.set('hy_old_years',String(n));
  if(!oldOn){oldOn=true;safeStorage.set('hy_old_on','1');document.getElementById('oldOnChk').checked=true;} // 년수를 바꾸면 바로 보이게
  _oldYearsHint();
  oldApply();
}
function _oldCutoffText(){const t=_oldCutoffDate();return `${t.getFullYear()}.${t.getMonth()+1}.${t.getDate()}`;}
// '30년 이상 · 1996.10.30 이전 설치' (인쇄 제목·안내에 씀)
function _oldBasisText(){return `${oldYears}년 이상 · ${_oldCutoffText()} 이전 설치`;}
function _oldYearsHint(){const el=document.getElementById('oldYearsHint');if(el)el.textContent=`(${_oldCutoffText()} 이전 설치)`;}
function _oldPanelInfo(){
  const el=document.getElementById('oldPanelInfo');if(!el)return;
  if(!items.length){el.textContent='';return;}
  const n=oldCount(),u=oldUnknownCount();
  el.innerHTML=`${oldYears}년 이상 <b style="color:#f97316">${n}개</b>`
    +(u?` · 설치 정보 없음 ${u}개`:'')
    +(n?` <button class="old-only-btn" onclick="setQuickFilter('old');closeOldPanel()">${quickFilter==='old'?'전체 보기':'노후만 보기'}</button>`:'');
}
