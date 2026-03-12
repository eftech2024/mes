'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db, LOT_STATUS_LABEL, LOT_STATUS_COLOR, LotStatus } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'
import { getPrimaryLotBarcode } from '@/lib/lot-barcode'

interface LotEvent {
  id: string
  event_type: string
  from_status: string | null
  to_status: string | null
  note: string | null
  created_at: string
}

interface LotDetail {
  id: string
  barcode: string
  lot_no: string
  status: LotStatus
  qty_total: number
  qty_available: number
  inbound_date: string | null
  product_name: string
  work_order_no: string | null
  party_name: string | null
  barcodes: { barcode_value: string; barcode_type: string }[]
  events: LotEvent[]
  process_runs: {
    id: string
    process_type: string
    started_at: string
    status: string
    notes: string | null
    params: { param_name: string; param_value: number }[]
  }[]
  inspections: {
    id: string
    inspection_type: string
    overall_result: string
    created_at: string
    results: { check_item: string; measured_value: string; result: string }[]
  }[]
}

const EVENT_ICON: Record<string, string> = {
  STATUS_CHANGE: '🔄',
  INBOUND: '📦',
  INSPECTION: '🔍',
  PROCESS: '⚙️',
  SHIPMENT: '🚛',
  HOLD: '⏸️',
  NOTE: '📝',
}

const PROCESS_LABEL: Record<string, string> = {
  ANODIZING: '아노다이징',
  BONDING: '본딩',
  OTHER_POST: '기타 후공정',
}

const INSP_LABEL: Record<string, string> = {
  INCOMING: '수입검사',
  PROCESS: '공정검사',
  FINAL: '출하검사',
}

export default function LotDetailPage() {
  const params = useParams()
  const router = useRouter()
  const barcodeParam = decodeURIComponent(params.barcode as string)
  const [lot, setLot] = useState<LotDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data: barcodeRow } = await db.mes.from('lot_barcodes')
          .select('lot_id, barcode_value')
          .eq('barcode_value', barcodeParam)
          .maybeSingle()

        const lotQuery = db.mes.from('lot_master')
          .select('id, lot_no, status, qty_total, qty_available, inbound_date, work_order_id, product_id')

        const { data: lotData } = barcodeRow?.lot_id
          ? await lotQuery.eq('id', barcodeRow.lot_id).maybeSingle()
          : await lotQuery.eq('lot_no', barcodeParam).maybeSingle()

        if (!lotData) { setNotFound(true); setLoading(false); return }

        const [prodRes, woRes, barcodesRes, eventsRes, processRes, inspRes] = await Promise.all([
          lotData.product_id
            ? db.mdm.from('products').select('product_name').eq('id', lotData.product_id).maybeSingle()
            : Promise.resolve({ data: null }),
          lotData.work_order_id
            ? db.mes.from('work_orders').select('work_order_no, delivery_plan_id').eq('id', lotData.work_order_id).maybeSingle()
            : Promise.resolve({ data: null }),
          db.mes.from('lot_barcodes').select('barcode_value, barcode_type').eq('lot_id', lotData.id),
          db.mes.from('lot_events').select('id, event_type, from_status, to_status, note, created_at').eq('lot_id', lotData.id).order('created_at'),
          db.mes.from('process_runs').select('id, process_type, started_at, status, notes').eq('lot_id', lotData.id).order('started_at'),
          db.qms.from('inspections').select('id, inspection_type, overall_result, created_at').eq('lot_id', lotData.id).order('created_at'),
        ])

        let partyName: string | null = null
        if (woRes.data?.delivery_plan_id) {
          const { data: plan } = await db.mes.from('delivery_plans').select('party_id').eq('id', woRes.data.delivery_plan_id).maybeSingle()
          if (plan?.party_id) {
            const { data: party } = await db.core.from('parties').select('party_name').eq('id', plan.party_id).maybeSingle()
            partyName = party?.party_name as string | null
          }
        }

        const processIds = (processRes.data ?? []).map((r: { id: string }) => r.id)
        const inspIds = (inspRes.data ?? []).map((r: { id: string }) => r.id)

        const [paramRes, resultRes] = await Promise.all([
          processIds.length > 0
            ? db.mes.from('process_parameters').select('run_id, param_name, param_value').in('run_id', processIds)
            : Promise.resolve({ data: [] }),
          inspIds.length > 0
            ? db.qms.from('inspection_results').select('inspection_id, check_item, measured_value, result').in('inspection_id', inspIds)
            : Promise.resolve({ data: [] }),
        ])

        const paramMap: Record<string, { param_name: string; param_value: number }[]> = {}
        ;(paramRes.data ?? []).forEach((p: { run_id: string; param_name: string; param_value: number }) => {
          if (!paramMap[p.run_id]) paramMap[p.run_id] = []
          paramMap[p.run_id].push({ param_name: p.param_name, param_value: p.param_value })
        })

        const resultMap: Record<string, { check_item: string; measured_value: string; result: string }[]> = {}
        ;(resultRes.data ?? []).forEach((r: { inspection_id: string; check_item: string; measured_value: string; result: string }) => {
          if (!resultMap[r.inspection_id]) resultMap[r.inspection_id] = []
          resultMap[r.inspection_id].push(r)
        })

        const barcodes = barcodesRes.data ?? []

        setLot({
          id: lotData.id,
          barcode: barcodeRow?.barcode_value ?? getPrimaryLotBarcode(barcodes, lotData.lot_no),
          lot_no: lotData.lot_no,
          status: lotData.status as LotStatus,
          qty_total: lotData.qty_total,
          qty_available: lotData.qty_available,
          inbound_date: lotData.inbound_date,
          product_name: prodRes.data?.product_name as string ?? '-',
          work_order_no: woRes.data?.work_order_no as string | null ?? null,
          party_name: partyName,
          barcodes,
          events: eventsRes.data ?? [],
          process_runs: (processRes.data ?? []).map((r: { id: string; process_type: string; started_at: string; status: string; notes: string | null }) => ({
            ...r, params: paramMap[r.id] ?? [],
          })),
          inspections: (inspRes.data ?? []).map((i: { id: string; inspection_type: string; overall_result: string; created_at: string }) => ({
            ...i, results: resultMap[i.id] ?? [],
          })),
        })
      } catch (e) {
        console.error(e)
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [barcodeParam])

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-b-2 border-green-500 rounded-full animate-spin" />
    </div>
  )

  if (notFound || !lot) return (
    <div className="p-6 text-center">
      <p className="text-gray-500 font-semibold">바코드 또는 LOT를 찾을 수 없습니다</p>
      <p className="text-sm font-mono text-gray-400 mt-1">{barcodeParam}</p>
      <button onClick={() => router.back()} className="mt-4 text-green-600 font-semibold">← 뒤로</button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3 max-w-2xl mx-auto">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 font-bold text-lg">←</button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-mono font-bold text-gray-900 truncate">{lot.barcode}</p>
            <p className="text-xs text-gray-500 truncate">{lot.product_name}</p>
          </div>
          <Badge className={LOT_STATUS_COLOR[lot.status] ?? 'bg-gray-100 text-gray-600'}>
            {LOT_STATUS_LABEL[lot.status] ?? lot.status}
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* 기본 정보 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">기본 정보</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '바코드', value: lot.barcode },
              { label: 'LOT 참조', value: lot.lot_no },
              { label: '품목', value: lot.product_name },
              { label: '총 수량', value: `${lot.qty_total}개` },
              { label: '가용 수량', value: `${lot.qty_available}개` },
              { label: '입고일', value: lot.inbound_date ?? '-' },
              { label: '작업지시', value: lot.work_order_no ?? '-' },
              { label: '고객사', value: lot.party_name ?? '-' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 바코드 목록 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">바코드 ({lot.barcodes.length}개)</h2>
          <div className="space-y-1.5">
            {lot.barcodes.map(b => (
              <div key={b.barcode_value} className="flex items-center justify-between">
                <span className="text-sm font-mono text-gray-800">{b.barcode_value}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{b.barcode_type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 작업실적 */}
        {lot.process_runs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">작업실적</h2>
            <div className="space-y-3">
              {lot.process_runs.map(run => (
                <div key={run.id} className="bg-amber-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-amber-800">{PROCESS_LABEL[run.process_type] ?? run.process_type}</span>
                    <span className="text-xs text-amber-600">{new Date(run.started_at).toLocaleString('ko-KR')}</span>
                  </div>
                  {run.params.length > 0 && (
                    <div className="grid grid-cols-2 gap-1">
                      {run.params.map(p => (
                        <div key={p.param_name} className="text-xs">
                          <span className="text-gray-500">{p.param_name}: </span>
                          <span className="font-semibold text-gray-800">{p.param_value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {run.notes && <p className="text-xs text-gray-500 mt-1">{run.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 검사 기록 */}
        {lot.inspections.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">검사 기록</h2>
            <div className="space-y-3">
              {lot.inspections.map(insp => (
                <div key={insp.id} className={`rounded-lg p-3 ${insp.overall_result === 'OK' ? 'bg-green-50' : insp.overall_result === 'NG' ? 'bg-red-50' : 'bg-yellow-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold">{INSP_LABEL[insp.inspection_type] ?? insp.inspection_type}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${insp.overall_result === 'OK' ? 'bg-green-200 text-green-800' : insp.overall_result === 'NG' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'}`}>
                      {insp.overall_result === 'OK' ? '합격' : insp.overall_result === 'NG' ? '불합격' : '조건부'}
                    </span>
                  </div>
                  {insp.results.length > 0 && (
                    <div className="grid grid-cols-2 gap-1">
                      {insp.results.map(r => (
                        <div key={r.check_item} className="text-xs">
                          <span className="text-gray-500">{r.check_item}: </span>
                          <span className={`font-semibold ${r.result === 'NG' ? 'text-red-700' : 'text-gray-800'}`}>{r.measured_value || r.result}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 이력 타임라인 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">이력</h2>
          <div className="space-y-3">
            {lot.events.map((e, i) => (
              <div key={e.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="text-lg">{EVENT_ICON[e.event_type] ?? '📋'}</span>
                  {i < lot.events.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                </div>
                <div className="flex-1 pb-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">
                      {e.to_status ? (LOT_STATUS_LABEL[e.to_status as keyof typeof LOT_STATUS_LABEL] ?? e.to_status) : e.event_type}
                    </p>
                    <span className="text-xs text-gray-400">
                      {new Date(e.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {e.note && <p className="text-xs text-gray-500 mt-0.5">{e.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
