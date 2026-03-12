'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Settings, Microscope, CheckCircle2, Truck, Camera, Package, Factory } from 'lucide-react'
import { db } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { LOT_STATUS_LABEL, LOT_STATUS_COLOR } from '@/lib/supabase'

interface WorkQueueCount {
  status: string
  count: number
  href: string
  label: string
  desc: string
  color: string
  icon: JSX.Element
}

const QUEUE_ITEMS: WorkQueueCount[] = [
  { status: 'INCOMING_INSPECTION_WAIT', href: '/inspection/incoming', label: '수입검사 대기', desc: '입고 후 검사 필요',  color: 'sky',    icon: <Search className="w-6 h-6" />,       count: 0 },
  { status: 'READY_FOR_PROCESS',        href: '/pop',                 label: '작업 대기',    desc: '공정 투입 준비',    color: 'amber',  icon: <Settings className="w-6 h-6" />,     count: 0 },
  { status: 'PROCESS_INSPECTION_WAIT',  href: '/inspection/process',  label: '공정검사 대기', desc: '공정 완료 후 검사', color: 'violet', icon: <Microscope className="w-6 h-6" />,   count: 0 },
  { status: 'FINAL_INSPECTION_WAIT',    href: '/inspection/final',    label: '출하검사 대기', desc: '출하 전 최종 검사', color: 'orange', icon: <CheckCircle2 className="w-6 h-6" />, count: 0 },
  { status: 'FINAL_OK',                 href: '/shipment',            label: '출하 준비',    desc: '출하 처리 가능',   color: 'green',  icon: <Truck className="w-6 h-6" />,        count: 0 },
]

const colorMap: Record<string, { card: string; badge: string; btn: string }> = {
  sky:    { card: 'border-sky-200 bg-sky-50',      badge: 'bg-sky-100 text-sky-700',    btn: 'text-sky-600 hover:text-sky-800' },
  amber:  { card: 'border-amber-200 bg-amber-50',  badge: 'bg-amber-100 text-amber-700', btn: 'text-amber-600 hover:text-amber-800' },
  violet: { card: 'border-violet-200 bg-violet-50', badge: 'bg-violet-100 text-violet-700', btn: 'text-violet-600 hover:text-violet-800' },
  orange: { card: 'border-orange-200 bg-orange-50', badge: 'bg-orange-100 text-orange-700', btn: 'text-orange-600 hover:text-orange-800' },
  green:  { card: 'border-green-200 bg-green-50',  badge: 'bg-green-100 text-green-700', btn: 'text-green-600 hover:text-green-800' },
}

export default function HomePage() {
  const { user } = useAuth()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [recentLots, setRecentLots] = useState<{ lot_no: string; status: string; product_name: string; updated_at: string }[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // Parallel: count queries per status + recent lots
        const [countsResult, lotsResult] = await Promise.all([
          Promise.all(
            QUEUE_ITEMS.map(q =>
              db.mes.from('lot_master').select('id', { count: 'exact', head: true }).eq('status', q.status)
            )
          ),
          db.mes.from('lot_master')
            .select('lot_no, status, updated_at, work_order_id')
            .order('updated_at', { ascending: false })
            .limit(5),
        ])

        const newCounts: Record<string, number> = {}
        QUEUE_ITEMS.forEach((q, i) => {
          newCounts[q.status] = countsResult[i].count ?? 0
        })
        setCounts(newCounts)

        // Join product name via work_order_id for recent lots (simplified)
        setRecentLots(
          (lotsResult.data ?? []).map(l => ({
            lot_no: l.lot_no,
            status: l.status as string,
            product_name: '-',
            updated_at: l.updated_at as string,
          }))
        )
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalPending = QUEUE_ITEMS.reduce((sum, q) => sum + (counts[q.status] ?? 0), 0)

  return (
    <div className="p-4 pb-6 max-w-lg mx-auto">
      {/* 헤더 */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-gray-900">안녕하세요, {user?.user_name || user?.email}님</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      {/* 전체 처리 대기 수 */}
      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-5 mb-5 text-white shadow-sm">
        <p className="text-sm font-medium opacity-90">전체 처리 대기</p>
        {loading ? (
          <div className="mt-1 h-9 w-16 bg-white/20 rounded animate-pulse" />
        ) : (
          <p className="text-4xl font-bold mt-1">{totalPending}<span className="text-lg font-normal ml-1">건</span></p>
        )}
        <p className="text-xs opacity-70 mt-1">입고부터 출하까지 처리가 필요한 LOT</p>
      </div>

      {/* 업무 큐 카드 */}
      <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">업무 큐</h2>
      <div className="space-y-3 mb-6">
        {QUEUE_ITEMS.map(q => {
          const c = colorMap[q.color]
          const count = counts[q.status] ?? 0
          return (
            <Link key={q.status} href={q.href}
              className={`flex items-center gap-4 p-4 rounded-xl border ${c.card} transition-all active:scale-[0.98]`}>
              <span className="[&>svg]:w-6 [&>svg]:h-6">{q.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{q.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{q.desc}</p>
              </div>
              {loading ? (
                <div className="h-7 w-10 rounded-lg bg-gray-200 animate-pulse" />
              ) : (
                <span className={`text-lg font-bold px-3 py-1 rounded-xl ${c.badge}`}>{count}</span>
              )}
            </Link>
          )
        })}
      </div>

      {/* 빠른 액션 */}
      <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">빠른 액션</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link href="/scan" className="flex flex-col items-center justify-center gap-2 p-4 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-[0.97] transition-transform">
          <Camera className="w-7 h-7 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">QR 스캔</span>
        </Link>
        <Link href="/inbound" className="flex flex-col items-center justify-center gap-2 p-4 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-[0.97] transition-transform">
          <Package className="w-7 h-7 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">입고 등록</span>
        </Link>
        <Link href="/pop" className="flex flex-col items-center justify-center gap-2 p-4 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-[0.97] transition-transform">
          <Factory className="w-7 h-7 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">작업실적 (POP)</span>
        </Link>
        <Link href="/shipment" className="flex flex-col items-center justify-center gap-2 p-4 bg-white rounded-xl border border-gray-200 shadow-sm active:scale-[0.97] transition-transform">
          <Truck className="w-7 h-7 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">출하 처리</span>
        </Link>
      </div>

      {/* 최근 LOT */}
      <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-3">최근 LOT</h2>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : recentLots.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">아직 LOT 없음</div>
        ) : (
          recentLots.map((lot, i) => (
            <Link key={lot.lot_no} href={`/lot/${lot.lot_no}`}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-100' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-semibold text-gray-800">{lot.lot_no}</p>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(lot.updated_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${LOT_STATUS_COLOR[lot.status as keyof typeof LOT_STATUS_COLOR] ?? 'bg-gray-100 text-gray-600'}`}>
                {LOT_STATUS_LABEL[lot.status as keyof typeof LOT_STATUS_LABEL] ?? lot.status}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
