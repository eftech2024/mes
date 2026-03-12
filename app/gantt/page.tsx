'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { CalendarOff } from 'lucide-react'
import { supabase, 작업지시서Type, 판매계획Type } from '@/lib/supabase'

type ViewMode = '주' | '월' | '년'

const PROC_COLOR: Record<string, string> = {
  '연질': 'bg-sky-500',
  '경질': 'bg-violet-500',
  '본딩': 'bg-orange-500',
}
const PROC_BTN: Record<string, string> = {
  '연질': 'bg-sky-500 text-white',
  '경질': 'bg-violet-500 text-white',
  '본딩': 'bg-orange-500 text-white',
}
const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
function toDate(s: string): Date {
  const d = new Date(s); d.setHours(0, 0, 0, 0); return d
}

interface GItem {
  id: string; type: '작업' | '계획'
  품명: string; 고객사: string; 공정: string
  start: Date; end: Date; status: string; urgent: boolean
}

export default function GanttPage() {
  const [orders, setOrders] = useState<작업지시서Type[]>([])
  const [plans,  setPlans]  = useState<판매계획Type[]>([])
  const [loading, setLoading] = useState(true)

  const [viewMode, setViewMode] = useState<ViewMode>('월')
  const [offset,   setOffset]   = useState(0)
  const [filterStart, setFilterStart] = useState('')
  const [filterEnd,   setFilterEnd]   = useState('')
  const [filterType, setFilterType]   = useState('전체')
  const [filterProc, setFilterProc]   = useState('전체')

  const fetchAll = useCallback(async () => {
    const [{ data: o }, { data: p }] = await Promise.all([
      supabase.from('작업지시서').select('*, 업체:고객id(업체명), 품목:품목id(품명,공정)')
        .neq('상태', '완료').order('납기예정일'),
      supabase.from('판매계획').select('*, 업체:고객id(업체명), 품목:품목id(품명,공정)')
        .neq('상태', '완료').order('납품요청일'),
    ])
    if (o) setOrders(o as unknown as 작업지시서Type[])
    if (p) setPlans(p  as unknown as 판매계획Type[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('gantt')
      .on('postgres_changes', { event: '*', schema: 'public', table: '작업지시서' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: '판매계획' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d
  }, [])

  /* ── 뷰 범위 계산 ────────────────────────────── */
  const { viewStart, viewEnd, colCount } = useMemo(() => {
    const dow     = today.getDay()
    const monday  = addDays(today, -(dow === 0 ? 6 : dow - 1))
    switch (viewMode) {
      case '주': {
        const s = addDays(monday, offset * 7)
        return { viewStart: s, viewEnd: addDays(s, 6), colCount: 7 }
      }
      case '월': {
        const s = addDays(monday, offset * 28)
        return { viewStart: s, viewEnd: addDays(s, 27), colCount: 28 }
      }
      case '년': {
        const yr = today.getFullYear() + offset
        return {
          viewStart: new Date(yr, 0, 1),
          viewEnd:   new Date(yr, 11, 31),
          colCount:  12,
        }
      }
    }
  }, [viewMode, offset, today])

  const days = useMemo(
    () => viewMode !== '년'
      ? Array.from({ length: colCount }, (_, i) => addDays(viewStart, i))
      : [],
    [viewMode, viewStart, colCount]
  )

  /* ── 전체 아이템 목록 ────────────────────────── */
  const allItems = useMemo<GItem[]>(() => [
    ...orders.map(o => ({
      id: o.id, type: '작업' as const,
      품명:   (o.품목 as { 품명:string }|null)?.품명 ?? o.품목id ?? '—',
      고객사: (o.업체 as { 업체명:string }|null)?.업체명 ?? o.고객id ?? '—',
      공정:   (o.품목 as { 공정:string }|null)?.공정 ?? o.공정구분,
      start:  toDate(o.created_at),
      end:    toDate(o.납기예정일),
      status: o.상태, urgent: o.우선순위 === '긴급',
    })),
    ...plans.map(p => ({
      id: p.id, type: '계획' as const,
      품명:   (p.품목 as { 품명:string }|null)?.품명 ?? p.품목id ?? '—',
      고객사: (p.업체 as { 업체명:string }|null)?.업체명 ?? p.고객id ?? '—',
      공정:   (p.품목 as { 공정:string }|null)?.공정 ?? '—',
      start:  toDate(p.등록일),
      end:    toDate(p.납품요청일),
      status: p.상태, urgent: p.긴급여부,
    })),
  ], [orders, plans])

  /* ── 필터링 ──────────────────────────────────── */
  const items = useMemo(() => {
    const fs = filterStart ? toDate(filterStart) : null
    const fe = filterEnd   ? toDate(filterEnd)   : null
    return allItems
      .filter(it => {
        if (filterType !== '전체' && it.type !== filterType) return false
        if (filterProc !== '전체' && it.공정 !== filterProc) return false
        if (fs && it.end < fs) return false
        if (fe && it.start > fe) return false
        // 뷰 범위와의 겹침 확인
        return it.end >= addDays(viewStart, -90) && it.start <= addDays(viewEnd, 90)
      })
      .sort((a, b) => a.end.getTime() - b.end.getTime())
  }, [allItems, filterType, filterProc, filterStart, filterEnd, viewStart, viewEnd])

  /* ── 바 위치 계산 ────────────────────────────── */
  function barStyle(item: GItem): React.CSSProperties {
    if (viewMode === '년') {
      const yr   = today.getFullYear() + offset
      const ys   = new Date(yr, 0, 1)
      const total = diffDays(ys, new Date(yr + 1, 0, 0)) + 1
      const s = Math.max(0, diffDays(ys, item.start))
      const e = Math.min(total - 1, diffDays(ys, item.end))
      return { left: `${(s / total) * 100}%`, width: `${(Math.max(1, e - s + 1) / total) * 100}%` }
    }
    const s = Math.max(0, diffDays(viewStart, item.start))
    const e = Math.min(colCount - 1, diffDays(viewStart, item.end))
    return { left: `${(s / colCount) * 100}%`, width: `${(Math.max(1, e - s + 1) / colCount) * 100}%` }
  }

  const todayOff = diffDays(viewStart, today)

  const todayYearFrac = useMemo(() => {
    if (viewMode !== '년') return -1
    const yr = today.getFullYear() + offset
    const ys = new Date(yr, 0, 1)
    const total = diffDays(ys, new Date(yr + 1, 0, 0)) + 1
    const td = diffDays(ys, today)
    return (td >= 0 && td < total) ? td / total : -1
  }, [viewMode, offset, today])

  const periodLabel = viewMode === '년'
    ? `${today.getFullYear() + offset}년`
    : `${viewStart.getMonth()+1}/${viewStart.getDate()} – ${viewEnd.getMonth()+1}/${viewEnd.getDate()}`

  const hasFilter = filterType !== '전체' || filterProc !== '전체' || filterStart || filterEnd

  return (
    <div className="h-full flex flex-col">

      {/* ── 헤더 ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900">생산 일정표</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            작업지시 {orders.length}건 · 판매계획 {plans.length}건
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 뷰 모드 토글 */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1">
            {(['주','월','년'] as ViewMode[]).map(m => (
              <button key={m}
                onClick={() => { setViewMode(m); setOffset(0) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  viewMode === m
                    ? 'bg-white text-green-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                {m}
              </button>
            ))}
          </div>

          {/* 네비게이션 */}
          <button onClick={() => setOffset(0)}
            className="text-xs px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg font-semibold">
            오늘
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => setOffset(o => o - 1)}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 text-lg font-bold">
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">
              {periodLabel}
            </span>
            <button onClick={() => setOffset(o => o + 1)}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 text-lg font-bold">
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ── 필터 바 ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 md:px-6 py-2.5 bg-white border-b border-gray-100 flex-shrink-0 flex-wrap">
        {/* 유형 필터 */}
        <div className="flex items-center gap-1">
          {['전체','작업','계획'].map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filterType === t
                  ? 'bg-gray-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* 공정 필터 */}
        <div className="flex items-center gap-1">
          {['전체','연질','경질','본딩'].map(p => (
            <button key={p} onClick={() => setFilterProc(p)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                filterProc === p
                  ? p === '전체' ? 'bg-gray-700 text-white' : PROC_BTN[p]
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {p}
            </button>
          ))}
        </div>

        {/* 날짜 필터 */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-gray-400">시작일</label>
            <input type="date" value={filterStart}
              onChange={e => setFilterStart(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"/>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-gray-400">종료일</label>
            <input type="date" value={filterEnd}
              onChange={e => setFilterEnd(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"/>
          </div>
          {hasFilter && (
            <button
              onClick={() => { setFilterType('전체'); setFilterProc('전체'); setFilterStart(''); setFilterEnd('') }}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium px-2 py-1 rounded-lg hover:bg-gray-100">
              초기화
            </button>
          )}
        </div>
      </div>

      {/* ── 범례 ─────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 md:px-6 py-2 bg-white border-b border-gray-100 flex-shrink-0 text-xs text-gray-500 flex-wrap">
        {Object.entries(PROC_COLOR).map(([proc, cls]) => (
          <span key={proc} className="flex items-center gap-1.5">
            <span className={`w-4 h-2.5 rounded-sm ${cls} inline-block`}/>
            {proc} 작업
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-2.5 rounded-sm bg-green-100 border border-green-400 inline-block"/>
          판매계획
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-px h-3.5 bg-green-500"/>
          오늘
        </span>
      </div>

      {/* ── 본문 ─────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="w-8 h-8 border-b-2 border-gray-300 rounded-full animate-spin mr-3"/>불러오는 중...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <CalendarOff className="w-10 h-10 mb-3 text-gray-300" />
            <p className="text-sm font-medium">해당 기간에 일정이 없습니다</p>
            <button onClick={() => { setOffset(0); setFilterType('전체'); setFilterProc('전체'); setFilterStart(''); setFilterEnd('') }}
              className="mt-3 text-green-600 text-sm font-semibold underline">
              필터 초기화
            </button>
          </div>
        ) : (
          <div className={viewMode === '주' ? 'p-4 md:p-5 min-w-[560px]' : viewMode === '월' ? 'p-4 md:p-5 min-w-[800px]' : 'p-4 md:p-5 min-w-[700px]'}>

            {/* 날짜 헤더 */}
            <div className="flex border-b-2 border-gray-200 pb-1 mb-1.5">
              <div className="w-44 flex-shrink-0"/>
              <div className="flex-1 flex relative">
                {viewMode === '년' ? (
                  MONTH_LABELS.map((m, i) => {
                    const isCurMonth = (today.getFullYear() + offset) === today.getFullYear() && today.getMonth() === i
                    return (
                      <div key={i} style={{ width: '8.333%' }}
                        className={`text-center text-xs font-semibold py-0.5 ${
                          isCurMonth ? 'text-green-600 font-bold' : 'text-gray-500'
                        }`}>
                        {m}
                        {isCurMonth && <div className="w-1 h-1 rounded-full bg-green-500 mx-auto mt-0.5"/>}
                      </div>
                    )
                  })
                ) : (
                  days.map((d, i) => {
                    const isToday   = d.getTime() === today.getTime()
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6
                    const isMon     = d.getDay() === 1
                    return (
                      <div key={i} style={{ width: `${100 / colCount}%` }}
                        className={`text-center py-0.5 font-semibold ${
                          viewMode === '주' ? 'text-xs' : 'text-[9px]'
                        } ${
                          isToday ? 'text-green-600 font-bold' :
                          isWeekend ? 'text-red-400' :
                          isMon ? 'text-gray-700' : 'text-gray-400'
                        }`}>
                        {(i === 0 || isMon) ? `${d.getMonth() + 1}/` : ''}{d.getDate()}
                        {isToday && <div className="w-1 h-1 rounded-full bg-green-500 mx-auto mt-0.5"/>}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* 아이템 행 */}
            <div className="space-y-1">
              {items.map(item => {
                const barCls = item.type === '계획'
                  ? 'bg-green-100 border border-green-400 text-green-800'
                  : `${PROC_COLOR[item.공정] ?? 'bg-teal-500'} text-white`

                return (
                  <div key={`${item.type}-${item.id}`} className="flex items-center h-9">
                    {/* 품명만 표시 */}
                    <div className="w-44 flex-shrink-0 pr-3 flex items-center">
                      {item.urgent && (
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5"/>
                      )}
                      <span className="text-xs font-semibold text-gray-900 truncate" title={item.품명}>
                        {item.품명}
                      </span>
                    </div>

                    {/* 바 영역 */}
                    <div className="flex-1 relative h-8">
                      {/* 주말 배경 */}
                      {viewMode !== '년' && days.map((d, i) =>
                        (d.getDay() === 0 || d.getDay() === 6) && (
                          <div key={i}
                            style={{ left: `${(i / colCount) * 100}%`, width: `${100 / colCount}%` }}
                            className="absolute top-0 h-full bg-red-50 opacity-40"/>
                        )
                      )}
                      {/* 오늘 선 */}
                      {viewMode !== '년' && todayOff >= 0 && todayOff < colCount && (
                        <div style={{ left: `${((todayOff + 0.5) / colCount) * 100}%` }}
                          className="absolute top-0 h-full w-px bg-green-500 opacity-60 z-10"/>
                      )}
                      {viewMode === '년' && todayYearFrac >= 0 && (
                        <div style={{ left: `${todayYearFrac * 100}%` }}
                          className="absolute top-0 h-full w-px bg-green-500 opacity-60 z-10"/>
                      )}
                      {/* Gantt 바 */}
                      <div
                        style={barStyle(item)}
                        className={`absolute top-1 h-6 rounded-full flex items-center px-2.5 shadow-sm overflow-hidden transition-all hover:brightness-95 cursor-default ${barCls} ${item.urgent ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}
                        title={`${item.품명} (${item.고객사}) | ${item.start.toLocaleDateString('ko-KR')} ~ ${item.end.toLocaleDateString('ko-KR')}`}
                      >
                        <span className="text-[11px] font-bold truncate leading-none whitespace-nowrap">
                          {item.품명}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
