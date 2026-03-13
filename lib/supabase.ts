import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL      || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// ── 스키마별 클라이언트 헬퍼 ─────────────────────────────────
export const db = {
  core: supabase.schema('core'),
  mdm:  supabase.schema('mdm'),
  mes:  supabase.schema('mes'),
  qms:  supabase.schema('qms'),
  sys:  supabase.schema('sys'),
  dms:  supabase.schema('dms'),
}

// ============================================================
// sys 타입
// ============================================================
export interface SysUser {
  user_id:        string
  user_code:      string | null
  user_name:      string
  department:     string | null
  position_title: string | null
  phone:          string | null
  role_code:      string      // ADMIN | MANAGER | QC | OPERATOR | VIEWER
  is_active:      boolean
  approved_at:    string | null
  created_at:     string
}

// ============================================================
// core 타입
// ============================================================
export interface Party {
  party_id:   string
  party_type: string   // CUSTOMER | SUPPLIER | INTERNAL
  party_name: string
  party_code: string | null
  initials:   string | null
  address:    string | null
  is_active:  boolean
  created_at: string
}

export interface Contact {
  contact_id:   string
  party_id:     string
  contact_name: string
  department:   string | null
  phone:        string | null
  email:        string | null
  work_type:    string | null
  handled_item: string | null
  is_primary:   boolean
  is_active:    boolean
  created_at:   string
  // nested
  party?: { party_name: string } | null
}

// ============================================================
// mdm 타입
// ============================================================
export interface Product {
  product_id:           string
  legacy_product_id:    string | null
  customer_party_id:    string | null
  ship_to_party_id:     string | null
  product_name:         string
  product_code:         string | null   // 품번
  vehicle_name:         string | null   // 차종명
  vehicle_code:         string | null   // 4자리 차종코드
  category:             string | null
  default_process_type: string          // ANODIZING | BONDING | OTHER_POST
  unit_price:           number | null
  is_active:            boolean
  remarks:              string | null
  created_at:           string
  // nested
  customer_party?:      { party_name: string; party_code: string | null } | null
  ship_to_party?:       { party_name: string } | null
  product_spec?:        ProductSpec | null
}

export interface ProductSpec {
  product_id:           string
  surface_area:         number | null
  piece_weight:         number | null
  drawing_no:           string | null
  rack_load_qty:        number | null
  immersion_seconds:    number | null
  target_voltage:       number | null
  target_current_per_pc: number | null
  spec_upper:           number | null
  spec_lower:           number | null
  remarks:              string | null
}

export interface InspectionSpecMaster {
  spec_id:          string
  inspection_stage: string   // INCOMING | PROCESS | FINAL
  process_type_code: string | null
  spec_name:        string
  check_item:       string
  measuring_tool:   string | null
  criteria_text:    string | null
  target_value:     number | null
  lower_limit:      number | null
  upper_limit:      number | null
  unit:             string | null
  sampling_rule:    string | null
  is_active:        boolean
  created_at:       string
}

export interface ProductInspectionSpec {
  id:          string
  product_id:  string
  spec_id:     string
  is_required: boolean
  sort_order:  number
  // nested
  spec?: InspectionSpecMaster | null
}

// ============================================================
// mes 타입
// ============================================================
export interface DeliveryPlan {
  plan_id:           string
  legacy_plan_id:    string | null
  customer_party_id: string | null
  product_id:        string | null
  plan_date:         string | null
  inbound_due_date:  string | null
  delivery_due_date: string | null
  planned_qty:       number
  is_urgent:         boolean
  status:            string   // OPEN | IN_PROGRESS | COMPLETED | CLOSED
  memo:              string | null
  created_at:        string
  // nested
  customer_party?:   { party_name: string } | null
  product?:          { product_name: string; product_code: string | null } | null
}

export interface WorkOrder {
  work_order_id:    string
  work_order_no:    number
  plan_id:          string | null
  product_id:       string
  customer_party_id: string | null
  process_type_code: string
  planned_qty:      number
  due_date:         string | null
  priority:         string   // URGENT | NORMAL | LOW
  status:           string   // OPEN | IN_PROGRESS | COMPLETED | CANCELLED
  memo:             string | null
  created_at:       string
  // nested
  product?:         { product_name: string; product_code: string | null; vehicle_name: string | null } | null
  customer_party?:  { party_name: string } | null
}

export interface LotMaster {
  lot_id:              string
  lot_no:              string
  work_order_id:       string | null
  product_id:          string
  customer_party_id:   string | null
  process_type_code:   string      // ANODIZING | BONDING | OTHER_POST
  receipt_type:        string
  inbound_material_state: string
  customer_trace_ref:  Record<string, unknown> | null
  qty_in:              number
  qty_available:       number
  qty_shipped:         number
  unit_price:          number | null
  inbound_date:        string | null
  current_status:      LotStatus
  notes:               string | null
  created_at:          string
  updated_at:          string
  // nested
  product?:            { product_name: string; product_code: string | null; vehicle_name: string | null; vehicle_code: string | null } | null
  customer_party?:     { party_name: string; initials: string | null } | null
  lot_barcodes?:       LotBarcode[] | null
}

export type LotStatus =
  | 'RECEIVED'
  | 'INCOMING_INSPECTION_WAIT'
  | 'INCOMING_OK'
  | 'INCOMING_NG'
  | 'READY_FOR_PROCESS'
  | 'IN_PROCESS'
  | 'PROCESS_DONE'
  | 'PROCESS_INSPECTION_WAIT'
  | 'PROCESS_OK'
  | 'PROCESS_NG'
  | 'FINAL_INSPECTION_WAIT'
  | 'FINAL_OK'
  | 'HOLD'
  | 'SHIPPED'
  | 'CLOSED'

export const LOT_STATUS_LABEL: Record<string, string> = {
  RECEIVED:                  '입고완료',
  INCOMING_INSPECTION_WAIT:  '수입검사 대기',
  INCOMING_OK:               '수입검사 합격',
  INCOMING_NG:               '수입검사 불합격',
  READY_FOR_PROCESS:         '작업 대기',
  IN_PROCESS:                '작업 진행중',
  PROCESS_DONE:              '작업 완료',
  PROCESS_INSPECTION_WAIT:   '공정검사 대기',
  PROCESS_OK:                '공정검사 합격',
  PROCESS_NG:                '공정검사 불합격',
  FINAL_INSPECTION_WAIT:     '출하검사 대기',
  FINAL_OK:                  '출하검사 합격',
  HOLD:                      '보류',
  SHIPPED:                   '출하완료',
  CLOSED:                    '종료',
}

export const LOT_STATUS_COLOR: Record<string, string> = {
  RECEIVED:                  'bg-gray-100 text-gray-700',
  INCOMING_INSPECTION_WAIT:  'bg-sky-50 text-sky-700',
  INCOMING_OK:               'bg-sky-100 text-sky-800',
  INCOMING_NG:               'bg-red-100 text-red-700',
  READY_FOR_PROCESS:         'bg-blue-50 text-blue-700',
  IN_PROCESS:                'bg-amber-50 text-amber-700',
  PROCESS_DONE:              'bg-amber-100 text-amber-800',
  PROCESS_INSPECTION_WAIT:   'bg-violet-50 text-violet-700',
  PROCESS_OK:                'bg-violet-100 text-violet-800',
  PROCESS_NG:                'bg-red-100 text-red-700',
  FINAL_INSPECTION_WAIT:     'bg-orange-50 text-orange-700',
  FINAL_OK:                  'bg-green-50 text-green-700',
  HOLD:                      'bg-yellow-100 text-yellow-800',
  SHIPPED:                   'bg-green-100 text-green-800',
  CLOSED:                    'bg-gray-200 text-gray-600',
}

export interface LotBarcode {
  barcode_id:    string
  lot_id:        string
  seq_no:        number
  barcode_value: string
  barcode_type:  string   // INTERNAL | CUSTOMER | LEGACY
  label:         string | null
  qty:           number | null
  is_primary:    boolean
  created_at:    string
}

export interface InboundReceipt {
  receipt_id:        string
  lot_id:            string
  receipt_date:      string
  receipt_qty:       number
  work_order_ref:    string | null
  source_doc_no:     string | null
  supplier_party_id: string | null
  contact_id:        string | null
  received_by:       string | null
  remarks:           string | null
  created_at:        string
}

export interface ProcessRun {
  run_id:           string
  lot_id:           string
  process_type_code: string
  input_qty:        number | null
  work_qty:         number | null
  remain_qty:       number | null
  started_at:       string | null
  completed_at:     string | null
  operator_id:      string | null
  abnormal_yn:      boolean
  remarks:          string | null
  created_at:       string
  // nested
  process_parameters?: ProcessParameter[] | null
  operator?:           { user_name: string } | null
}

export interface ProcessParameter {
  param_id:      string
  run_id:        string
  param_key:     string
  numeric_value: number | null
  text_value:    string | null
  unit_name:     string | null
}

export interface Shipment {
  shipment_id:       string
  lot_id:            string
  product_id:        string
  customer_party_id: string | null
  ship_to_party_id:  string | null
  contact_id:        string | null
  shipment_date:     string
  shipped_qty:       number
  unit_price:        number | null
  is_partial:        boolean
  remarks:           string | null
  created_by:        string | null
  created_at:        string
  // nested
  product?:          { product_name: string } | null
  customer_party?:   { party_name: string } | null
}

export interface LotEvent {
  event_id:     string
  lot_id:       string
  event_type:   string
  ref_table:    string | null
  ref_id:       string | null
  status_before: string | null
  status_after:  string | null
  qty:          number | null
  actor_user_id: string | null
  notes:        string | null
  event_at:     string
  // nested
  actor?: { user_name: string } | null
}

// ============================================================
// qms 타입
// ============================================================
export interface Inspection {
  inspection_id:    string
  lot_id:           string
  product_id:       string
  process_type_code: string
  inspection_stage: string  // INCOMING | PROCESS | FINAL
  sample_count:     number | null
  inspected_on:     string | null
  inspector_id:     string | null
  inspector_name:   string | null
  final_result:     string | null  // PASS | FAIL | HOLD
  remarks:          string | null
  created_at:       string
  // nested
  inspection_results?: InspectionResult[] | null
}

export interface InspectionResult {
  result_id:      string
  inspection_id:  string
  spec_id:        string | null
  check_item:     string
  sample_no:      number | null
  measured_value: number | null
  result_text:    string | null
  judgement:      string | null  // PASS | FAIL | N/A
  image_path:     string | null
  reason:         string | null
  follow_up:      string | null
  created_at:     string
  // nested
  spec?: InspectionSpecMaster | null
}

export interface Nonconformity {
  ncr_id:         string
  lot_id:         string
  inspection_id:  string | null
  run_id:         string | null
  defect_type:    string | null
  defect_qty:     number | null
  status:         string  // OPEN | UNDER_REVIEW | CLOSED
  disposition:    string | null
  registered_by:  string | null
  registered_at:  string
  remarks:        string | null
}

// ============================================================
// 재고 요약 뷰
// ============================================================
export interface InventorySummary {
  product_id:        string
  product_name:      string
  product_code:      string | null
  vehicle_name:      string | null
  customer_name:     string | null
  customer_party_id: string | null
  lot_count:         number
  qty_available:     number
  qty_shipped:       number
  qty_in_total:      number
  qty_received:      number
  qty_in_process:    number
  qty_ready_ship:    number
}

// ============================================================
// 레거시 호환 타입 (기존 public 스키마 테이블 — 이전 기간 병용)
// ============================================================
export interface 업체Type {
  고객id:     string
  구분:       string
  업체명:     string
  이니셜:     string | null
  업체코드:   string | null
  created_at: string
}

export interface 품목Type {
  품목id:     string
  고객id:     string | null
  납품고객id: string | null
  품명:       string
  품번:       string | null
  차종:       string | null
  공정:       string
  장입량:     number | null
  단가:       number | null
  created_at: string
}

export interface 사원Type {
  사원id:     string
  사원명:     string
  부서:       string | null
  직위:       string | null
  연락처:     string | null
  이메일:     string | null
  역할:       string
  활성:       boolean
  created_at: string
}

export interface 바코드Type {
  id:           string
  순번:         number
  품목id:       string | null
  고객id:       string | null
  lot_no:       string | null
  lot수량:      number
  차종:         string | null
  입고일:       string | null
  바코드:       string | null
  공정상태:     string
  메모:         string | null
  작업지시서id: string | null
  created_at:   string
  수입검사일시: string | null
  공정진행일시: string | null
  공정검사일시: string | null
  출하검사일시: string | null
  출고완료일시: string | null
  수입검사데이터: string | null
  공정진행데이터: string | null
  출하검사데이터: string | null
  출고일자:     string | null
  출고수량:     number | null
  품목?: { 품명: string; 공정: string; 차종: string | null } | null
  업체?: { 업체명: string; 이니셜: string | null } | null
}

export interface 재고Type {
  품목id:     string
  현재재고:   number
  updated_at: string
  품목?: { 품명: string; 공정: string; 고객id: string | null; 장입량: number | null; 업체?: { 업체명: string } | null } | null
}

export interface 검사항목정의Type {
  id:           string
  항목명:       string
  검사유형:     string
  단위:         string | null
  소수점자리:   number
  기본시료수:   number
  기본공차유형: string
  기본스펙하한: number | null
  기본스펙상한: number | null
  기본계측기:   string | null
  사용여부:     boolean
  비고:         string | null
  created_at:   string
}

export interface 검사항목마스터Type {
  id:             string
  품목id:         string
  검사공정:       string
  항목명:         string
  검사유형:       string
  계측기:         string | null
  시료수:         number
  공차유형:       string
  스펙하한:       number | null
  스펙상한:       number | null
  단위:           string | null
  정렬순서:       number
  활성:           boolean
  검사항목정의id: string | null
  소수점자리:     number
  created_at:     string
}

export interface 판매계획Type {
  id:           string
  고객id:       string | null
  품목id:       string | null
  납품요청일:   string
  입고예정수량: number
  긴급여부:     boolean
  메모:         string | null
  상태:         string
  등록일:       string
  품목?: { 품명: string } | null
  업체?: { 업체명: string } | null
}

export interface 작업지시서Type {
  id:          string
  작업번호:    number
  판매계획id:  string | null
  고객id:      string | null
  품목id:      string | null
  공정구분:    string
  우선순위:    string
  로트수량:    number
  납기예정일:  string
  상태:        string
  완료일:      string | null
  메모:        string | null
  바코드id:    string | null
  created_at:  string
  업체?:       { 업체명: string } | null
  품목?:       { 품명: string; 공정: string } | null
  바코드?:     { 바코드: string; 공정상태: string } | null
}

export interface 계측기관리Type {
  id:         string
  계측기명:   string
  관리번호:   string | null
  교정주기:   string | null
  최종교정일: string | null
  차기교정일: string | null
  상태:       string
  비고:       string | null
  created_at: string
}

// ============================================================
// app_02 mdm 신규 타입
// ============================================================
export interface DefectType {
  id:                string
  defect_code:       string
  defect_name:       string
  process_type_code: string | null
  description:       string | null
  is_active:         boolean
  created_at:        string
}

export interface MeasurementTool {
  id:                        string
  tool_code:                 string
  tool_name:                 string
  tool_type:                 string | null
  serial_no:                 string | null
  last_calibration_date:     string | null
  next_calibration_date:     string | null
  calibration_cycle_months:  number | null
  status:                    string   // NORMAL | EXPIRED | REPAIR | RETIRED
  remarks:                   string | null
  created_at:                string
}
// ─── 작업지시서 ───────────────────────────────────────────
export interface 작업지시서Type {
  id:          string
  작업번호:    number        // AUTO SERIAL — WO-0001 형식 표시용
  판매계획id:  string | null
  고객id:      string | null
  품목id:      string | null
  공정구분:    string
  우선순위:    string        // '긴급' | '보통' | '낮음'
  로트수량:    number
  납기예정일:  string
  상태:        string        // '대기' | '진행중' | '완료'  (바코드 공정상태에서 자동 유도)
  완료일:      string | null
  메모:        string | null
  바코드id:    string | null
  created_at:  string
  // nested
  업체?:       { 업체명: string } | null
  품목?:       { 품명: string; 공정: string } | null
  바코드?:     { 바코드: string; 공정상태: string } | null
}

// ─── 바코드 ───────────────────────────────────────────────
export interface 바코드Type {
  id:           string
  순번:         number
  품목id:       string | null
  고객id:       string | null
  lot_no:       string | null
  lot수량:      number
  차종:         string | null
  입고일:       string | null
  바코드:       string | null
  공정상태:     string   // '입고대기' | '수입검사' | '공정진행' | '출하검사' | '출고완료'
  메모:         string | null
  작업지시서id: string | null
  created_at:   string
  // 공정 단계별 타임스탬프
  수입검사일시: string | null
  공정진행일시: string | null
  출하검사일시: string | null
  출고완료일시: string | null
  // 공정별 검사 데이터 (JSON 문자열 - 레거시 호환)
  수입검사데이터: string | null
  공정진행데이터: string | null
  출하검사데이터: string | null
  // 출고 정보
  출고일자: string | null
  출고수량: number | null
  // nested
  품목?:        { 품명: string; 공정: string; 차종: string | null } | null
  업체?:        { 업체명: string; 이니셜: string | null } | null
  작업지시서?:  { id: string; 상태: string } | null
}

// 공정검사 탭 삭제된 공정상태 목록
export const 공정상태목록 = ['입고대기', '수입검사', '공정진행', '출하검사', '출고완료'] as const
export const 검사가능공정 = ['수입검사', '공정진행', '출하검사'] as const

// ─── 거래명세서 ───────────────────────────────────────────
export interface 거래명세서Type {
  id:             string
  거래명세서번호: string
  고객id:         string
  출하일:         string
  총수량:         number
  총금액:         number
  비고:           string | null
  작성자id:       string | null
  created_at:     string
  // nested
  업체?:          { 업체명: string } | null
}

// ─── 출하이력 ─────────────────────────────────────────────
export interface 출하이력Type {
  id:           string
  거래명세서id: string | null
  바코드id:     string
  품목id:       string | null
  고객id:       string | null
  출고수량:     number
  단가:         number | null
  공급가액:     number | null
  출하일:       string
  비고:         string | null
  created_at:   string
  // nested
  바코드?:      { 바코드: string; lot수량: number; lot_no: string | null; 작업지시서id: string | null; 공정진행데이터: string | null; 출하검사데이터: string | null } | null
  품목?:        { 품명: string; 품번: string | null; 공정: string } | null
  업체?:        { 업체명: string } | null
  거래명세서?:  { 거래명세서번호: string } | null
}

// ─── 공통 유틸 ────────────────────────────────────────────
export const 공정목록   = ['연질', '경질', '본딩'] as const
export const 우선순위목록 = ['긴급', '보통', '낮음'] as const
export const 상태목록   = ['대기', '진행중', '완료'] as const
