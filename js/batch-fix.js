/* 119hyd-Map2 · js/batch-fix.js — 일괄 위치수정 (PC 전용) */
AppFiles.reg('js/batch-fix.js','v3.1.0'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ 일괄 위치수정 (PC 전용) ══════════
   현재 지도에 보이는(필터 적용된) 소화전을 끌어서 옮길 수 있는 마커로 바꾸고,
   옮긴 것들을 모아 두었다가 [저장]으로 한 번에 DB에 반영한다. 저장 전에는 언제든 되돌릴 수 있다. */
let _bf=null; // {marks:Map(itemId → {marker,line,orig,idx}), changed:Set}
const _bfImgCache={};
function _bfImg(color,moved){
  const k=color+(moved?'m':'');
  if(_bfImgCache[k])return _bfImgCache[k];
  const ring=moved?'#dc2626':'#ffffff';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="8" fill="${color}" stroke="${ring}" stroke-width="${moved?4:3}"/></svg>`;
  return _bfImgCache[k]=new kakao.maps.MarkerImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),new kakao.maps.Size(22,22),{offset:new kakao.maps.Point(11,11)});
}
function toggleBatchFix(){
  if(_bf){
    if(_bf.changed.size&&!confirm(`저장하지 않은 변경 ${_bf.changed.size}개가 있습니다. 버리고 종료할까요?`))return;
    _bfExit();return;
  }
  if(!requireAdmin())return;
  if(window.innerWidth<=768||matchMedia('(pointer:coarse)').matches){showToast('일괄 위치수정은 PC 화면에서만 사용할 수 있습니다','err');return;}
  if(!kakaoMap||!items.length)return;
  const targets=items.map((d,i)=>({d,i})).filter(({d})=>d.lat&&d.lng&&!isHidden(d));
  if(!targets.length){showToast('지도에 표시된 소화전이 없습니다','err');return;}
  if(targets.length>400&&!confirm(`${targets.length}개 소화전을 편집 마커로 바꿉니다. 조나 팀으로 범위를 좁히면 더 가볍습니다. 계속할까요?`))return;
  closeIw();
  if(fixLocationIdx>=0){fixLocationIdx=-1;kakaoMap.setCursor('');}
  _bf={marks:new Map(),changed:new Set()};
  targets.forEach(({d,i})=>{
    const o=overlays[i];
    o?.overlay?.setMap(null); // 원래 마커는 잠시 숨김 (번호 라벨은 남겨서 어느 소화전인지 보이게)
    const pos=new kakao.maps.LatLng(d.lat,d.lng);
    const marker=new kakao.maps.Marker({position:pos,draggable:true,image:_bfImg(groupColor(d),false),title:`${d.name} (${(d.address||'').replace('서울특별시 금천구 ','')})`,zIndex:5});
    marker.setMap(kakaoMap);
    const rec={marker,line:null,orig:{lat:d.lat,lng:d.lng},idx:i,d};
    kakao.maps.event.addListener(marker,'dragend',()=>_bfMoved(rec));
    kakao.maps.event.addListener(marker,'rightclick',()=>_bfRevertOne(rec));
    _bf.marks.set(d.id,rec);
  });
  document.getElementById('batchFixBar').style.display='flex';
  document.getElementById('btnBatchFix').classList.add('on');
  _bfCount();
  showToast(`${targets.length}개 소화전을 끌어서 옮길 수 있습니다`,'ok');
}
function _bfMoved(rec){
  const p=rec.marker.getPosition();
  const moved=Math.abs(p.getLat()-rec.orig.lat)>1e-7||Math.abs(p.getLng()-rec.orig.lng)>1e-7;
  rec.line?.setMap(null);rec.line=null;
  if(moved){
    // 원래 위치 → 새 위치 점선 표시
    rec.line=new kakao.maps.Polyline({path:[new kakao.maps.LatLng(rec.orig.lat,rec.orig.lng),p],strokeWeight:2,strokeColor:'#dc2626',strokeOpacity:.8,strokeStyle:'shortdash'});
    rec.line.setMap(kakaoMap);
    _bf.changed.add(rec.d.id);
  }else _bf.changed.delete(rec.d.id);
  rec.marker.setImage(_bfImg(groupColor(rec.d),moved));
  overlays[rec.idx]?.labelOverlay?.setPosition(p); // 번호 라벨도 따라 이동
  _bfCount();
}
function _bfRevertOne(rec){
  const p=new kakao.maps.LatLng(rec.orig.lat,rec.orig.lng);
  rec.marker.setPosition(p);
  _bfMoved(rec);
}
function revertBatchFix(){
  if(!_bf||!_bf.changed.size)return;
  if(!confirm(`변경한 ${_bf.changed.size}개를 모두 원래 위치로 되돌릴까요?`))return;
  [..._bf.changed].forEach(id=>_bfRevertOne(_bf.marks.get(id)));
}
function _bfCount(){
  const el=document.getElementById('bfCount');
  if(el)el.textContent=`변경 ${_bf?_bf.changed.size:0}개`;
}
function _bfExit(){
  if(!_bf)return;
  _bf.marks.forEach(rec=>{
    rec.marker.setMap(null);rec.line?.setMap(null);
    const o=overlays[rec.idx];
    o?.labelOverlay?.setPosition(new kakao.maps.LatLng(rec.d.lat,rec.d.lng)); // 저장 안 한 것은 원위치
  });
  _bf=null;
  document.getElementById('batchFixBar').style.display='none';
  document.getElementById('btnBatchFix')?.classList.remove('on');
  applyFilter(); // 숨겼던 원래 마커를 필터 상태대로 다시 표시
}
async function saveBatchFix(){
  if(!_bf||!_bf.changed.size){showToast('변경된 위치가 없습니다','');return;}
  const ids=[..._bf.changed];
  const withAddr=document.getElementById('bfAddr').checked;
  if(!confirm(`${ids.length}개 소화전의 위치${withAddr?'와 주소':''}를 저장할까요?`))return;
  let ok=0,fail=0,addrFail=0;
  const now=new Date().toISOString();
  for(let n=0;n<ids.length;n++){
    const rec=_bf.marks.get(ids[n]);
    const p=rec.marker.getPosition(),lat=p.getLat(),lng=p.getLng();
    showToast(`저장 중… ${n+1}/${ids.length}`,'');
    try{
      const payload={lat,lng,loc_fixed_at:now};
      const from={lat:rec.d.lat,lng:rec.d.lng,address:rec.d.address||''};
      if(withAddr){
        const ra=await reverseGeocode2(lat,lng);
        if(ra.road||ra.jibun)payload.address=ra.road||ra.jibun;else addrFail++;
        if(ra.jibun)payload.extra={...(rec.d.extra||{}),'지번주소':ra.jibun};
      }
      await SupabaseUtil.update('hydmap_items',payload,{id:rec.d.id});
      const d=rec.d;
      d.lat=lat;d.lng=lng;d.loc_fixed_at=now;if(payload.address)d.address=payload.address;if(payload.extra)d.extra=payload.extra;
      logHistory(d,'위치 수정',{method:'일괄(PC)',from,to:{lat,lng,address:d.address||''}});
      saveLocationMaster(d,'일괄(PC)');
      const o=overlays[rec.idx];
      if(o){o.overlay?.setPosition(p);o.labelOverlay?.setPosition(p);o.iw?.setPosition(p);o.clMarker?.setPosition(p);}
      // 저장된 것은 새 위치를 기준점으로
      rec.orig={lat,lng};
      rec.line?.setMap(null);rec.line=null;
      rec.marker.setImage(_bfImg(groupColor(d),false));
      _bf.changed.delete(d.id);
      if(o&&o.popupRendered)hyReRender(rec.idx);
      updateListItem(rec.idx);
      ok++;
    }catch(e){fail++;console.error('일괄 위치저장 실패',rec.d.name,e);}
    _bfCount();
  }
  if(clusterer)clusterer.redraw();
  showToast(`✅ ${ok}개 저장${fail?` · 실패 ${fail}개(다시 저장하세요)`:''}${addrFail?` · 주소 확인 실패 ${addrFail}개(위치만 저장)`:''}`,fail?'err':'ok');
}
