export type UrgencyLevel = 'overdue' | 'urgent' | 'warning' | 'normal' | 'safe'

export interface Urgency {
  level: UrgencyLevel
  label: string
  dday: number
}

export function calcUrgency(납기일: string): Urgency {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(납기일)
  due.setHours(0, 0, 0, 0)
  const diff = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diff < 0) return { level: 'overdue', label: '기한초과', dday: diff }
  if (diff <= 3)  return { level: 'urgent',  label: '긴급',   dday: diff }
  if (diff <= 7)  return { level: 'warning', label: '주의',   dday: diff }
  if (diff <= 14) return { level: 'normal',  label: '보통',   dday: diff }
  return                 { level: 'safe',    label: '여유',   dday: diff }
}

export const URGENCY_SORT: Record<UrgencyLevel, number> = {
  overdue: 0,
  urgent:  1,
  warning: 2,
  normal:  3,
  safe:    4,
}

// Tailwind 클래스
export const URGENCY_BADGE: Record<UrgencyLevel, string> = {
  overdue: 'bg-red-100 text-red-700 border border-red-200',
  urgent:  'bg-red-50  text-red-600  border border-red-200',
  warning: 'bg-orange-50 text-orange-600 border border-orange-200',
  normal:  'bg-yellow-50 text-yellow-700 border border-yellow-200',
  safe:    'bg-green-50 text-green-700 border border-green-200',
}

export const URGENCY_DOT: Record<UrgencyLevel, string> = {
  overdue: 'bg-red-600',
  urgent:  'bg-red-500 animate-pulse',
  warning: 'bg-orange-400 animate-pulse',
  normal:  'bg-yellow-400',
  safe:    'bg-green-500',
}
