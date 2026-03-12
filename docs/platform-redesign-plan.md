# 아노다이징 통합 플랫폼 재설계안 (MES/QRP/ERP/현장)

## 1) 현재 구조 진단 (코드 기반 확인)

### A. 인터록 부재로 인한 데이터 불일치 위험
- 작업지시 생성 후 바코드 생성이 프론트에서 분리 실행됨:
  - `app/workorder/page.tsx:165` 작업지시 insert
  - `app/workorder/page.tsx:173` 바코드 insert
- 위 두 동작이 DB 트랜잭션이 아니므로 한쪽만 성공 가능.
- 재고 반영도 선택형이라 무결성 깨짐:
  - `app/workorder/page.tsx:572` `완료 + 재고 자동 반영`
  - `app/workorder/page.tsx:573` `완료만 (재고 변경 없음)`

### B. 입고등록이 작업지시와 별도 동작
- 바코드 화면에서 독립적으로 입고 등록/바코드 생성 가능:
  - `app/barcode/page.tsx:528`, `app/barcode/page.tsx:657`, `app/barcode/page.tsx:418`, `app/barcode/page.tsx:423`
- 따라서 "작업지시 없이 입고" 또는 "입고 없이 작업지시"가 가능해 현재 요구사항(강한 연동)과 상충.

### C. 재고가 수동 편집/삭제 가능
- 재고 직접 수정/삭제 가능:
  - `app/inventory/page.tsx:55`, `app/inventory/page.tsx:62`, `app/inventory/page.tsx:178`
- LOT 기반 실적/검사 기반이 아니라 수동 값이 우선되므로 허수 재고 발생 가능.

### D. LOT 상세 추적 정보 불충분
- LOT 상세는 타임라인만 표시하고 측정값/검사성적서/세부 이력 링크 부재:
  - `app/lot/[barcode]/page.tsx:54` select에 검사결과/첨부문서 구조 없음
- 요구사항(공정별 날짜, 측정값, 검사성적서, 품명/품번/규격/관련 정보)은 현재 스키마와 UI가 부족.

### E. 스키마/코드 불일치 가능성
- 코드에서는 공정별 데이터 컬럼을 사용하지만 기본 SQL에는 없음. 별도 마이그레이션 스크립트 의존:
  - 코드 참조: `app/barcode/page.tsx:20`, `app/barcode/page.tsx:23`
  - 별도 컬럼 추가 스크립트: `run-migration.mjs`

### F. 보안 위험 (즉시 조치 필요)
- DB 접속 비밀번호가 코드에 하드코딩됨:
  - `run-migration.mjs:11`

## 2) 목표 운영 원칙 (필수)

1. 단일 진실원천(SSOT): LOT 단위로 생산/검사/재고를 추적.
2. 강한 인터록: 작업지시, LOT, 입고, 공정실적, 재고가 트랜잭션으로 묶여야 함.
3. 상태기계(FSM): 임의 상태 변경 금지, 정의된 전이만 허용.
4. 재고는 이벤트 기반 자동 계산: 수동 입력 금지(조정은 별도 승인 트랜잭션).
5. 추적성(Traceability): LOT -> 공정실적 -> 검사값 -> 성적서 -> 출하까지 역추적 가능.
6. 품질 문서(검사협정/FMEA/PPAP/ISIR/SOP/WI)는 품목 Revision과 결합.

## 3) 권장 도메인 모델 (핵심 테이블)

기존 테이블을 유지하되 아래를 추가/정규화.

### Core
- `work_order` (작업지시)
- `lot` (LOT 헤더, 작업지시 FK 필수)
- `lot_operation` (공정 단계별 시작/완료/설비/작업자)
- `inspection_result` (측정값, 판정, 샘플링 조건)
- `inspection_report` (검사성적서 파일/번호/승인)
- `inventory_txn` (재고 증감 원장: 입고/투입/완료/출하/조정)
- `inventory_balance` (원장 집계 뷰 또는 머티리얼라이즈드 뷰)

### Master/PLM/QMS
- `customer` (사업자정보, 담당자, 계약조건)
- `customer_contact`
- `item` (품번/품명/규격/공정라우팅)
- `item_revision` (rev, 유효일, 변경사유)
- `control_plan`
- `inspection_agreement`
- `fmea`
- `ppap`
- `isir`
- `work_standard`, `work_instruction`
- `document_file` (첨부 저장소 메타)

### Traceability / Audit
- `genealogy_link` (원자재/반제품/완제품 연결)
- `nonconformance` (부적합)
- `capa` (시정/예방조치)
- `audit_log` (누가/언제/무엇을 변경)

## 4) 인터록 규칙 (DB 레벨 강제)

### 필수 규칙
1. 작업지시 생성 시 LOT 1건 이상 자동 생성(또는 즉시 LOT 생성 API).
2. LOT 생성 시 바코드 자동 발급.
3. LOT 없이는 입고/공정/검사/출하 불가.
4. 공정단계 전이는 `state_transition` 규칙으로만 가능.
5. 재고는 `inventory_txn`만 기록 가능, `inventory_balance` 직접 수정 금지.
6. "완료만(재고 미반영)" 같은 옵션 제거.
7. 수동 재고조정은 `inventory_txn(type='ADJUST')` + 승인자 + 사유 필수.

### 구현 방법
- Supabase RPC(PL/pgSQL)로 원자적 트랜잭션 제공.
- 프론트에서 직접 여러 테이블 insert/update 금지, 반드시 RPC 호출.

## 5) 우선 구현 API (RPC)

- `rpc_create_work_order_and_lot(...)`
  - 작업지시 + LOT + 바코드 + 초기 재고원장(필요 시) 동시 처리.
- `rpc_register_receipt(lot_id, qty, location, user_id)`
  - 입고등록 + 상태전이 + 재고원장.
- `rpc_record_operation(lot_id, op_code, measurements_json, attachments_json, user_id)`
  - 공정실적 + 검사값 + 문서연결 + 상태전이.
- `rpc_complete_and_post_inventory(lot_id, good_qty, ng_qty, user_id)`
  - 완료 + 양품/불량 분개 + 재고반영.
- `rpc_ship_lot(lot_id, ship_qty, doc_id, user_id)`
  - 출하 + 재고차감 + 성적서 연결.

## 6) LOT Detail View 목표 화면

`/lot/[barcode]`에서 아래를 한 화면 또는 탭으로 제공.

1. 요약 카드
- 품명, 품번, 고객, 차종, LOT, 수량, 현재상태, 작업지시번호

2. 공정 타임라인
- 각 공정 시작/완료시각, 작업자, 설비, 소요시간

3. 검사 데이터
- 항목명, 규격(USL/LSL), 측정값, 판정, 검사자, 검사일시

4. 검사성적서/첨부
- PDF/이미지, 문서번호, rev, 승인자, 승인일

5. 연관정보
- FMEA, Control Plan, 검사협정, 작업표준/지침 링크

6. 이력/Audit
- 변경 로그, 상태 전이 이력, 예외 처리 이력

## 7) MES / QRP / ERP / 현장 분리안

### MES
- 작업지시, LOT, 공정실적, 생산진행, 설비/작업자 실적

### QRP (Quality)
- 수입/공정/출하 검사, SPC, 부적합, CAPA, 성적서 발행

### ERP
- 수주/납품계획, 재고회계, 구매/외주, 마감/원가

### 현장용
- 스캔 중심 UI, 최소 입력, 대형 버튼, 오프라인 큐(필요 시)

공통 ID 전략:
- `work_order_no`, `lot_no`, `barcode`, `shipment_no`, `report_no`를 시스템 전역 키로 사용.

## 8) IATF16949 기능 매핑 (핵심)

1. 문서/기록관리
- 문서 rev, 승인, 배포이력, 변경이력

2. 추적성
- LOT genealogy, 공정/검사/출하 전체 연결

3. 변경관리
- 품목/공정/검사기준 변경 승인 워크플로우

4. 리스크 기반 사고
- PFMEA 항목과 공정/검사 항목 연결

5. 검증/검사
- 검사협정 기반 샘플링, 측정기 이력(MSA는 2차 단계)

6. 부적합/시정조치
- NCR -> CAPA -> 효과성 검증

7. 성과 모니터링
- PPM, FPY, OTD, 공정불량률, 고객클레임 지표

## 9) 마스터 확장안 (고객 OCR 포함)

### 고객 마스터
- 사업자번호, 법인번호, 업태/종목, 주소, 계좌, 담당자 다건
- 첨부: 사업자등록증, 계약서, 품질협정서

### OCR 플로우
1. 사업자등록증 업로드
2. OCR 추출(사업자번호, 상호, 대표자, 주소, 개업일)
3. 사용자 검수 화면
4. `customer`/`customer_contact` 자동 입력

### 품목 마스터
- 품번/품명/규격/재질/표면처리/장입량/CTQ
- Rev별 문서(FMEA/PPAP/ISIR/검사협정/작업표준/작업지침)
- 고객사별 승인 이력 및 적용 시작일

## 10) 단계별 실행 계획

### Phase 0 (1~2주) 안정화
- 민감정보 제거: `run-migration.mjs` 비밀번호 즉시 폐기/교체.
- 스키마 단일화: SQL 마이그레이션 체계화.
- LOT/작업지시/재고 분리로직 제거 설계 확정.

### Phase 1 (2~4주) 인터록 MVP
- RPC 5종 구현.
- 작업지시 생성 시 LOT+바코드 자동 생성.
- 재고는 원장 기반 자동 반영.
- `inventory` 화면 수동 수정/삭제 비활성화.

### Phase 2 (3~5주) LOT 상세 고도화
- 공정/검사/첨부 문서 통합 Detail View.
- 검사성적서 업로드/조회/연결.

### Phase 3 (4~8주) 품질/문서 체계
- FMEA/PPAP/ISIR/검사협정/작업표준 관리.
- 변경승인 워크플로우.

### Phase 4 (4~8주) ERP 연계 + 대시보드
- 수주/납품/출하/원가/재고회계 연계.
- KPI 및 감사 추적 리포트.

## 11) 즉시 코드 수정 권고 (현재 앱 기준)

1. `app/workorder/page.tsx`
- 작업지시 insert + 바코드 insert를 RPC 1회 호출로 대체.
- `완료만(재고 변경 없음)` 버튼 제거.

2. `app/barcode/page.tsx`
- 독립 `입고 등록` 버튼 제거 또는 권한 제한.
- 입고는 작업지시/LOT 존재 시에만 허용.

3. `app/inventory/page.tsx`
- 수동 `update/upsert/delete` UI 제거.
- 원장 집계 뷰 전용 조회 화면으로 전환.

4. `app/lot/[barcode]/page.tsx`
- 공정별 측정값/판정/첨부문서/작업자/설비 표시 섹션 추가.

## 12) 성공 기준 (완료 정의)

1. 허수 재고 0건 (월말 실사 오차율 목표 설정).
2. LOT 역추적 30초 이내 (바코드 스캔 기준).
3. 공정 누락/역전 전이 0건 (상태기계로 차단).
4. 검사성적서 누락 출하 0건.
5. 고객/품목 마스터 OCR 등록 후 검수 완료율 95% 이상.
