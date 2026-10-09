/* 119hyd-Map2 · js/geocode.js — 주소 → 좌표 (KakaoGeo · Nominatim) */
AppFiles.reg('js/geocode.js','v3.2.3'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// 주소에 시/도/구 등 지역명이 포함되어 있는지 확인
function addrHasRegion(addr){
  return /(특별시|광역시|[가-힣]+도\s|[가-힣]+시\s|[가-힣]+군\s|[가-힣]+구\s)/.test(addr);
}
// "독산로85길 40 주건축물" 같은 문자열에서 도로명주소 핵심부(~로/~길 + 건물번호)만 추출.
// 엑셀에 섞여 들어온 건물명/용도 등 뒤에 붙은 군더더기를 잘라내기 위함 (119hyd-inspec과 동일 로직)
function extractCoreRoadAddress(addr){
  const m=addr.match(/^(.*(?:로|길))\s*(\d+(?:-\d+)?)/);
  if(!m)return null;
  const core=`${m[1]} ${m[2]}`.trim();
  return core===addr.trim()?null:core;
}
async function kakaoAddrSearch(q){
  const r=await KakaoGeo.addressSearch(q,1);
  return r[0]?{lat:r[0].lat,lng:r[0].lng}:null;
}
async function kakaoKeywordSearch(q){
  const r=await KakaoGeo.keywordSearch(q,1);
  return r[0]?{lat:r[0].lat,lng:r[0].lng}:null;
}
// 카카오가 다 실패했을 때 최종 폴백 (OpenStreetMap 지오코딩, 무료/무인증)
async function nominatimSearch(q){
  try{
    const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=kr&limit=1&accept-language=ko`,{headers:{'Accept-Language':'ko'}});
    if(r.ok){const arr=await r.json();if(arr?.[0])return{lat:+arr[0].lat,lng:+arr[0].lon};}
  }catch{}
  return null;
}
async function geocodeAddr(addr){
  if(!addr)return null;
  const REGION_PREFIX='서울특별시'; // 특정 구로 고정하면 다른 구 프로젝트에서 엉뚱한 구가 붙을 수 있어 시 단위까지만 보완
  // 1) 원본 주소 그대로 검색
  let geo=await kakaoAddrSearch(addr);
  if(geo)return geo;
  // 2) 핵심 도로명주소만 추출해서 재시도 (건물명/용도 등 군더더기 제거)
  const cleaned=extractCoreRoadAddress(addr);
  if(cleaned){
    geo=await kakaoAddrSearch(cleaned);
    if(geo)return geo;
  }
  // 3) 지역명(시/도/구)이 빠져있으면 기본 지역명을 붙여서 재시도
  const base=cleaned||addr;
  if(!addrHasRegion(base)){
    geo=await kakaoAddrSearch(`${REGION_PREFIX} ${base}`);
    if(geo)return geo;
  }
  // 4) 키워드 검색 폴백
  geo=await kakaoKeywordSearch(addrHasRegion(addr)?addr:`${REGION_PREFIX} ${addr}`);
  if(geo)return geo;
  // 5) 카카오가 다 실패하면 Nominatim(OpenStreetMap)으로 마지막 시도
  geo=await nominatimSearch(addrHasRegion(base)?base:`${REGION_PREFIX} ${base}`);
  if(geo)return geo;
  await sleep(80);
  return null;
}
