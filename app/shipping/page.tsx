'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { supabase, 바코드Type, 품목Type, 업체Type, 출하이력Type, 거래명세서Type } from '@/lib/supabase'

/* ─── 타입 ─────────────────────────────────────────── */
interface 출하대기Item {
  id: string
  바코드: string | null
  lot_no: string | null
  lot수량: number
  출고수량: number | null
  품목id: string | null
  고객id: string | null
  품명: string
  품번: string | null
  업체명: string
  차종: string | null
  입고일: string | null
  공정: string
  작업지시서id: string | null
}

interface 출하목록Item extends 출하대기Item {
  출고수량입력: number
  출하일: string
}

/* ─── 유틸 ─────────────────────────────────────────── */
const today = () => new Date().toISOString().slice(0, 10)

function generateInvoiceNo(): string {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `INV-${ymd}-${rand}`
}

/* ─── 탭 정의 ──────────────────────────────────────── */
type TabType = '출하대기' | '출하목록' | '출하이력'
const TABS: TabType[] = ['출하대기', '출하목록', '출하이력']

/* ─── 메인 페이지 ──────────────────────────────────── */
export default function ShippingPage() {
  const [activeTab, setActiveTab] = useState<TabType>('출하대기')

  // 데이터
  const [barcodes, setBarcodes] = useState<바코드Type[]>([])
  const [items, setItems] = useState<품목Type[]>([])
  const [clients, setClients] = useState<업체Type[]>([])
  const [histories, setHistories] = useState<출하이력Type[]>([])
  const [invoices, setInvoices] = useState<거래명세서Type[]>([])
  const [loading, setLoading] = useState(true)

  // 출하목록 (장바구니)
  const [cart, setCart] = useState<출하목록Item[]>([])

  // 출하이력 daterange
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())

  // 검색
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // 디테일 뷰
  const [selectedHistory, setSelectedHistory] = useState<출하이력Type | null>(null)

  // 처리 상태
  const [processing, setProcessing] = useState(false)

  /* ─── 데이터 로딩 ────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    const [{ data: b }, { data: m }, { data: c }] = await Promise.all([
      supabase.from('바코드').select('*, 품목:품목id(품명,공정,품번,차종), 업체:고객id(업체명,이니셜)').order('created_at', { ascending: false }),
      supabase.from('품목').select('*').order('품목id'),
      supabase.from('업체').select('*').order('고객id'),
    ])
    if (b) setBarcodes(b as unknown as 바코드Type[])
    if (m) setItems(m as unknown as 품목Type[])
    if (c) setClients(c as unknown as 업체Type[])
    setLoading(false)
  }, [])

  const fetchHistories = useCallback(async () => {
    const { data } = await supabase
      .from('출하이력')
      .select('*, 바코드:바코드id(바코드,lot수량,lot_no,작업지시서id,공정진행데이터,출하검사데이터), 품목:품목id(품명,품번,공정), 업체:고객id(업체명), 거래명세서:거래명세서id(거래명세서번호)')
      .gte('출하일', dateFrom)
      .lte('출하일', dateTo)
      .order('created_at', { ascending: false })
    if (data) setHistories(data as unknown as 출하이력Type[])
  }, [dateFrom, dateTo])

  const fetchInvoices = useCallback(async () => {
    const { data } = await supabase
      .from('거래명세서')
      .select('*, 업체:고객id(업체명)')
      .order('created_at', { ascending: false })
    if (data) setInvoices(data as unknown as 거래명세서Type[])
  }, [])

  useEffect(() => {
    fetchAll()
    fetchInvoices()
  }, [fetchAll, fetchInvoices])

  useEffect(() => {
    if (activeTab === '출하이력') fetchHistories()
  }, [activeTab, fetchHistories])

  useEffect(() => {
    const ch = supabase.channel('shipping')
      .on('postgres_changes', { event: '*', schema: 'public', table: '바코드' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: '출하이력' }, fetchHistories)
      .on('postgres_changes', { event: '*', schema: 'public', table: '거래명세서' }, fetchInvoices)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll, fetchHistories, fetchInvoices])

  // 클릭 외부 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ─── 출하대기 데이터 (출하검사 완료 = '출고완료' 상태 or 출하검사 완료 상태) ── */
  const 출하대기목록 = useMemo<출하대기Item[]>(() => {
    // 출하검사 완료 = 공정상태가 '출하검사' 이상이면서 아직 출하이력에 없는 것
    // 실제론 출하검사 완료 후 출고 전 상태
    // 현재 구조에서는 "출고완료" 상태 LOT 중 출하이력에 아직 안 들어간 것 + "출하검사" 완료 상태의 LOT
    return barcodes
      .filter(b => b.공정상태 === '출고완료' || (b.공정상태 === '출하검사' && b.출하검사일시))
      .map(b => {
        const 품목 = b.품목 as { 품명: string; 공정: string; 품번: string | null; 차종: string | null } | null
        const 업체 = b.업체 as { 업체명: string } | null
        return {
          id: b.id,
          바코드: b.바코드,
          lot_no: b.lot_no,
          lot수량: b.lot수량,
          출고수량: b.출고수량,
          품목id: b.품목id,
          고객id: b.고객id,
          품명: 품목?.품명 ?? '—',
          품번: 품목?.품번 ?? null,
          업체명: 업체?.업체명 ?? '—',
          차종: b.차종 ?? 품목?.차종 ?? null,
          입고일: b.입고일,
          공정: 품목?.공정 ?? '—',
          작업지시서id: (b as unknown as { 작업지시서id: string | null }).작업지시서id,
        }
      })
  }, [barcodes])

  /* ─── 검색 필터링 ─────────────────────────────────── */
  const filteredWaiting = useMemo(() => {
    if (!searchQuery) return 출하대기목록
    const q = searchQuery.toLowerCase()
    return 출하대기목록.filter(item =>
      item.품명.toLowerCase().includes(q) ||
      item.업체명.toLowerCase().includes(q) ||
      (item.품번 && item.품번.toLowerCase().includes(q)) ||
      (item.바코드 && item.바코드.toLowerCase().includes(q)) ||
      (item.lot_no && item.lot_no.toLowerCase().includes(q))
    )
  }, [출하대기목록, searchQuery])

  /* ─── 추천 목록 (가장 많이 출하되는 고객사) ──────── */
  const topCustomers = useMemo(() => {
    const counts: Record<string, number> = {}
    출하대기목록.forEach(item => {
      counts[item.업체명] = (counts[item.업체명] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name)
  }, [출하대기목록])

  const topProducts = useMemo(() => {
    const counts: Record<string, number> = {}
    출하대기목록.forEach(item => {
      counts[item.품명] = (counts[item.품명] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name)
  }, [출하대기목록])

  /* ─── 출하대기 → 출하목록 추가 ────────────────────── */
  const addToCart = (item: 출하대기Item) => {
    if (cart.some(c => c.id === item.id)) return
    setCart(prev => [...prev, {
      ...item,
      출고수량입력: item.lot수량,
      출하일: today(),
    }])
    setActiveTab('출하목록')
  }

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(c => c.id !== id))
  }

  const updateCartItem = (id: string, field: string, value: string | number) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  /* ─── 출하 처리 (거래명세서 생성 + 출하이력 기록) ──── */
  const handleShip = async () => {
    if (cart.length === 0) return
    setProcessing(true)

    try {
      // 고객사별 그룹핑
      const groups: Record<string, 출하목록Item[]> = {}
      for (const item of cart) {
        const key = item.고객id || 'unknown'
        if (!groups[key]) groups[key] = []
        groups[key].push(item)
      }

      for (const [고객id, groupItems] of Object.entries(groups)) {
        const 총수량 = groupItems.reduce((s, i) => s + i.출고수량입력, 0)
        const 총금액 = groupItems.reduce((s, i) => {
          const product = items.find(p => p.품목id === i.품목id)
          return s + i.출고수량입력 * (product?.단가 || 0)
        }, 0)

        // 거래명세서 생성
        const invoiceNo = generateInvoiceNo()
        const { data: inv } = await supabase
          .from('거래명세서')
          .insert({
            거래명세서번호: invoiceNo,
            고객id,
            출하일: groupItems[0].출하일,
            총수량,
            총금액,
          })
          .select()
          .single()

        if (!inv) continue

        // 출하이력 라인 생성
        for (const item of groupItems) {
          const product = items.find(p => p.품목id === item.품목id)
          const 단가 = product?.단가 || 0
          await supabase.from('출하이력').insert({
            거래명세서id: inv.id,
            바코드id: item.id,
            품목id: item.품목id,
            고객id: item.고객id,
            출고수량: item.출고수량입력,
            단가,
            공급가액: item.출고수량입력 * 단가,
            출하일: item.출하일,
          })

          // 바코드 상태 업데이트 (출고수량 기록)
          await supabase.from('바코드').update({
            출고수량: item.출고수량입력,
            출고일자: item.출하일,
            공정상태: '출고완료',
            출고완료일시: new Date().toISOString(),
          }).eq('id', item.id)
        }
      }

      setCart([])
      setActiveTab('출하이력')
      await Promise.all([fetchAll(), fetchHistories(), fetchInvoices()])
    } finally {
      setProcessing(false)
    }
  }

  /* ─── 출하이력 그룹핑 데이터 ──────────────────────── */
  const historyWithNo = useMemo(() => {
    return histories.map((h, idx) => ({
      ...h,
      no: histories.length - idx,
    }))
  }, [histories])

  const filteredHistory = useMemo(() => {
    if (!searchQuery && activeTab !== '출하이력') return historyWithNo
    if (!searchQuery) return historyWithNo
    const q = searchQuery.toLowerCase()
    return historyWithNo.filter(h => {
      const 품명 = (h.품목 as { 품명: string } | null)?.품명 ?? ''
      const 업체명 = (h.업체 as { 업체명: string } | null)?.업체명 ?? ''
      const 거래번호 = (h.거래명세서 as { 거래명세서번호: string } | null)?.거래명세서번호 ?? ''
      const 바코드 = (h.바코드 as { 바코드: string } | null)?.바코드 ?? ''
      return 품명.toLowerCase().includes(q) ||
        업체명.toLowerCase().includes(q) ||
        거래번호.toLowerCase().includes(q) ||
        바코드.toLowerCase().includes(q)
    })
  }, [historyWithNo, searchQuery, activeTab])

  /* ─── 디테일 정보 로딩 ────────────────────────────── */
  const [detailWorkOrder, setDetailWorkOrder] = useState<Record<string, unknown> | null>(null)

  const loadDetail = async (history: 출하이력Type) => {
    setSelectedHistory(history)
    const bc = history.바코드 as { 작업지시서id: string | null } | null
    if (bc?.작업지시서id) {
      const { data } = await supabase
        .from('작업지시서')
        .select('*, 품목:품목id(품명,공정), 업체:고객id(업체명)')
        .eq('id', bc.작업지시서id)
        .single()
      setDetailWorkOrder(data as Record<string, unknown> | null)
    } else {
      setDetailWorkOrder(null)
    }
  }

  /* ─── 탭 카운트 ──────────────────────────────────── */
  const counts = {
    '출하대기': 출하대기목록.length,
    '출하목록': cart.length,
    '출하이력': histories.length,
  }

  /* ─── 컬럼 정의 ──────────────────────────────────── */
  const chW = createColumnHelper<출하대기Item>()
  const waitingCols = useMemo(() => [
    chW.display({
      id: 'mainLot', header: 'Main LOT',
      cell: ({ row }) => (
        <div>
          <div className="font-mono text-xs text-gray-700 tracking-wider">{row.original.바코드 ?? '—'}</div>
          {row.original.lot_no && <div className="text-[11px] text-gray-400">{row.original.lot_no}</div>}
        </div>
      ),
    }),
    chW.accessor('품명', {
      id: '품명', header: '품명',
      cell: ({ getValue }) => <span className="text-sm font-semibold text-gray-900">{getValue()}</span>,
    }),
    chW.accessor('품번', {
      id: '품번', header: '품번',
      cell: ({ getValue }) => <span className="text-xs text-gray-500 font-mono">{getValue() ?? '—'}</span>,
    }),
    chW.accessor('업체명', {
      id: '고객사', header: '고객사',
      cell: ({ getValue }) => <span className="text-sm text-gray-600">{getValue()}</span>,
    }),
    chW.accessor('lot수량', {
      id: 'LOT수량', header: 'LOT수량',
      cell: ({ getValue }) => <span className="text-sm font-semibold">{getValue().toLocaleString()}</span>,
      meta: { className: 'text-right', headerClassName: 'text-right' },
    }),
    chW.display({
      id: '출고수량', header: '출고수량',
      cell: ({ row }) => <span className="text-sm text-gray-500">{row.original.출고수량?.toLocaleString() ?? '—'}</span>,
      meta: { className: 'text-right', headerClassName: 'text-right' },
    }),
    chW.accessor('입고일', {
      id: '날짜', header: '날짜',
      cell: ({ getValue }) => <span className="text-xs text-gray-500">{getValue()}</span>,
    }),
    chW.display({
      id: 'action', header: '',
      cell: ({ row }) => {
        const inCart = cart.some(c => c.id === row.original.id)
        return (
          <button
            onClick={() => addToCart(row.original)}
            disabled={inCart}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${inCart ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
          >
            {inCart ? '추가됨' : '출하목록 추가'}
          </button>
        )
      },
    }),
  ], [cart])

  const chH = createColumnHelper<출하이력Type & { no: number }>()
  const historyCols = useMemo(() => [
    chH.accessor('no', {
      id: 'no', header: 'NO',
      cell: ({ getValue }) => <span className="font-mono font-bold text-gray-500 text-sm">{getValue()}</span>,
      meta: { headerClassName: 'w-14' },
    }),
    chH.display({
      id: '거래명세서', header: '거래명세서',
      cell: ({ row }) => {
        const no = (row.original.거래명세서 as { 거래명세서번호: string } | null)?.거래명세서번호 ?? '—'
        return <span className="font-mono text-xs text-blue-600 font-semibold">{no}</span>
      },
    }),
    chH.display({
      id: 'mainLot', header: 'Main LOT',
      cell: ({ row }) => {
        const bc = row.original.바코드 as { 바코드: string } | null
        return <span className="font-mono text-xs text-gray-700 tracking-wider">{bc?.바코드 ?? '—'}</span>
      },
    }),
    chH.display({
      id: '품명', header: '품명',
      cell: ({ row }) => {
        const p = row.original.품목 as { 품명: string } | null
        return <span className="text-sm font-semibold text-gray-900">{p?.품명 ?? '—'}</span>
      },
    }),
    chH.display({
      id: '품번', header: '품번',
      cell: ({ row }) => {
        const p = row.original.품목 as { 품번: string | null } | null
        return <span className="text-xs text-gray-500 font-mono">{p?.품번 ?? '—'}</span>
      },
    }),
    chH.display({
      id: '고객사', header: '고객사',
      cell: ({ row }) => {
        const u = row.original.업체 as { 업체명: string } | null
        return <span className="text-sm text-gray-600">{u?.업체명 ?? '—'}</span>
      },
    }),
    chH.display({
      id: 'LOT수량', header: 'LOT수량',
      cell: ({ row }) => {
        const bc = row.original.바코드 as { lot수량: number } | null
        return <span className="text-sm font-semibold">{bc?.lot수량?.toLocaleString() ?? '—'}</span>
      },
      meta: { className: 'text-right', headerClassName: 'text-right' },
    }),
    chH.accessor('출고수량', {
      id: '출고수량', header: '출고수량',
      cell: ({ getValue }) => <span className="text-sm font-bold text-green-700">{getValue().toLocaleString()}</span>,
      meta: { className: 'text-right', headerClassName: 'text-right' },
    }),
    chH.accessor('출하일', {
      id: '출하일', header: '날짜',
      cell: ({ getValue }) => <span className="text-xs text-gray-500">{getValue()}</span>,
    }),
    chH.display({
      id: 'detail', header: '',
      cell: ({ row }) => (
        <button
          onClick={() => loadDetail(row.original)}
          className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          상세
        </button>
      ),
    }),
  ], [])

  /* ─── 렌더링 ─────────────────────────────────────── */
  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900">출하 관리</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            대기 {counts['출하대기']} · 목록 {counts['출하목록']} · 이력 {counts['출하이력']}
          </p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex bg-white border-b border-gray-200 overflow-x-auto flex-shrink-0 scrollbar-none">
        {TABS.map(t => {
          const isActive = activeTab === t
          const colors: Record<TabType, string> = {
            '출하대기': 'border-amber-500 text-amber-700',
            '출하목록': 'border-blue-500 text-blue-700',
            '출하이력': 'border-green-600 text-green-700',
          }
          return (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`relative px-5 py-3 text-sm font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 flex-shrink-0
                ${isActive ? `${colors[t]} border-current` : 'text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-300'}`}>
              {t}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-current/10' : 'bg-gray-100 text-gray-400'}`}>
                {counts[t] ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      {/* 출하이력일 때 daterange */}
      {activeTab === '출하이력' && (
        <div className="flex items-center gap-3 px-4 md:px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-500">기간</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <span className="text-gray-400">~</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          <button onClick={() => { setDateFrom(today()); setDateTo(today()) }}
            className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">오늘</button>
          <button onClick={() => {
            const d = new Date()
            d.setDate(d.getDate() - 7)
            setDateFrom(d.toISOString().slice(0, 10))
            setDateTo(today())
          }} className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">최근 7일</button>
          <button onClick={() => {
            const d = new Date()
            d.setDate(d.getDate() - 30)
            setDateFrom(d.toISOString().slice(0, 10))
            setDateTo(today())
          }} className="px-3 py-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">최근 30일</button>
        </div>
      )}

      {/* 검색 영역 */}
      {(activeTab === '출하대기' || activeTab === '출하이력') && (
        <div className="px-4 md:px-6 py-2.5 bg-white border-b border-gray-100 flex-shrink-0" ref={searchRef}>
          <div className="relative max-w-md">
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="고객사, 품명, 품번, 바코드 검색..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white pr-8"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setShowDropdown(false) }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            )}
            {showDropdown && !searchQuery && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
                {topCustomers.length > 0 && (
                  <div className="p-2">
                    <p className="text-[10px] font-bold text-gray-400 uppercase px-2 mb-1">고객사 (빈도순)</p>
                    {topCustomers.map(name => (
                      <button key={name} onClick={() => { setSearchQuery(name); setShowDropdown(false) }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg truncate">
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                {topProducts.length > 0 && (
                  <div className="p-2 border-t border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase px-2 mb-1">품명 (빈도순)</p>
                    {topProducts.map(name => (
                      <button key={name} onClick={() => { setSearchQuery(name); setShowDropdown(false) }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg truncate">
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                {topCustomers.length === 0 && topProducts.length === 0 && (
                  <div className="p-4 text-center text-sm text-gray-400">추천 항목 없음</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 출하대기 탭 ─────────────────────────────── */}
      {activeTab === '출하대기' && (
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="w-7 h-7 border-b-2 border-gray-300 rounded-full animate-spin mr-3" />불러오는 중...
            </div>
          ) : filteredWaiting.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <p className="text-sm font-semibold mb-1">출하 대기 항목이 없습니다</p>
              <p className="text-xs">출하검사 완료된 LOT가 여기에 표시됩니다</p>
            </div>
          ) : (
            <>
              {/* 데스크탑 */}
              <div className="hidden md:block p-5">
                <DataTable
                  data={filteredWaiting}
                  columns={waitingCols as any}
                  defaultSorting={[{ id: '날짜', desc: true }]}
                  groupByOptions={[
                    { id: '고객사', label: '고객사' },
                    { id: '품명', label: '품명' },
                  ]}
                  emptyMessage="출하 대기 항목이 없습니다"
                />
              </div>
              {/* 모바일 카드 */}
              <div className="md:hidden p-3 space-y-2 pb-4">
                {filteredWaiting.map(item => {
                  const inCart = cart.some(c => c.id === item.id)
                  return (
                    <div key={item.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-bold text-gray-900 truncate">{item.품명}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{item.업체명} · {item.lot수량}EA</div>
                          <div className="font-mono text-xs text-gray-500 mt-1 tracking-wider">{item.바코드}</div>
                          {item.품번 && <div className="text-[11px] text-gray-400 mt-0.5">품번: {item.품번}</div>}
                        </div>
                        <button
                          onClick={() => addToCart(item)}
                          disabled={inCart}
                          className={`shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg ${inCart ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white'}`}
                        >
                          {inCart ? '추가됨' : '출하목록'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── 출하목록 탭 (장바구니) ──────────────────── */}
      {activeTab === '출하목록' && (
        <div className="flex-1 overflow-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <p className="text-sm font-semibold mb-1">출하 목록이 비어있습니다</p>
              <p className="text-xs">출하대기에서 항목을 추가해 주세요</p>
              <button onClick={() => setActiveTab('출하대기')}
                className="mt-3 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600">
                출하대기로 이동
              </button>
            </div>
          ) : (
            <div className="p-4 md:p-6">
              {/* 고객사별 그룹핑 */}
              {Object.entries(
                cart.reduce<Record<string, 출하목록Item[]>>((acc, item) => {
                  const key = item.업체명
                  if (!acc[key]) acc[key] = []
                  acc[key].push(item)
                  return acc
                }, {})
              ).map(([customer, groupItems]) => (
                <div key={customer} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-base font-bold text-gray-900">{customer}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">{groupItems.length}건</span>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 font-semibold border-b border-gray-200">
                          <th className="px-3 py-2 text-left">Main LOT</th>
                          <th className="px-3 py-2 text-left">품명</th>
                          <th className="px-3 py-2 text-left">품번</th>
                          <th className="px-3 py-2 text-right">LOT수량</th>
                          <th className="px-3 py-2 text-right">출고수량</th>
                          <th className="px-3 py-2 text-left">날짜</th>
                          <th className="px-3 py-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupItems.map(item => (
                          <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                            <td className="px-3 py-2">
                              <span className="font-mono text-xs text-gray-700 tracking-wider">{item.바코드 ?? '—'}</span>
                            </td>
                            <td className="px-3 py-2 font-semibold text-gray-900">{item.품명}</td>
                            <td className="px-3 py-2 text-xs text-gray-500 font-mono">{item.품번 ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{item.lot수량.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="1"
                                max={item.lot수량}
                                value={item.출고수량입력}
                                onChange={e => updateCartItem(item.id, '출고수량입력', Number(e.target.value))}
                                className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="date"
                                value={item.출하일}
                                onChange={e => updateCartItem(item.id, '출하일', e.target.value)}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button onClick={() => removeFromCart(item.id)}
                                className="text-red-400 hover:text-red-600 text-lg leading-none font-bold">&times;</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {/* 출하 실행 버튼 */}
              <div className="flex items-center justify-between mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-blue-900">총 {cart.length}건 · {cart.reduce((s, c) => s + c.출고수량입력, 0).toLocaleString()} EA</p>
                  <p className="text-xs text-blue-600 mt-0.5">고객사별 거래명세서가 자동 생성됩니다</p>
                </div>
                <button
                  onClick={handleShip}
                  disabled={processing}
                  className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
                >
                  {processing ? '처리 중...' : '출하 처리'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 출하이력 탭 ─────────────────────────────── */}
      {activeTab === '출하이력' && (
        <div className="flex-1 overflow-auto flex">
          <div className={`flex-1 overflow-auto ${selectedHistory ? 'max-w-[65%]' : ''}`}>
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="w-7 h-7 border-b-2 border-gray-300 rounded-full animate-spin mr-3" />불러오는 중...
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <p className="text-sm font-semibold mb-1">해당 기간 출하 이력이 없습니다</p>
                <p className="text-xs">날짜 범위를 조정해 보세요</p>
              </div>
            ) : (
              <div className="hidden md:block p-5">
                <DataTable
                  data={filteredHistory}
                  columns={historyCols as any}
                  defaultSorting={[{ id: 'no', desc: true }]}
                  groupByOptions={[
                    { id: '거래명세서', label: '거래명세서' },
                    { id: '고객사', label: '고객사' },
                    { id: '출하일', label: '날짜' },
                    { id: '품명', label: '품명' },
                  ]}
                  emptyMessage="출하 이력이 없습니다"
                />
              </div>
            )}

            {/* 모바일 카드형 */}
            <div className="md:hidden p-3 space-y-2 pb-4">
              {filteredHistory.map(h => {
                const 품명 = (h.품목 as { 품명: string } | null)?.품명 ?? '—'
                const 업체명 = (h.업체 as { 업체명: string } | null)?.업체명 ?? '—'
                const 거래번호 = (h.거래명세서 as { 거래명세서번호: string } | null)?.거래명세서번호 ?? '—'
                const 바코드 = (h.바코드 as { 바코드: string } | null)?.바코드 ?? '—'
                return (
                  <div key={h.id} onClick={() => loadDetail(h)}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 active:bg-gray-50 cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400">#{h.no}</span>
                          <span className="text-base font-bold text-gray-900 truncate">{품명}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{업체명} · {h.출고수량}EA · {h.출하일}</div>
                        <div className="font-mono text-xs text-gray-500 mt-1">{바코드}</div>
                      </div>
                      <span className="shrink-0 text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-semibold font-mono">{거래번호}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 디테일 패널 */}
          {selectedHistory && (
            <div className="hidden md:flex w-[35%] min-w-[320px] border-l border-gray-200 bg-white flex-col overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-900">상세 정보</h3>
                <button onClick={() => { setSelectedHistory(null); setDetailWorkOrder(null) }}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
              </div>
              <div className="p-4 space-y-4">
                {/* 출하 정보 */}
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">출하 정보</h4>
                  <div className="space-y-1.5">
                    <InfoRow label="거래명세서" value={(selectedHistory.거래명세서 as { 거래명세서번호: string } | null)?.거래명세서번호 ?? '—'} />
                    <InfoRow label="고객사" value={(selectedHistory.업체 as { 업체명: string } | null)?.업체명 ?? '—'} />
                    <InfoRow label="품명" value={(selectedHistory.품목 as { 품명: string } | null)?.품명 ?? '—'} />
                    <InfoRow label="품번" value={(selectedHistory.품목 as { 품번: string | null } | null)?.품번 ?? '—'} />
                    <InfoRow label="Main LOT" value={(selectedHistory.바코드 as { 바코드: string } | null)?.바코드 ?? '—'} />
                    <InfoRow label="출고수량" value={`${selectedHistory.출고수량.toLocaleString()} EA`} />
                    <InfoRow label="단가" value={selectedHistory.단가 ? `₩${Number(selectedHistory.단가).toLocaleString()}` : '—'} />
                    <InfoRow label="공급가액" value={selectedHistory.공급가액 ? `₩${Number(selectedHistory.공급가액).toLocaleString()}` : '—'} />
                    <InfoRow label="출하일" value={selectedHistory.출하일} />
                  </div>
                </div>

                {/* 작업지시서 정보 */}
                {detailWorkOrder && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">작업지시서</h4>
                    <div className="space-y-1.5">
                      <InfoRow label="작업번호" value={`WO-${String(detailWorkOrder.작업번호 ?? '').padStart(4, '0')}`} />
                      <InfoRow label="공정구분" value={String(detailWorkOrder.공정구분 ?? '—')} />
                      <InfoRow label="우선순위" value={String(detailWorkOrder.우선순위 ?? '—')} />
                      <InfoRow label="상태" value={String(detailWorkOrder.상태 ?? '—')} />
                      <InfoRow label="납기예정일" value={String(detailWorkOrder.납기예정일 ?? '—')} />
                      <InfoRow label="메모" value={String(detailWorkOrder.메모 ?? '—')} />
                    </div>
                  </div>
                )}

                {/* 공정 정보 */}
                {(() => {
                  const bc = selectedHistory.바코드 as { 공정진행데이터: string | null; 출하검사데이터: string | null } | null
                  const processData = bc?.공정진행데이터 ? (() => { try { return JSON.parse(bc.공정진행데이터!) } catch { return null } })() : null
                  const inspData = bc?.출하검사데이터 ? (() => { try { return JSON.parse(bc.출하검사데이터!) } catch { return null } })() : null
                  if (!processData && !inspData) return null
                  return (
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">공정 데이터</h4>
                      {processData && (
                        <div className="space-y-1.5 mb-3">
                          <p className="text-xs font-semibold text-gray-500">공정진행</p>
                          {Object.entries(processData).map(([k, v]) => (
                            <InfoRow key={k} label={k} value={String(v ?? '—')} />
                          ))}
                        </div>
                      )}
                      {inspData && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-gray-500">출하검사</p>
                          {Object.entries(inspData).map(([k, v]) => (
                            <InfoRow key={k} label={k} value={String(v ?? '—')} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── 공통 InfoRow ────────────────────────────────── */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-400 font-semibold">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value}</span>
    </div>
  )
}
