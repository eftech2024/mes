// ============================================================
// 바코드 생성 유틸리티
// 형식: 순번(2) + YY(2) + MM(2) + DD(2) + 차종코드(4) = 12자리
//
// 차종코드 규칙: 차종명의 앞 두 영문자를 알파벳 순번으로 변환
//   A=01, B=02, ..., Z=26  /  없으면 0000
//   FE → F=06, E=05 → 0605 (기존 정적 맵 검증 완료)
// ============================================================

function charToCode(c: string): string {
  const n = c.toUpperCase().charCodeAt(0) - 64 // A=1
  if (n < 1 || n > 26) return '00'
  return String(n).padStart(2, '0')
}

/**
 * 차종명으로 4자리 차종코드를 동적 생성한다.
 * @example getVehicleCode('FE') // '0605' (F=06, E=05)
 * @example getVehicleCode(null) // '0000'
 */
export function getVehicleCode(vehicleName: string | null | undefined): string {
  if (!vehicleName) return '0000'
  const letters = vehicleName.replace(/[^A-Za-z]/g, '')
  if (letters.length === 0) return '0000'
  const c1 = charToCode(letters[0])
  const c2 = letters.length >= 2 ? charToCode(letters[1]) : '00'
  return c1 + c2
}

// 하위 호환용 정적 맵 (기존 레거시 바코드 판독 보조)
export const 차종코드Map: Record<string, string> = {
  'BD': '0204', 'BMW': '0213', 'FE': '0605', 'HD': '0804',
  'LM': '1213', 'HT': '0820', 'NS': '1419', 'NH': '1408',
  'DMI': '0413', 'EDC': '0504', 'KR': '1118', 'GB': '0702',
  'UN': '2114', 'PN': '1614', 'RH': '1808', 'TS': '2019',
  'DC': '0403', 'NN': '1414', 'QS': '1719', 'PT': '1620',
}

/**
 * 바코드를 생성한다.
 * 형식: 순번(2자리) + YY(2) + MM(2) + DD(2) + 차종코드(4자리) = 12자리
 * @param seqNo       글로벌 시퀀스 번호 (1 이상)
 * @param date        입고일
 * @param vehicleName 차종명 (없으면 null → 0000)
 */
export function generateBarcode(
  seqNo: number,
  date: Date,
  vehicleName: string | null | undefined,
): string {
  const seq  = String(seqNo % 100).padStart(2, '0')
  const yy   = String(date.getFullYear()).slice(2)
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const dd   = String(date.getDate()).padStart(2, '0')
  const code = getVehicleCode(vehicleName)
  return seq + yy + mm + dd + code
}

/**
 *  LOT 번호 생성: L-YYMMDD-NNNN
 * @example generateLotNo(new Date('2026-03-13'), 1) // 'L-260313-0001'
 */
export function generateLotNo(date: Date, seq: number): string {
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `L-${yy}${mm}${dd}-${String(seq).padStart(4, '0')}`
}

/** 바코드에서 날짜를 파싱한다. */
export function parseBarcodeDate(barcode: string): Date | null {
  if (!barcode || barcode.length < 8) return null
  try {
    const yy = parseInt(barcode.slice(2, 4), 10)
    const mm = parseInt(barcode.slice(4, 6), 10) - 1
    const dd = parseInt(barcode.slice(6, 8), 10)
    const d = new Date(2000 + yy, mm, dd)
    return isNaN(d.getTime()) ? null : d
  } catch { return null }
}

// Code 39 형식: 바코드 앞뒤에 * 추가 (하위 호환)
export function barcodeC39(barcode: string): string {
  return `*${barcode}*`
}
