/* 119hyd-Map2 · js/config.js — 상수 — 키·주소는 common/keys.js(APP_KEYS)에서 읽음 */
AppFiles.reg('js/config.js','v3.14.16'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

// ━━ 상수 ━━
// (APP_VERSION은 index.html 맨 위 한 곳에만 적는다 — 캐시 관리·파일 버전 확인에 함께 쓰임)
// ── 키·주소는 공통 키 설정(common/keys.js) 한 곳에서 관리 ── (이 파일에는 키를 적지 않음)
const _CFG=window.APP_KEYS||null;
const SB_URL  = _CFG?.SUPABASE?.hydrant?.url; // 소화전 점검 DB (119hyd-inspec와 동일 프로젝트, 별도 hydmap_ 테이블 사용)
const SB_KEY  = _CFG?.SUPABASE?.hydrant?.anonKey;
if(window.KakaoGeo)KakaoGeo.init({jsKey:_CFG?.KAKAO_JS_KEY,libraries:['services']});
// ━━ Cloudinary (사진 업로드) — 119hyd-inspec.html과 동일 계정 사용 ━━
const CLOUDINARY_CLOUD = _CFG?.CLOUDINARY?.cloud;
const CLOUDINARY_PRESET = _CFG?.CLOUDINARY?.presets?.hydrant;
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;
// 조 색: 진한 파랑·빨강·보라·청회색·자홍·갈색 (v3.14.1 — 녹색은 완료 표시와 헷갈려 제외, 하늘색·노랑·주황은 카카오맵 바탕과 겹쳐 제외)
// css/marker.css의 .kk-marker.g1~g6과 같은 값이어야 함
const GROUP_COLORS = ['#1d4ed8','#dc2626','#7c3aed','#475569','#c026d3','#92400e'];
