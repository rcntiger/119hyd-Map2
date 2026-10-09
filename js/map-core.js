/* 119hyd-Map2 · js/map-core.js — 카카오 지도 초기화 · 툴바 표시 · 진단 · 항목 활성화/전체 보기 */
AppFiles.reg('js/map-core.js','v3.2.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ Kakao Map ══════════ */
// 지도 툴바 표시 상태를 현재 상황에 맞게 맞춘다
// PC(>768px)는 항상 표시, 모바일은 지도 보기 모드일 때만 표시. 로드뷰가 열려 있으면 상단 툴바는 숨김.
function syncMapToolbars(){
  const show=window.innerWidth>768||mobMapMode;
  const tb=document.getElementById('mapToolbar');
  const tbTop=document.getElementById('mapToolbarTop');
  const rvOpen=document.getElementById('rvPanel')?.style.display==='flex';
  if(tb)tb.style.display=show?'flex':'none';
  if(tbTop){tbTop.style.removeProperty('display');tbTop.style.display=(show&&!rvOpen)?'flex':'none';}
}
// ── 카카오 지도 SDK 받기 (한 번만) ──
// 홈 화면이 뜬 직후 미리 받아 두면, 카드를 눌렀을 때 SDK를 기다리지 않고 바로 지도를 만든다.
function loadKakaoSdk(){return KakaoGeo.load();} // common/kakao-geo.js (한 번만 받음, 미리 받기 지원)
function initKakaoMap(){
  // 이미 만들어진 지도로 다른 계획을 다시 열 때도 툴바를 다시 표시해야 한다
  // (예전엔 처음 한 번만 표시하고, 홈으로 나갈 때 숨긴 뒤 다시 켜지 않아 툴바가 사라지던 버그)
  if(kakaoMap){document.getElementById('mapPh').style.display='none';syncMapToolbars();return Promise.resolve();}
  return loadKakaoSdk().then(()=>new Promise((resolve,reject)=>{
      try{
        document.getElementById('mapPh').style.display='none';
        kakaoMap=new kakao.maps.Map(document.getElementById('map'),{center:new kakao.maps.LatLng(37.46,126.90),level:5});
        clusterer=new kakao.maps.MarkerClusterer({
          map:kakaoMap,
          averageCenter:true,
          minLevel:6,
          disableClickZoom:false,
          styles:[{
            width:'36px',height:'36px',background:'rgba(47,129,247,.85)',
            borderRadius:'50%',color:'#fff',textAlign:'center',
            fontWeight:'700',fontSize:'13px',lineHeight:'36px',
            border:'2px solid #fff',boxShadow:'0 2px 6px rgba(0,0,0,.4)'
          }]
        });
        // 모바일은 지도 보기 클릭 시 툴바 표시, PC는 항상 표시
        syncMapToolbars();
        kakao.maps.event.addListener(kakaoMap,'zoom_changed',()=>syncZoomVisibility(false));
        const _f=_calcZoomFlags();_zoomFar=_f.far;_labelFar=_f.lfar;
        kakao.maps.event.addListener(kakaoMap,'click',(e)=>{
          document.getElementById('mapSearchResults').style.display='none';
          ovlCloseChooser();
          if(fixLocationIdx>=0){confirmAndApplyFixLocation(fixLocationIdx,e.latLng);return;}
          if(rvMode){openRvAt(e.latLng);setRvMode(false);return;}
          if(distMode){distPath.push(e.latLng);addDistMarker(e.latLng);updateDistLine();}
        });
        kakao.maps.event.addListener(kakaoMap,'dblclick',()=>{if(distMode)finishDist();});
        resolve();
      }catch(e){reject(new Error('MAP_CREATE'));}
  })).catch(e=>{showDiag(e.message);});
}
function showDiag(code){
  const msgs={'TIMEOUT':{t:'도메인 미등록',d:'Kakao 콘솔에 현재 도메인을 등록하세요.',f:'developers.kakao.com → 내 애플리케이션 → 플랫폼 → Web'},'SCRIPT_LOAD':{t:'JS 키 오류',d:'403 오류',f:'JS 키와 도메인 확인'}};
  const m=msgs[code]||{t:'오류:'+code,d:'',f:'새로고침하세요'};
  document.getElementById('diagTitle').textContent='⚠️ '+m.t;
  document.getElementById('diagDesc').textContent=m.d;
  document.getElementById('diagFix').innerHTML=m.f+'<br><b>'+location.origin+'</b>';
  document.getElementById('diagPanel').style.display='flex';
}

function setActive(idx){
  if(activeIdx>=0)document.getElementById(`item-${activeIdx}`)?.classList.remove('active');
  activeIdx=idx;
  const el=document.getElementById(`item-${idx}`);
  if(el){el.classList.add('active');el.scrollIntoView({block:'nearest'});}
}
function closeIw(){ovlCloseChooser();ncCloseCard();if(iwOpen){iwOpen.setMap(null);iwOpen=null;}if(activeMarkerEl){activeMarkerEl.classList.remove('active-mk');activeMarkerEl=null;}}
function fitAll(){
  if(!kakaoMap)return;
  // 그룹/검색 필터로 숨겨진 항목은 제외하고, 현재 화면에 보이는 대상만 기준으로 범위를 잡는다
  const visible=items.filter(d=>d.lat&&d.lng&&!isHidden(d));
  const pts=visible.length?visible:items.filter(d=>d.lat&&d.lng); // 필터 결과가 하나도 없으면 전체로 폴백
  if(!pts.length)return;
  // 좌표 이상치(잘못된 지오코딩으로 엉뚱하게 먼 지역에 찍힌 점) 때문에
  // 지도가 전국 단위로 확 축소되는 문제를 막기 위해, 중앙값에서 너무 먼 점은 제외하고 범위를 계산
  const lats=pts.map(d=>d.lat).slice().sort((a,b)=>a-b);
  const lngs=pts.map(d=>d.lng).slice().sort((a,b)=>a-b);
  const medLat=lats[Math.floor(lats.length/2)];
  const medLng=lngs[Math.floor(lngs.length/2)];
  const MAX_DEG=0.3; // 약 30km 이내까지는 정상 범위로 간주
  const normal=pts.filter(d=>Math.abs(d.lat-medLat)<MAX_DEG&&Math.abs(d.lng-medLng)<MAX_DEG);
  const useSet=normal.length?normal:pts; // 전부 이상치로 걸러지면 원래대로 전체 사용
  const bounds=new kakao.maps.LatLngBounds();
  useSet.forEach(d=>bounds.extend(new kakao.maps.LatLng(d.lat,d.lng)));
  if(!bounds.isEmpty())kakaoMap.setBounds(bounds,50);
  // 안전장치: 그래도 너무 축소되면 레벨을 다시 당겨온다 (처음 진입 시 좀 더 확대된 느낌으로 시작)
  if(kakaoMap.getLevel()>5)kakaoMap.setLevel(5);
  // setBounds는 "최소~최대 좌표의 중간점"을 중심으로 잡아서, 외곽에 몇 개만 떨어져 있으면
  // 정작 밀집된 무리가 한쪽으로 쏠려 보이는 문제가 있다. 밀집 지역의 중앙값으로 다시 센터를 맞춘다.
  kakaoMap.setCenter(new kakao.maps.LatLng(medLat,medLng));
}
