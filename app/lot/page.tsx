'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { db, LOT_STATUS_LABEL, LOT_STATUS_COLOR } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface LotRow {
  id: string
  lot_no: string
  status: string
  qty_total: number
  qty_available: number
  inbound_date: string | null
  product_name: string
  party_name: string
}

const STATUS_OPTIONS = [
  'ALL',
  'RECEIVED', 'INCOMING_INSPECTION_WAIT', 'INCOMING_OK', 'INCOMING_NG',
  'READY_FOR_PROCESS', 'IN_PROCESS', 'PROCESS_DONE',
  'PROCESS_INSPECTION_WAIT', 'PROCESS_OK', 'PROCESS_NG',
  'FINAL_INSPECTION_WAIT', 'FINAL_OK', 'SHIPPED', 'ON_HOLD',
]

export default function LotSearchPage() {
  const router = useRouter()
  const [rows, setRows] = useState<LotRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = db.mes.from('lot_master')
      .select('id, lot_no, status, qty_total, qty_available, inbound_date, product_id, work_order_id')
      .order('created_at', { ascending: false })
      .limit(300)
    if (status !== 'ALL') q = q.eq('status', status)
    if (dateFrom) q = q.gte('inbound_date', dateFrom)
    if (dateTo) q = q.lte('inbound_date', dateTo)

    const { data } = await q
    if (!data) { setLoading(false); return }

    const productIds = [...new Set(data.map((r: any) => r.product_id).filter(Boolean))]
    const woIds = [...new Set(data.map((r: any) => r.work_order_id).filter(Boolean))]
    const [prodRes, woRes] = await Promise.all([
      productIds.length > 0 ? db.mdm.from('products').select('id, product_name').in('id', productIds) : Promise.resolve({ data: [] }),
      woIds.length > 0 ? db.mes.from('work_orders').select('id, delivery_plan_id').in('id', woIds) : Promise.resolve({ data: [] }),
    ])
    const planIds = [...new Set((woRes.data ?? []).map((w: any) => w.delivery_plan_id).filter(Boolean))]
    const [planRes] = await Promise.all([
      planIds.length > 0 ? db.mes.from('delivery_plans').select('id, party_id').in('id', planIds) : Promise.resolve({ data: [] }),
    ])
    const partyIds = [...new Set((planRes.data ?? []).map((p: any) => p.party_id).filter(Boolean))]
    const { data: partiesData } = partyIds.length > 0 ? await db.core.from('parties').select('id, party_name').in('id', partyIds) : { data: [] }

    const prodMap: Record<string, string> = {}
    ;(prodRes.data ?? []).forEach((p: any) => { prodMap[p.id] = p.product_name })
    const partyMap: Record<string, string> = {}
    ;(partiesData ?? []).forEach((p: any) => { partyMap[p.id] = p.party_name })
    const planMap: Record<string, string> = {}
    ;(planRes.data ?? []).forEach((p: any) => { planMap[p.id] = p.party_id })
    const woMap: Record<string, string> = {}
    ;(woRes.data ?? []).forEach((w: any) => { woMap[w.id] = planMap[w.delivery_plan_id] ?? '' })

    const result = data.map((r: any) => ({
      ...r,
      product_name: prodMap[r.product_id] ?? '-',
      party_name: r.work_order_id ? (partyMap[woMap[r.work_order_id]] ?? '-') : '-',
    }))

    const searchLow = search.toLowerCase()
    setRows(search ? result.filter((r: LotRow) =>
      r.lot_no.toLowerCase().includes(searchLow) ||
      r.product_name.toLowerCase().includes(searchLow) ||
      r.party_name.toLowerCase().includes(searchLow)
    ) : result)
    setLoading(false)
  }, [status, dateFrom, dateTo, search])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">LOT 검색</h1>
      <div className="flex gap-3 mb-4 flex-wrap">
        <Input placeholder="LOT번호 / 품목명 / 고객사" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="상태 전체" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s} value={s}>{s === 'ALL' ? '전체' : (LOT_STATUS_LABEL[s] ?? s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" className="w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="text-gray-400 self-center">~</span>
        <Input type="date" className="w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <Button onClick={load} className="bg-green-600 hover:bg-green-700">검색</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-b-2 border-green-500 rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{['LOT번호','품목명','고객사','총수량','가용수량','입고일','상태'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/lot/${encodeURIComponent(r.lot_no)}`)}>
                  <td className="px-4 py-3 font-mono font-semibold text-green-700">{r.lot_no}</td>
                  <td className="px-4 py-3 text-gray-800">{r.product_name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.party_name}</td>
                  <td className="px-4 py-3 text-right">{r.qty_total.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{r.qty_available.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{r.inbound_date ?? '-'}</td>
                  <td className="px-4 py-3">
                    <Badge className={LOT_STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-600'}>
                      {LOT_STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">검색 결과가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
