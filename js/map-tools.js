/* 119hyd-Map2 · js/map-tools.js — 지도 도구: 확대/축소 · 툴팁 · 이름표 · 위성 · 거리재기 */
AppFiles.reg('js/map-tools.js','v3.10.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ━━ 위성 ━━
function mapZoomIn(){if(kakaoMap)kakaoMap.setLevel(kakaoMap.getLevel()-1,{animate:true});}
function mapZoomOut(){if(kakaoMap)kakaoMap.setLevel(kakaoMap.getLevel()+1,{animate:true});}

function toggleTooltip(){
  tooltipOn=!tooltipOn;
  safeStorage.set('hy_tooltip_on',tooltipOn?'1':'0');
  _applyTooltipBtn();
  if(!tooltipOn&&_sharedTooltip)_sharedTooltip.style.opacity='0';
}
function _applyTooltipBtn(){
  document.getElementById('btnTipToggle')?.classList.toggle('on',tooltipOn);
  const t=document.getElementById('btnTipToggleTxt');
  if(t)t.textContent=tooltipOn?' 툴팁 ON':' 툴팁 OFF';
}

// ━━ 이름표 투명/불투명 (PC 전용) ━━
// 투명: 이름표의 흰 바탕·테두리를 없애고 글자만 남김 (글자 둘레에 흰 테를 둘러 지도 위에서도 읽히게). 지도가 덜 가려진다.
// body에 class를 붙이는 방식이라 이미 그려진 이름표에도 바로 적용된다. 휴대폰 화면에는 적용하지 않는다(css 참고).
let labelClear=safeStorage.get('hy_label_clear')==='1';
function toggleLabelClear(){
  labelClear=!labelClear;
  safeStorage.set('hy_label_clear',labelClear?'1':'0');
  _applyLabelClear();
}
function _applyLabelClear(){
  document.body.classList.toggle('lbl-clear',labelClear);
  document.getElementById('btnLabelClear')?.classList.toggle('on',labelClear);
  const t=document.getElementById('btnLabelClearTxt');
  if(t)t.textContent=labelClear?' 이름표 투명':' 이름표 불투명';
}

function toggleLabelVisibility(){
  labelsOn=!labelsOn;
  const btn=document.getElementById('btnLabelToggle');
  const txt=document.getElementById('btnLabelToggleTxt');
  if(btn)btn.classList.toggle('on',labelsOn);
  if(txt)txt.textContent=labelsOn?' 이름 ON':' 이름 OFF';
  Object.entries(overlays).forEach(([i,o])=>{
    if(!o.labelOverlay)return;
    const hide=!items[i]||isHidden(items[i]);
    _ovSet(o.labelOverlay,!hide&&_labelWanted(items[i])&&!_labelFar); // 일괄 위치수정 중인 마커는 '이름 OFF'여도 번호 유지
  });
  scheduleLabelLayout();
}
function toggleSat(){satMode=!satMode;const btn=document.getElementById('btnSat');if(satMode){kakaoMap.setMapTypeId(kakao.maps.MapTypeId.HYBRID);btn.classList.add('on-sat');btn.innerHTML='🗺️<span class="btn-txt"> 일반</span>';}else{kakaoMap.setMapTypeId(kakao.maps.MapTypeId.ROADMAP);btn.classList.remove('on-sat');btn.innerHTML='🛰️<span class="btn-txt"> 위성</span>';}}

// ━━ 거리재기 ━━
function toggleDist(){if(!distMode&&rvMode){showToast('로드뷰를 먼저 종료하세요','err');return;}distMode=!distMode;const btn=document.getElementById('btnDist');if(distMode){btn.classList.add('on');btn.innerHTML='📏<span class="btn-txt"> 측정 중...</span>';document.getElementById('distInfo').style.display='block';document.getElementById('btnDistClear').style.display='block';kakaoMap.setCursor('crosshair');}else finishDist();}
function addDistMarker(pos){const el=document.createElement('div');el.style.cssText='width:8px;height:8px;border-radius:50%;background:#2f81f7;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)';const o=new kakao.maps.CustomOverlay({position:pos,content:el,zIndex:50});o.setMap(kakaoMap);distMarkers.push(o);}
function updateDistLine(){if(distLine)distLine.setMap(null);if(distPath.length<2)return;distLine=new kakao.maps.Polyline({map:kakaoMap,path:distPath,strokeWeight:3,strokeColor:'#2f81f7',strokeOpacity:.9,strokeStyle:'solid'});const m=Math.round(distLine.getLength());document.getElementById('distVal').textContent=m>=1000?(m/1000).toFixed(2)+'km':m+'m';}
function finishDist(){distMode=false;document.getElementById('btnDist').classList.remove('on');document.getElementById('btnDist').innerHTML='📏<span class="btn-txt"> 거리재기</span>';if(kakaoMap)kakaoMap.setCursor('');}
function clearDist(){if(distLine){distLine.setMap(null);distLine=null;}distMarkers.forEach(m=>m.setMap(null));distMarkers=[];distPath=[];document.getElementById('distVal').textContent='0';document.getElementById('distInfo').style.display='none';document.getElementById('btnDistClear').style.display='none';finishDist();}
