/* 119hyd-Map2 · js/roadview.js — 로드뷰 */
AppFiles.reg('js/roadview.js','v3.2.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ RoadView ══════════ */
function setRvMode(on){rvMode=on;const btn=document.getElementById('btnRv');if(on){btn.classList.add('on-rv');btn.innerHTML='🔭<span class="btn-txt"> 위치 클릭...</span>';if(kakaoMap)kakaoMap.setCursor('crosshair');}else{btn.classList.remove('on-rv');btn.innerHTML='🔭<span class="btn-txt"> 로드뷰</span>';if(kakaoMap)kakaoMap.setCursor('');}}
function toggleRvMode(){
  if(!rvMode&&distMode){showToast('거리재기를 먼저 종료하세요','err');return;}
  setRvMode(!rvMode);
  if(rvMode)showToast('지도에서 로드뷰를 볼 위치를 클릭하세요','');
}
function openRvAt(latLng){
  document.getElementById('rvPanel').style.display='flex';
  document.getElementById('rvHint').textContent=`${latLng.getLat().toFixed(5)}, ${latLng.getLng().toFixed(5)}`;
  const tb=document.getElementById('mapToolbar');if(tb)tb.style.top='56px';
  const tbTop=document.getElementById('mapToolbarTop');if(tbTop)tbTop.style.setProperty('display','none','important');
  if(!rvInstance)rvInstance=new kakao.maps.Roadview(document.getElementById('rvMap'));
  if(!rvMinimapInst){
    rvMinimapInst=new kakao.maps.Map(document.getElementById('rvMinimapInner'),{center:latLng,level:3});
    rvOverlay=new kakao.maps.CustomOverlay({position:latLng,content:'<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>',zIndex:10});
    rvOverlay.setMap(rvMinimapInst);
    kakao.maps.event.addListener(rvInstance,'position_changed',()=>{
      const pos=rvInstance.getPosition();
      if(pos&&rvMinimapInst){rvMinimapInst.setCenter(pos);rvOverlay.setPosition(pos);}
    });
  }else{rvMinimapInst.setCenter(latLng);rvOverlay.setPosition(latLng);}
  const client=new kakao.maps.RoadviewClient();
  client.getNearestPanoId(latLng,50,panoId=>{if(panoId)rvInstance.setPanoId(panoId,latLng);else document.getElementById('rvHint').textContent='로드뷰 없음';});
}
function openRvFromPopup(latLng){lastIw=iwOpen;closeIw();openRvAt(latLng);}
function closeRv(){
  document.getElementById('rvPanel').style.display='none';setRvMode(false);
  const tb=document.getElementById('mapToolbar');if(tb)tb.style.top='190px';
  syncMapToolbars();
  minimapOn=false;document.getElementById('rvMinimap').style.display='none';
  const btn=document.getElementById('btnMinimap');if(btn){btn.style.background='';btn.style.color='';}
  if(lastIw&&kakaoMap){lastIw.setMap(kakaoMap);iwOpen=lastIw;lastIw=null;}
}
function toggleMinimap(){
  minimapOn=!minimapOn;
  document.getElementById('rvMinimap').style.display=minimapOn?'block':'none';
  const btn=document.getElementById('btnMinimap');
  if(btn){btn.style.background=minimapOn?'var(--ac)':'';btn.style.color=minimapOn?'#fff':'';}
  if(minimapOn&&rvMinimapInst)setTimeout(()=>rvMinimapInst.relayout(),50);
}
