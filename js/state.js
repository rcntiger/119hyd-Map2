/* 119hyd-Map2 · js/state.js — 전역 상태 변수 · hyState 통합 저장소 */
AppFiles.reg('js/state.js','v3.2.4'); // 파일 버전 표시 (tools/bump-version.py가 관리 — 손으로 고치지 않음)

/* ══════════ State ══════════ */
let kakaoMap=null,rvInstance=null,rvMinimapInst=null,rvOverlay=null,minimapOn=false;
let clusterer=null;
let rvMode=false,distMode=false,distLine=null,distMarkers=[],distPath=[],satMode=false;
let roadPolylines=[],iwOpen=null,activeMarkerEl=null,lastIw=null,activeIdx=-1;
let _sharedTooltip=null;
let searchMarkers=[],mobMapMode=false;
let memoTimers={};

let currentProject=null;
let projectList=[];
// ══ 세분계획(가상 계획) 관련 ══
// 세분계획은 부모 계획의 데이터를 특정 팀/조 필터로 잠가서 보는 "뷰"다. 자체 데이터를 갖지 않는다.
let subPlanList=[];        // parent_id가 있는 계획들 (홈 화면에서 부모 카드 아래에 표시)
let lockedFilterGroup='';  // 세분계획으로 진입한 경우 잠긴 그룹 필터 값 (예: '1팀 2조')
let teamFilterPrefix='';   // 팀 단위 세분계획으로 진입한 경우의 팀 접두어 (예: '1팀') — 팀 내 조들만 표시/전환 가능
let items=[],overlays={};
// ══ 통합 상태 저장소 (최적화 4) ══
// 예전엔 done/memo/photo/hydrant record가 doneMap/memoMap/photoMap/hydrantMap 4개
// 전역 변수로 파편화되어 있어 동기화 추적이 어려웠다. 이제 실제 데이터는
// hyState[item_id] = {done, memo, photos, hydrant} 한 곳에 모아두고,
// doneMap/memoMap/photoMap/hydrantMap은 기존 코드(46곳 이상)를 건드리지 않도록
// hyState를 들여다보는 Proxy "뷰"로 유지한다. 즉 `doneMap[id]`, `doneMap[id]=x`,
// `delete doneMap[id]` 등 기존 문법이 전부 그대로 동작하면서, 실제 저장은 단일 객체에 이루어진다.
let hyState={};
function _hyEnsure(id){return hyState[id]||(hyState[id]={done:undefined,memo:'',photos:undefined,hydrant:undefined});}
function _hyMapView(key,emptyVal){
  return new Proxy({},{
    get(_,id){const s=hyState[id];return s?s[key]:undefined;},
    set(_,id,val){_hyEnsure(id)[key]=val;return true;},
    has(_,id){const s=hyState[id];return !!s&&s[key]!==undefined&&s[key]!==emptyVal;},
    deleteProperty(_,id){if(hyState[id])hyState[id][key]=emptyVal;return true;},
    ownKeys(){return Object.keys(hyState).filter(id=>{const s=hyState[id];return s&&s[key]!==undefined&&s[key]!==emptyVal;});},
    getOwnPropertyDescriptor(){return{enumerable:true,configurable:true};}
  });
}
let doneMap=_hyMapView('done'),memoMap=_hyMapView('memo',''),photoMap=_hyMapView('photos'),hydrantMap=_hyMapView('hydrant');
let hyDraft={}; // 카드에서 저장 전 임시 편집 상태 (idx 기준)
let groups=[],filterGroupVal='',filterText='';
// ── 개별 선택 후 지도에 표시 ──
let pickMode=false;          // 선택 모드 on/off (목록에 체크박스 표시)
let pickedIds=new Set();     // 선택된 item id들 (선택 모드 중 담기는 중)
let pickedFilterActive=false;// "지도에 표시" 눌러서 실제로 필터가 적용된 상태
let tooltipOn=true; // 마커 hover 시 소화전 번호 툴팁 표시 여부 (기기에 기억)
let labelsOn=false; // 마커 아래 이름표(풍선) 표시 여부 (기본 OFF)
let fixLocationIdx=-1; // 위치 수정 모드 중인 항목의 idx (-1이면 비활성)
let displayIndexOrder=null; // 정렬된 표시 순서(원본 인덱스 배열). null이면 원본 순서 그대로
