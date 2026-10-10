# 🧯 소화전 점검 지도 (119hyd-Map2)

소화전 점검을 위한 지도 기반 웹앱입니다.
엑셀로 점검 대상을 업로드하면 카카오맵에 표시되고, 현장에서 모바일로 점검 결과·사진·메모를 기록하면 모든 팀·조의 작업이 실시간으로 한 곳에 모입니다.

- **배포 주소**: https://rcntiger.github.io/119hyd-Map2/
- **형태**: `index.html` + `css/` + `js/` — 빌드 도구 없이 GitHub Pages에 그대로 배포
- **119hyd-Map(v2.4.3)과의 관계**: 같은 기능을 파일만 나눈 것(v3.0.0). 같은 Supabase(`hydmap_` 표)를 쓰므로 두 주소를 함께 운영할 수 있고, 어느 쪽에서 기록해도 같은 곳에 저장됩니다.

---

## 주요 기능

### 계획(프로젝트) 관리
- 점검 계획을 카드 형태로 생성/수정/삭제/순서변경
- 계획별 진행률(총 개소 / 완료 수 / %) 자동 집계
- 보관 기한(expire) 표시

### 조별 세분계획 (가상 뷰)
- 부모 계획의 팀/조(`group_name`) 값 기준으로 **"1팀 2조"** 같은 세분계획 카드를 자동 생성
- 세분계획은 자체 데이터를 갖지 않는 **필터 뷰** — 열면 부모 계획 데이터가 해당 조 필터로 잠긴 상태로 표시됨
- 각 세분계획 카드에 자기 조 기준 진행률 표시
- 모든 조의 점검 기록이 부모 계획 한 곳에 저장되므로 데이터 분산 없이 실시간 공유

### 엑셀 업로드 (공통 `ExcelUtil.createReader` 사용)
- 드래그앤드롭 / 파일 선택, 시트·헤더 행 선택
- 컬럼 자동 인식(키워드 매칭) + 수동 매핑, 컬럼 추가/삭제/이름 수정, 설정 localStorage 저장(`storageKey: 'hydmap'`)
- 팀/조 2컬럼 → `"1팀 2조"` 형태로 자동 결합 (숫자만 있으면 접미어 자동 부여)
- 커스텀 추가 컬럼은 `extra`(jsonb)에 수집되어 정보카드에 자동 표시
- 위도/경도 컬럼이 있으면 그대로 사용, 없으면 주소 지오코딩으로 좌표 생성
- 업로드 원본 파일은 Supabase Storage(`hydmap-files`)에 보관 → "컬럼 재설정"으로 재매핑 가능

### 지도 (Kakao Maps JS SDK)
- 조별 색상 마커, 클러스터링, 이름 라벨 ON/OFF
- 정보카드: 점검 완료 토글, 소화전 종류(지상식/지하식), 도색·보온 상태, 불량 상세, 메모, 사진, 로드뷰, 위치 수정(지도 클릭 보정)
- 그룹(조) 필터, 이름/주소 검색, 거리 재기, 위성 지도, 현위치
- 모바일 대응: 지도/목록 화면 전환, 터치 UI

### 사진
- Cloudinary 업로드 (업로드 전 1280px / 품질 0.75 자동 압축)
- 네트워크 불안정 시 지수 백오프 재시도 (최대 2회, 재시도 상태 토스트 표시)

### 결과 출력
- 점검 결과를 엑셀 파일로 내보내기 (`ExcelUtil.download`)

---

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 프론트엔드 | 순수 HTML/CSS/JS — `css/` 9개 · `js/` 32개 파일 (프레임워크·번들러 없음) |
| 지도 | Kakao Maps JS SDK (+ services 라이브러리: 지오코딩/장소검색) |
| 백엔드 | Supabase (PostgreSQL + PostgREST + Storage) |
| 사진 저장 | Cloudinary (unsigned upload preset) |
| 엑셀 | SheetJS — 공통 모듈 `excel.js` 경유 |
| 공통 모듈 | `https://rcntiger.github.io/common/` — logger.js, utils.js, supabase.js, excel.js, keys.js(`APP_KEYS`), kakao-geo.js(`KakaoGeo`) |
| 배포 | GitHub Pages |

공통 모듈 원칙: `common/` 모듈끼리는 서로 참조하지 않으며, 모든 조합은 이 앱(`index.html`·`js/`)에서 이루어진다.
common의 기존 `config.js`(ConfigUtil)·`kakao.js`(KakaoUtil)는 이 앱에서 쓰지 않는다 — `keys.js`·`kakao-geo.js`와 이름만 비슷한 별개 파일.

---

## 파일 구조

```
119hyd-Map2/
├── index.html                 마크업 + 버전(APP_VERSION) + 파일 목록(AppFiles)
├── css/                       아래 순서대로 불러옴
│   ├── variables.css       CSS 변수 (다크 테마 색상 · 공통 ExcelUtil 테마)
│   ├── common.css          초기화 · 버튼 · 입력 · 배지 · 토스트 · 관리자 전용/PC 전용 표시
│   ├── modal.css           모달 · 폼
│   ├── print.css           지도 인쇄 모드 · 인쇄 미리보기 조작 바
│   ├── home.css            홈 화면 (계획 카드 · 세분계획 트리)
│   ├── map.css             지도 화면 배치 · 목록 · 모바일 · 툴바 · 검색 · 거리재기 · 로드뷰
│   ├── marker.css          마커 · 툴팁 · 정보카드(InfoWindow) · 카드 안 사진
│   ├── hydrant-form.css    정보카드 안의 소화전 점검 입력
│   └── overlay.css         화면 위에 뜨는 것: 사진 뷰어 · 진단 패널 · 진행 막대 · 사진 바텀시트 (+ 로드뷰 버튼)
├── js/                        아래 순서대로 불러옴 (공통 모듈 다음)
│   ├── config.js           상수 — 키·주소는 common/keys.js(APP_KEYS)에서 읽음
│   ├── state.js            전역 상태 변수 · hyState 통합 저장소
│   ├── core.js             기본 도구 (esc · DOM 캐시 · safeStorage · 토스트 · 모달 · sbClient)
│   ├── auth.js             관리자 로그인 · 점검자/점검일자
│   ├── project.js          홈 화면: 계획 목록 · 세분계획 · 구역 담당 팀 순환 · 계획 생성/수정/삭제
│   ├── project-open.js     계획 열기/닫기 · 계획 데이터 불러오기
│   ├── filter.js           그룹 필터 · 정렬 · 축소 시 마커 숨김 · 필터 적용 · 통계
│   ├── pick.js             개별 선택 후 지도에 표시 · 조 재배정
│   ├── map-core.js         카카오 지도 초기화 · 툴바 표시 · 진단 · 항목 활성화/전체 보기
│   ├── marker.js           그룹 색상 · 마커 · 정보카드(팝업) 그리기
│   ├── hydrant-form.js     정보카드 안의 소화전 점검 입력 · 자동 저장
│   ├── photo.js            사진: 썸네일 · 압축 · Cloudinary 업로드 · 뷰어 · 바텀시트
│   ├── history.js          변경 이력 (hydmap_history)
│   ├── record.js           완료 토글 · 점검일 · 메모
│   ├── list.js             목록 그리기
│   ├── nocoord.js          좌표 없는 소화전: 위치 지정 · 지도 없이 정보카드 · 모아 보기 버튼
│   ├── overlap.js          같은 자리에 겹친 소화전: 묶음 계산 · 개수 배지 · 눌러서 고르기
│   ├── closed.js           폐전 표시 (회색 마커 · 진행률과 인쇄에서 제외 · 되돌리기)
│   ├── location.js         잘못된 위치 수정 · 좌표→주소 · 좌표 재검색 · 확인 핀
│   ├── location-master.js  위치 원장 (hydmap_locations)
│   ├── geocode.js          주소 → 좌표 (KakaoGeo · Nominatim)
│   ├── excel.js            엑셀 업로드 · 컬럼 재설정 · 결과 내보내기 (공통 ExcelUtil 사용)
│   ├── search.js           지도 검색
│   ├── gps.js              현위치 · 정밀 GPS 보정
│   ├── batch-fix.js        일괄 위치수정 (PC 전용)
│   ├── map-tools.js        지도 도구: 확대/축소 · 툴팁 · 이름표 · 위성 · 거리재기
│   ├── print.js            인쇄: 범위 선택 · 점검 목록표
│   ├── print-map.js        지도 인쇄 · 여러 장 나누기 · 미리보기 조작
│   ├── print-area.js       인쇄 영역 지정 (지도에서 드래그, PC 전용)
│   ├── roadview.js         로드뷰
│   ├── mobile.js           모바일 지도/목록 전환
│   └── init.js             시작 (DOMContentLoaded) · 키보드
├── tools/bump-version.py      버전 한 번에 바꾸기 · 배포 전 확인
├── manual.html / manual.md    사용설명서
├── CHANGELOG.md
└── README.md
```

모든 js 파일은 일반 `<script>`(모듈 아님)라서 함수·변수는 원본처럼 전역에서 서로 보인다.
파일을 새로 만들면 `index.html`의 `AppFiles.css` / `AppFiles.js` 목록에 이름을 적는다 (적은 순서대로 불러옴).

## 버전 · 배포

버전은 **`index.html` 맨 위 `APP_VERSION` 한 곳**에서 관리한다.

- 이 값이 css/·js/·공통 모듈 주소 뒤에 `?v=버전`으로 붙는다 → 버전을 올리면 브라우저가 전부 새로 받는다.
- css/·js/ 파일마다 첫머리에 같은 버전이 적혀 있다. 앱이 켜질 때 비교해서 하나라도 다르거나 못 불러오면
  화면 맨 위에 빨간 경고 띠(파일 이름 포함)가 뜬다. "파일 다시 받기"를 누르면 해당 파일만 새로 받아 새로고침한다.

배포 순서:

```
python tools/bump-version.py 3.0.1     # index.html + css/ + js/ 의 버전을 한 번에 바꿈
(CHANGELOG.md 작성)
python tools/bump-version.py --check   # 버전 불일치 · 빠진 파일 · 목록에 안 적은 파일 확인
(index.html, css/, js/ 를 함께 올리기)
```

- 공통 모듈(`common/`)만 고친 경우에도 이 앱의 버전을 올려야 사용자가 새 공통 파일을 받는다. 공통 파일을 먼저 올리고 앱을 올린다.
- `index.html` 자체는 GitHub Pages가 최대 10분쯤 캐시한다. 배포 직후 옛 화면이면 새로고침(Ctrl+Shift+R).

---

## 데이터 구조 (Supabase)

```
hydmap_projects   계획 (id, name, description, sort_order, expire_at,
                        parent_id → hydmap_projects.id,  ← 세분계획용
                        filter_group)                     ← 세분계획용
hydmap_items      소화전 (id, inspection_id, name, address, group_name,
                          lat, lng, extra jsonb, loc_fixed_at)
hydmap_done       점검 완료 (item_id, inspection_id, done_at)
hydmap_memo       메모 (item_id, inspection_id, memo)
hydmap_photos     사진 (item_id, inspection_id, url, caption)
hydmap_records    점검 기록 (item_id, inspection_id, hydrant_type,
                            도색/보온 상태, result, defect_detail)

Storage: hydmap-files  (업로드 원본 엑셀 — {project_id}/original.*)
```

FK 관계: `hydmap_done/memo/photos/records.item_id → hydmap_items.id (ON DELETE CASCADE)`
이 FK 덕분에 데이터 로드는 PostgREST 임베딩으로 **쿼리 1번**에 처리됩니다:

```js
SupabaseUtil.select('hydmap_items', {
  eq: { inspection_id: id },
  columns: '*,hydmap_done(*),hydmap_memo(*),hydmap_photos(*),hydmap_records(*)'
})
```

임베딩 실패 시(관계 미설정 등) 자동으로 기존 5-쿼리 방식으로 폴백합니다.

---

## 아키텍처 메모

### 상태 관리 — `hyState` 통합 저장소
점검 상태는 `hyState[item_id] = { done, memo, photos, hydrant }` 단일 객체에 저장됩니다.
기존 코드 호환을 위해 `doneMap` / `memoMap` / `photoMap` / `hydrantMap`은 이 객체를 들여다보는 **Proxy 뷰**로 유지되어, `doneMap[id] = x`, `delete doneMap[id]` 같은 기존 문법이 그대로 동작합니다.

### 팝업 지연 렌더링
정보카드 HTML은 마커 생성 시점이 아니라 **실제로 열 때 한 번만** 생성됩니다 (`ensurePopupRendered`).
수백 개 마커를 로드해도 열어본 카드만 DOM 비용을 지불합니다.

### 안전장치
- `safeStorage` — localStorage 예외(사파리 프라이빗 모드, 용량 초과) 발생 시에도 앱이 멈추지 않음
- Cloudinary 업로드 재시도 — 4xx(설정 오류)는 즉시 실패, 네트워크 오류만 지수 백오프 재시도
- 지오코딩 실패 항목은 "좌표없음" 태그 + 개별 재시도 버튼 제공

---

## 초기 설정 (새로 배포하는 경우)

1. **Supabase**: 위 테이블 생성 + FK 제약 + `hydmap-files` Storage 버킷. 세분계획용 컬럼:
   ```sql
   ALTER TABLE hydmap_projects ADD COLUMN IF NOT EXISTS parent_id bigint
     REFERENCES hydmap_projects(id) ON DELETE CASCADE;
   ALTER TABLE hydmap_projects ADD COLUMN IF NOT EXISTS filter_group text;
   NOTIFY pgrst, 'reload schema';
   ```
2. **Kakao Developers**: JS 키 발급 후 웹 플랫폼 도메인에 배포 도메인 등록 (도메인 제한)
3. **Cloudinary**: unsigned upload preset 생성
4. 키·주소는 이 저장소가 아니라 공통 설정 `common/keys.js`에 둔다 (`APP_KEYS.SUPABASE.hydrant`, `APP_KEYS.KAKAO_JS_KEY`, `APP_KEYS.CLOUDINARY`). `js/config.js`가 거기서 읽는다
5. GitHub Pages로 배포 — `file://`로 직접 열면 카카오맵 도메인 인증이 실패하므로 반드시 등록된 도메인 또는 로컬 서버(`python -m http.server`)로 접속

---

## 사용 흐름

```
계획 생성 → 엑셀 업로드(팀/조 컬럼 매핑) → 지오코딩 → 지도 확인
  → 🗂 조별 세분계획 생성/갱신
    → 각 조원: 자기 조 카드 클릭 → 자기 담당만 표시된 지도에서 점검
       (완료 토글 · 종류/상태 입력 · 사진 · 메모 · 위치 보정)
  → 팀장/서: 부모 계획 카드에서 전체 진행률 확인
  → 점검 종료 후 결과 엑셀 출력
```

---

## 보안

- **Supabase anon key**: 프론트 노출은 설계상 정상 — 접근 제어는 RLS 정책으로 수행
- **Kakao 키**: 도메인 제한이 가능한 JS 키만 사용 (REST 키의 프론트 하드코딩 금지)
- **Cloudinary**: unsigned preset은 업로드 폴더(`hydmap/`)로 범위 제한

---
