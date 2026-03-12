'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { db, LOT_STATUS_LABEL, LOT_STATUS_COLOR } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MasterDetailTable, type MasterDetailColumn, type MasterDetailTab } from '@/components/master-detail-table'
import { getPrimaryLotBarcode } from '@/lib/lot-barcode'

interface LotRow {
  id: string
  barcode: string
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
      .select('id, lot_no, status, qty_total, qty_available, inbound_date, product_id, work_order_id, lot_barcodes(barcode_value, barcode_type, is_primary)')
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
      barcode: getPrimaryLotBarcode(r.lot_barcodes, r.lot_no),
      product_name: prodMap[r.product_id] ?? '-',
      party_name: r.work_order_id ? (partyMap[woMap[r.work_order_id]] ?? '-') : '-',
    }))

    const searchLow = search.toLowerCase()
    setRows(search ? result.filter((r: LotRow) =>
      r.barcode.toLowerCase().includes(searchLow) ||
      r.lot_no.toLowerCase().includes(searchLow) ||
      r.product_name.toLowerCase().includes(searchLow) ||
      r.party_name.toLowerCase().includes(searchLow)
    ) : result)
    setLoading(false)
  }, [status, dateFrom, dateTo, search])

  useEffect(() => { load() }, [load])

  const columns: MasterDetailColumn<LotRow>[] = [
    {
      id: 'barcode',
      header: '바코드',
      render: row => <span className="font-mono font-semibold text-green-700">{row.barcode}</span>,
    },
    {
      id: 'product_name',
      header: '품목명',
      render: row => <span className="font-medium text-gray-900">{row.product_name}</span>,
    },
    {
      id: 'party_name',
      header: '고객사',
      render: row => <span className="text-gray-600">{row.party_name}</span>,
    },
    {
      id: 'qty_total',
      header: '총수량',
      className: 'text-right',
      headerClassName: 'text-right',
      render: row => <span className="tabular-nums">{row.qty_total.toLocaleString()}</span>,
    },
    {
      id: 'qty_available',
      header: '가용수량',
      className: 'text-right',
      headerClassName: 'text-right',
      render: row => <span className="tabular-nums">{row.qty_available.toLocaleString()}</span>,
    },
    {
      id: 'status',
      header: '상태',
      render: row => (
        <Badge className={LOT_STATUS_COLOR[row.status] ?? 'bg-gray-100 text-gray-600'}>
          {LOT_STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      ),
    },
  ]

  const detailTabs: MasterDetailTab<LotRow>[] = [
    {
      id: 'summary',
      label: '상세',
      render: row => (
        <div className="space-y-3 text-sm">
          {[
            ['바코드', row.barcode],
            ['LOT 참조', row.lot_no],
            ['품목명', row.product_name],
            ['고객사', row.party_name],
            ['입고일', row.inbound_date ?? '-'],
            ['총수량', `${row.qty_total.toLocaleString()}개`],
            ['가용수량', `${row.qty_available.toLocaleString()}개`],
            ['상태', LOT_STATUS_LABEL[row.status] ?? row.status],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
              <span className="text-gray-400">{label}</span>
              <span className="font-medium text-gray-900 break-all">{value}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'trace',
      label: '추적',
      render: row => (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            모든 LOT 조회와 상세 이동은 바코드 기준으로 처리됩니다.
          </div>
          <Button onClick={() => router.push(`/lot/${encodeURIComponent(row.barcode)}`)} className="w-full bg-green-600 hover:bg-green-700">
            상세 페이지 열기
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">LOT 검색</h1>
      <div className="flex gap-3 mb-4 flex-wrap">
        <Input placeholder="바코드 / 품목명 / 고객사" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
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
        <MasterDetailTable
          data={rows}
          columns={columns}
          getRowId={row => row.id}
          detailTabs={detailTabs}
          detailTitle={row => row.barcode}
          detailSubtitle={row => `${row.product_name} · ${row.party_name}`}
          emptyMessage="검색 결과가 없습니다."
        />
      )}
    </div>
  )
}
