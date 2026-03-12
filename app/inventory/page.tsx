'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface InvRow {
  product_id: string
  product_name: string
  product_code: string
  qty_total: number
  qty_available: number
  lot_count: number
  last_inbound: string | null
}

export default function InventoryPage() {
  const [rows, setRows] = useState<InvRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    // Aggregate from lot_master where status not SHIPPED/CANCELLED
    const { data } = await db.mes.from('lot_master')
      .select('product_id, qty_total, qty_available, inbound_date, status')
      .not('status', 'in', '("SHIPPED","CANCELLED")')
      .limit(5000)

    if (!data) { setLoading(false); return }

    const productIds = [...new Set(data.map((r: any) => r.product_id).filter(Boolean))]
    const { data: prodData } = productIds.length > 0
      ? await db.mdm.from('products').select('id, product_name, product_code').in('id', productIds)
      : { data: [] }
    const prodMap: Record<string, { product_name: string; product_code: string }> = {}
    ;(prodData ?? []).forEach((p: any) => { prodMap[p.id] = p })

    const agg: Record<string, InvRow> = {}
    data.forEach((r: any) => {
      if (!r.product_id) return
      if (!agg[r.product_id]) {
        agg[r.product_id] = {
          product_id: r.product_id,
          product_name: prodMap[r.product_id]?.product_name ?? '-',
          product_code: prodMap[r.product_id]?.product_code ?? '-',
          qty_total: 0, qty_available: 0, lot_count: 0, last_inbound: null,
        }
      }
      agg[r.product_id].qty_total += r.qty_total ?? 0
      agg[r.product_id].qty_available += r.qty_available ?? 0
      agg[r.product_id].lot_count += 1
      if (r.inbound_date && (!agg[r.product_id].last_inbound || r.inbound_date > agg[r.product_id].last_inbound!)) {
        agg[r.product_id].last_inbound = r.inbound_date
      }
    })

    setRows(Object.values(agg).sort((a, b) => b.qty_available - a.qty_available))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => !search || r.product_name.toLowerCase().includes(search.toLowerCase()) || r.product_code.toLowerCase().includes(search.toLowerCase()))

  const totalQty = filtered.reduce((s, r) => s + r.qty_available, 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">재고 현황</h1>
        <Button onClick={load} variant="outline" className="text-sm">새로고침</Button>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">품목 종류</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">총 가용 수량</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{totalQty.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">LOT 수</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{filtered.reduce((s, r) => s + r.lot_count, 0)}</p>
        </div>
      </div>
      <div className="flex gap-3 mb-4">
        <Input placeholder="품목명 / 품목코드 검색" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-b-2 border-green-500 rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{['품목코드','품목명','총수량','가용수량','LOT수','최근입고일'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => (
                <tr key={r.product_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-500">{r.product_code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{r.product_name}</td>
                  <td className="px-4 py-3 text-right">{r.qty_total.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-700">{r.qty_available.toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">{r.lot_count}</td>
                  <td className="px-4 py-3 text-gray-500">{r.last_inbound ?? '-'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">재고 데이터가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
