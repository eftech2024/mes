const FOUR_DIGIT_MAX = 9999

export function normalizeFourDigitCode(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '').slice(-4)
  return digits.padStart(4, '0')
}

export function isFourDigitCode(value: string | null | undefined): boolean {
  return /^\d{4}$/.test(value ?? '')
}

export function getNextFourDigitCode(values: Array<string | null | undefined>, startAt = 1): string {
  const used = new Set(
    values
      .map(value => normalizeFourDigitCode(value))
      .filter(value => value !== '0000')
  )

  for (let index = Math.max(1, startAt); index <= FOUR_DIGIT_MAX; index += 1) {
    const next = String(index).padStart(4, '0')
    if (!used.has(next)) return next
  }

  throw new Error('사용 가능한 4자리 코드가 없습니다.')
}

export function ensureUniqueFourDigitCode(
  input: string | null | undefined,
  existingValues: Array<string | null | undefined>,
  currentValue?: string | null,
): string {
  const candidate = normalizeFourDigitCode(input)
  const current = normalizeFourDigitCode(currentValue)
  const existing = new Set(
    existingValues
      .map(value => normalizeFourDigitCode(value))
      .filter(value => value !== '0000' && value !== current)
  )

  if (!candidate || candidate === '0000') return getNextFourDigitCode([...existing])
  if (existing.has(candidate)) throw new Error(`이미 사용 중인 코드입니다: ${candidate}`)
  return candidate
}