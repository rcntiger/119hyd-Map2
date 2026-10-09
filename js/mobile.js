/* 119hyd-Map2 · js/mobile.js — 모바일 지도/목록 전환 */
AppFiles.reg('js/mobile.js','v3.2.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ━━ 모바일 ━━
// 모바일 "지도보기" 모드에서는 상단 헤더(뒤로/점검자/날짜/엑셀업로드 바)를 숨겨서
// 화면을 지도에 최대한 할애한다. 목록 보기로 돌아오면 다시 표시.
function updateMobHeaderVisibility(){
  const header=document.getElementById('mapHeader');
  if(!header)return;
  const isMobile=window.innerWidth<=600;
  header.style.display=(isMobile&&mobMapMode)?'none':'flex';
}
function toggleMobView(){
  mobMapMode=!mobMapMode;
  document.getElementById('sidebar').classList.toggle('map-mode',mobMapMode);
  document.getElementById('mobToggle').textContent=mobMapMode?'📋 목록 보기':'🗺️ 지도 보기';
  const backBtn=document.getElementById('backBtn');
  if(backBtn&&window.innerWidth<=600)backBtn.textContent=mobMapMode?'← 이전':'← 이전 화면';
  const isMobile=window.innerWidth<=768;
  if(isMobile){
    document.getElementById('mapToolbar').style.display=mobMapMode?'flex':'none';
    document.getElementById('mapToolbarTop').style.display=mobMapMode?'flex':'none';
    document.body.style.overflowX=mobMapMode?'':'hidden';
  }
  updateMobHeaderVisibility();
  if(mobMapMode&&kakaoMap){
    const center=kakaoMap.getCenter();
    const level=kakaoMap.getLevel();
    const restore=()=>{
      kakaoMap.relayout();
      // 마커가 있으면 마커 영역에 맞추고, 없으면 기존 위치 복원
      if(items.some(d=>d.lat&&d.lng))fitAll();
      else{kakaoMap.setCenter(center);kakaoMap.setLevel(level);}
    };
    setTimeout(restore,50);
    setTimeout(restore,250);
    setTimeout(restore,500);
  }else if(kakaoMap){
    // 목록 보기로 돌아갈 때도 헤더가 다시 나타나 지도 영역이 줄어드므로 relayout
    setTimeout(()=>kakaoMap.relayout(),50);
  }
}

function switchToMapMode(){
  if(!mobMapMode){
    mobMapMode=true;
    document.getElementById('sidebar').classList.add('map-mode');
    document.getElementById('mobToggle').textContent='📋 목록 보기';
    const backBtn=document.getElementById('backBtn');
    if(backBtn&&window.innerWidth<=600)backBtn.textContent='← 이전';
    document.getElementById('mapToolbar').style.display='flex';
    document.getElementById('mapToolbarTop').style.display='flex';
    document.body.style.overflowX='';
    updateMobHeaderVisibility();
    if(kakaoMap){
      const center=kakaoMap.getCenter();
      const level=kakaoMap.getLevel();
      setTimeout(()=>{kakaoMap.relayout();kakaoMap.setCenter(center);kakaoMap.setLevel(level);},50);
      setTimeout(()=>{kakaoMap.relayout();kakaoMap.setCenter(center);kakaoMap.setLevel(level);},200);
      setTimeout(()=>{kakaoMap.relayout();kakaoMap.setCenter(center);kakaoMap.setLevel(level);},500);
    }
  }
}
