/* 119hyd-Map2 · js/gps.js — 현위치 · 정밀 GPS 보정 */
AppFiles.reg('js/gps.js','v3.2.3'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 현위치 ══════════ */
let _myLocMarker=null,_myLocCircle=null,_myLocWatch=null;

/* ══════════ 정밀 GPS 보정 ══════════
   스마트폰 GPS는 첫 값이 기지국/와이파이 기반의 대략적인 값(오차 수십 m)인 경우가 많고,
   위성을 잡을수록 점점 정확해진다. 그래서 한 번만 읽지 않고 최대 30초 동안 계속 측정하면서
   오차(±m)를 화면에 보여주고, 가장 정확한 측정값들의 가중 평균을 위치로 쓴다. */
let _gps=null;
let _fixMeta=null; // 다음 위치 저장의 방법 표시용 (GPS면 오차 포함) // {idx,watch,samples,timer,started,circle,dot}
function startPreciseGps(idx){
  stopPreciseGps();
  const panel=document.getElementById('gpsPanel');
  panel.style.display='flex';
  _gps={idx,samples:[],started:Date.now(),circle:null,dot:null,timer:null,watch:null};
  _gpsRender();
  _gps.watch=navigator.geolocation.watchPosition(
    pos=>{
      if(!_gps)return;
      const {latitude:lat,longitude:lng,accuracy:acc}=pos.coords;
      _gps.samples.push({lat,lng,acc,t:Date.now()});
      const ll=new kakao.maps.LatLng(lat,lng);
      if(!_gps.circle){
        _gps.circle=new kakao.maps.Circle({center:ll,radius:acc,strokeWeight:2,strokeColor:'#2563eb',strokeOpacity:.8,fillColor:'#2563eb',fillOpacity:.12,zIndex:80});
        _gps.circle.setMap(kakaoMap);
        const el=document.createElement('div');
        el.style.cssText='width:14px;height:14px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,.35)';
        _gps.dot=new kakao.maps.CustomOverlay({position:ll,content:el,zIndex:81,xAnchor:.5,yAnchor:.5});
        _gps.dot.setMap(kakaoMap);
        kakaoMap.setLevel(Math.min(kakaoMap.getLevel(),2));
        kakaoMap.setCenter(ll);
      }else{
        _gps.circle.setPosition(ll);_gps.circle.setRadius(acc);_gps.dot.setPosition(ll);
      }
      _gpsRender();
      // 오차 8m 이하가 3번 연속 나오면 충분히 안정된 것으로 보고 자동 완료
      const last=_gps.samples.slice(-3);
      if(last.length===3&&last.every(x=>x.acc<=8))finishPreciseGps(true);
    },
    err=>{
      const msg=err.code===1?'위치 권한이 거부되었습니다. 브라우저 설정에서 위치를 "허용"(정확한 위치)으로 바꿔주세요':
                err.code===2?'위치를 확인할 수 없습니다 (실내라면 밖으로 나와주세요)':'위치 측정 시간 초과';
      showToast(msg,'err');
      if(_gps&&!_gps.samples.length)stopPreciseGps();
    },
    {enableHighAccuracy:true,maximumAge:0,timeout:30000}
  );
  _gps.timer=setInterval(()=>{
    if(!_gps)return;
    _gpsRender();
    if(Date.now()-_gps.started>30000)finishPreciseGps(true); // 30초가 지나면 그때까지의 최적값 제시
  },1000);
}
// 가장 정확한 측정값 기준으로, 그와 비슷하게 정확한 값들을 1/오차² 가중 평균 (튀는 값 영향 줄이기)
function _gpsBest(){
  if(!_gps||!_gps.samples.length)return null;
  const best=Math.min(..._gps.samples.map(x=>x.acc));
  const good=_gps.samples.filter(x=>x.acc<=Math.max(best*1.5,best+3));
  let w=0,la=0,ln=0;
  good.forEach(x=>{const k=1/(x.acc*x.acc);w+=k;la+=x.lat*k;ln+=x.lng*k;});
  return {lat:la/w,lng:ln/w,acc:best,n:good.length};
}
function _gpsRender(){
  if(!_gps)return;
  const sec=Math.floor((Date.now()-_gps.started)/1000);
  const cur=_gps.samples[_gps.samples.length-1];
  const b=_gpsBest();
  const col=a=>a<=8?'#22c55e':a<=20?'#f59e0b':'#ef4444';
  document.getElementById('gpsInfo').innerHTML=!cur
    ?`📡 위성 찾는 중… ${sec}초 <span style="color:#9ca3af;font-size:11px">(하늘이 트인 곳에서 잠시 기다려주세요)</span>`
    :`📡 측정 ${sec}초 · 현재 <b style="color:${col(cur.acc)}">±${Math.round(cur.acc)}m</b> · 최고 <b style="color:${col(b.acc)}">±${Math.round(b.acc)}m</b>
      <div style="font-size:11px;color:#9ca3af;margin-top:2px">${b.acc<=8?'충분히 정확합니다 ✅':b.acc<=20?'조금 더 기다리면 정확해질 수 있어요':'오차가 큽니다 — 지도를 직접 눌러 지정하는 것을 권장'}</div>`;
  document.getElementById('gpsOkBtn').disabled=!b;
}
function finishPreciseGps(auto){
  if(!_gps)return;
  const b=_gpsBest(),idx=_gps.idx;
  stopPreciseGps();
  if(!b){showToast('위치를 측정하지 못했습니다','err');return;}
  if(b.acc>30&&!confirm(`GPS 오차가 ±${Math.round(b.acc)}m로 큽니다.\n그래도 이 위치로 저장할까요?\n(취소 후 지도를 직접 눌러 지정할 수 있습니다)`))return;
  showToast(`GPS 측정 완료 (±${Math.round(b.acc)}m, ${b.n}회 평균)`,'ok');
  _fixMeta={method:`GPS ±${Math.round(b.acc)}m`};
  confirmAndApplyFixLocation(idx,new kakao.maps.LatLng(b.lat,b.lng));
}
function stopPreciseGps(){
  if(!_gps)return;
  if(_gps.watch!==null)navigator.geolocation.clearWatch(_gps.watch);
  clearInterval(_gps.timer);
  _gps.circle?.setMap(null);_gps.dot?.setMap(null);
  _gps=null;
  const panel=document.getElementById('gpsPanel');if(panel)panel.style.display='none';
}

function toggleMyLocation(){
  // 위치 수정 모드 중이면, 일반 위치추적 대신 "현재 위치로 바로 수정"으로 동작
  if(fixLocationIdx>=0){
    const idx=fixLocationIdx;
    if(!navigator.geolocation){showToast('이 브라우저는 위치 기능을 지원하지 않습니다','err');return;}
    startPreciseGps(idx);
    return;
  }
  const btn=document.getElementById('btnMyLoc');
  if(_myLocWatch!==null){
    // 추적 종료
    navigator.geolocation.clearWatch(_myLocWatch);
    _myLocWatch=null;
    _myLocMarker?.setMap(null);_myLocMarker=null;
    _myLocCircle?.setMap(null);_myLocCircle=null;
    btn.classList.remove('on');
    showToast('현위치 추적 종료','');
    return;
  }
  if(!navigator.geolocation){showToast('이 브라우저는 위치 기능을 지원하지 않습니다','err');return;}
  btn.textContent='⏳';
  _myLocWatch=navigator.geolocation.watchPosition(
    pos=>{
      const {latitude:lat,longitude:lng,accuracy}=pos.coords;
      const latlng=new kakao.maps.LatLng(lat,lng);
      // 마커 (파란 원형)
      if(!_myLocMarker){
        const el=document.createElement('div');
        el.style.cssText='width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 3px rgba(37,99,235,.35)';
        _myLocMarker=new kakao.maps.CustomOverlay({position:latlng,content:el,zIndex:200});
        _myLocMarker.setMap(kakaoMap);
        kakaoMap.panTo(latlng);
      }else{
        _myLocMarker.setPosition(latlng);
      }
      // 정확도 원
      if(_myLocCircle){_myLocCircle.setMap(null);}
      _myLocCircle=new kakao.maps.Circle({
        center:latlng,radius:accuracy,
        strokeWeight:1,strokeColor:'#2563eb',strokeOpacity:.4,
        fillColor:'#2563eb',fillOpacity:.08,
      });
      _myLocCircle.setMap(kakaoMap);
      btn.textContent='📍';
      btn.classList.add('on');
    },
    err=>{
      btn.textContent='📍';
      btn.classList.remove('on');
      _myLocWatch=null;
      const msg={1:'위치 권한이 거부됐습니다',2:'위치를 가져올 수 없습니다',3:'위치 요청 시간 초과'};
      showToast(msg[err.code]||'위치 오류','err');
    },
    {enableHighAccuracy:true,timeout:10000,maximumAge:3000}
  );
}
