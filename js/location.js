/* 119hyd-Map2 · js/location.js — 잘못된 위치 수정 · 좌표→주소 · 좌표 재검색 · 확인 핀 */
AppFiles.reg('js/location.js','v3.7.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// 좌표가 없는 개별 항목만 다시 지오코딩 시도
// ━━ 잘못된 위치 수정 (지도를 클릭해 새 위치 지정) ━━
// 위치 수정 중에는 수정 대상 마커만 남기고 나머지는 숨겨서 헷갈리지 않게 한다
function setOtherMarkersHidden(exceptIdx,hidden){
  Object.entries(overlays).forEach(([i,o])=>{
    if(Number(i)===exceptIdx)return;
    if(hidden){
      _ovSet(o.overlay,false);
      _ovSet(o.labelOverlay,false);
    }else if(!o.hidden){ // 그룹/검색 필터로 원래 숨겨진 마커는 복원하지 않음
      _ovSet(o.overlay,!_zoomFar);
      _ovSet(o.labelOverlay,labelsOn&&!_labelFar);
    }
  });
}
function startFixLocation(idx){
  if(fixLocationIdx===idx){
    // 이미 이 항목을 수정 중이면 취소
    fixLocationIdx=-1;
    kakaoMap.setCursor('');
    setOtherMarkersHidden(idx,false);
    showToast('위치 수정 취소됨','');
  }else{
    fixLocationIdx=idx;
    kakaoMap.setCursor('crosshair');
    setOtherMarkersHidden(idx,true);
    showToast('📍 지도를 클릭하거나 우측 "현위치" 버튼을 누르세요','');
  }
  hyReRender(idx);
  syncPlaceBar(); // 마커가 없는 소화전이면 지도 위 안내 줄을 띄우거나 내림
  ovlRefresh();   // 겹친 자리였다면: 수정 중인 것의 이름표는 자기 번호만 보이게
}
// 좌표 → 주소 역지오코딩 (지도를 클릭했을 때 그 지점의 주소를 함께 받아오기 위함)
// 주소·장소 검색은 common/kakao-geo.js(KakaoGeo) 사용 — 지도 SDK services, REST 키 불필요
// 좌표 → {road:도로명주소, jibun:지번주소}
function reverseGeocode2(lat,lng){return KakaoGeo.reverseGeocode(lat,lng);}
async function reverseGeocode(lat,lng){
  const a=await reverseGeocode2(lat,lng);
  return a.road||a.jibun||null;
}
async function applyFixLocation(idx,latLng){
  const d=items[idx];if(!d)return;
  fixLocationIdx=-1;
  kakaoMap.setCursor('');
  syncPlaceBar();
  const lat=latLng.getLat(),lng=latLng.getLng();
  try{
    showToast('주소 확인 중...','');
    const ra=await reverseGeocode2(lat,lng);
    const addr=ra.road||ra.jibun;
    const from={lat:d.lat,lng:d.lng,address:d.address||''};
    const method=_fixMeta?.method||'지도 클릭';_fixMeta=null;
    const payload={lat,lng,loc_fixed_at:new Date().toISOString()};
    if(addr)payload.address=addr;
    if(ra.jibun)payload.extra={...(d.extra||{}),'지번주소':ra.jibun};
    await SupabaseUtil.update('hydmap_items',payload,{id:d.id});
    d.lat=lat;d.lng=lng;d.loc_fixed_at=payload.loc_fixed_at;
    if(addr)d.address=addr;
    if(payload.extra)d.extra=payload.extra;
    logHistory(d,'위치 수정',{method,from:from.lat?from:null,to:{lat,lng,address:d.address||''}});
    saveLocationMaster(d,method);
    // 기존 오버레이/클러스터 마커 위치 이동 (재생성 없이 좌표만 갱신)
    const o=overlays[idx];
    if(o){
      const newPos=new kakao.maps.LatLng(lat,lng);
      o.overlay?.setPosition(newPos);
      o.labelOverlay?.setPosition(newPos);
      o.iw?.setPosition(newPos);
      o.clMarker?.setPosition(newPos);
    }else{
      // 좌표가 없어서 마커가 아예 없던 항목이면 새로 생성
      addMarker(idx,d);
      if(clusterer)clusterer.redraw();
    }
    hyReRender(idx);
    updateListItem(idx);
    setOtherMarkersHidden(idx,false);
    ovlRecompute(); // 위치가 바뀌었으니 겹침 묶음을 다시 계산
    showToast(addr?'✅ 위치·주소가 함께 수정되었습니다':'✅ 위치가 수정되었습니다 (주소 확인 실패)','ok');
  }catch(e){
    setOtherMarkersHidden(idx,false);
    ovlRefresh();
    showToast('위치 수정 실패: '+(e?.message||''),'err');
  }
}
async function retryGeocodeItem(idx){
  const d=items[idx];if(!d||!currentProject)return;
  if(!d.address){showToast('주소 정보가 없습니다','err');return;}
  showToast('좌표 재검색 중...','');
  try{
    const geo=await geocodeAddr(d.address);
    if(!geo){showToast('여전히 좌표를 찾지 못했습니다 (주소를 확인해주세요)','err');return;}
    await SupabaseUtil.update('hydmap_items',{lat:geo.lat,lng:geo.lng},{id:d.id});
    d.lat=geo.lat;d.lng=geo.lng;
    addMarker(idx,d);
    if(clusterer)clusterer.redraw();
    updateListItem(idx);
    ovlRecompute();
    showToast('✅ 좌표를 찾았습니다','ok');
  }catch(e){showToast('재검색 실패: '+(e?.message||''),'err');}
}

// 위치 수정 중 지도를 클릭(또는 현위치)하면, 그 지점에 핀을 잠깐 찍어서 보여주고
// "이 위치로 저장할까요?" 확인을 받은 뒤에만 실제로 저장한다 (실수로 엉뚱한 곳을 눌러도 되돌리기 쉽게).
let _fixPinOverlay=null;
function showFixPin(latLng){
  clearFixPin();
  const el=document.createElement('div');
  el.style.cssText='font-size:32px;line-height:1;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5));animation:hy-pulse .6s ease-in-out infinite alternate;pointer-events:none';
  el.textContent='📍';
  _fixPinOverlay=new kakao.maps.CustomOverlay({position:latLng,content:el,yAnchor:1,zIndex:300});
  _fixPinOverlay.setMap(kakaoMap);
}
function clearFixPin(){
  if(_fixPinOverlay){_fixPinOverlay.setMap(null);_fixPinOverlay=null;}
}

function confirmAndApplyFixLocation(idx,latLng){
  stopPreciseGps(); // GPS 측정 중 지도를 직접 눌렀을 때도 측정 종료
  showFixPin(latLng);
  const ok=confirm('📍 이 위치로 저장할까요?');
  if(ok){
    clearFixPin();
    applyFixLocation(idx,latLng);
  }
  // 취소하면 핀만 지우고 위치 수정 모드는 계속 유지 (다시 클릭해서 재시도 가능)
  else{
    _fixMeta=null;
    clearFixPin();
  }
}
