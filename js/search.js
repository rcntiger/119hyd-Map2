/* 119hyd-Map2 · js/search.js — 지도 검색 */
AppFiles.reg('js/search.js','v3.2.2'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ━━ 지도 검색 ━━
let srchMarkers=[];
function toggleMapSearch(){
  const w=document.getElementById('mapSearch');
  const btn=document.getElementById('btnSearch');
  if(w.style.display==='flex'){
    w.style.display='none';btn.classList.remove('on');
    srchMarkers.forEach(m=>m.setMap(null));srchMarkers=[];
  }else{
    // 검색 버튼 바로 아래에 나타나도록 위치 계산 (버튼이 상단 가로 툴바로 이동했으므로 고정 좌표 대신 동적으로 계산)
    const wrap=document.querySelector('.map-wrap');
    if(wrap&&btn){
      const wrapRect=wrap.getBoundingClientRect();
      const btnRect=btn.getBoundingClientRect();
      let left=btnRect.left-wrapRect.left;
      const maxLeft=wrapRect.width-244; // 검색창 너비(240)+여백 고려해 화면 밖으로 안 나가게
      if(left>maxLeft)left=Math.max(10,maxLeft);
      w.style.left=left+'px';
      w.style.top=(btnRect.bottom-wrapRect.top+6)+'px';
    }
    w.style.display='flex';btn.classList.add('on');
    setTimeout(()=>document.getElementById('mapSearchInput').focus(),50);
  }
}
function closeMapSearch(){document.getElementById('mapSearch').style.display='none';document.getElementById('btnSearch').classList.remove('on');srchMarkers.forEach(m=>m.setMap(null));srchMarkers=[];}
async function searchMap(){
  const q=document.getElementById('mapSearchInput').value.trim();if(!q){showToast('검색어를 입력하세요','err');return;}
  srchMarkers.forEach(m=>m.setMap(null));srchMarkers=[];
  const res=document.getElementById('mapSearchResults');
  res.innerHTML='<div class="sri" style="cursor:default">검색 중...</div>';res.style.display='block';
  let results=[];
  results=await KakaoGeo.keywordSearch(q,10);
  if(!results.length)results=await KakaoGeo.addressSearch(q,10);
  if(!results.length){res.innerHTML='<div class="sri" style="cursor:default;color:var(--mt)">검색 결과 없음</div>';return;}
  res.innerHTML='';
  results.forEach((r,i)=>{
    const el=document.createElement('div');el.className='sri';
    el.innerHTML=`<div class="sri-name">${i+1}. ${esc(r.name)}</div><div class="sri-addr">${esc(r.addr)}</div>`;
    el.onclick=()=>{kakaoMap.setLevel(3);kakaoMap.panTo(new kakao.maps.LatLng(r.lat,r.lng));};
    res.appendChild(el);
    const mk=document.createElement('div');mk.style.cssText='width:24px;height:24px;border-radius:50%;background:#f59e0b;border:3px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.5)';mk.textContent=i+1;
    const ov=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(r.lat,r.lng),content:mk,zIndex:50});ov.setMap(kakaoMap);srchMarkers.push(ov);
  });
  if(results[0])kakaoMap.panTo(new kakao.maps.LatLng(results[0].lat,results[0].lng));
}
