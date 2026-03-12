'use client'

import { useState, useCallback } from 'react'
import { Camera } from 'lucide-react'
import { db } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { CameraScanner, RecognizedItem } from '@/components/CameraScanner'
import { LOT_STATUS_LABEL } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/use-toast'

interface LotSummary {
  lot_id: string
  lot_no: string
  barcode: string
  product_name: string
  qty_available: number
  party_id?: string
  party_name?: string
}

export default function ShipmentPage() {
  const { user } = useAuth()
  const [lots, setLots] = useState<LotSummary[]>([])
  const [shipQtys, setShipQtys] = useState<Record<string, number>>({})
  const [scanning, setScanning] = useState(false)
  const [recognized, setRecognized] = useState<RecognizedItem[]>([])
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [shipDate, setShipDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  const handleScan = useCallback(async (code: string) => {
    const { data } = await db.mes
      .from('lot_barcodes')
      .select('barcode_value, lot_master(id, lot_no, status, qty_available, work_order_id)')
      .eq('barcode_value', code)
      .maybeSingle()

    if (!data) { setScanFeedback({ ok: false, msg: `미등록: ${code}` }); return }
    const lot = data.lot_master as unknown as { id: string; lot_no: string; status: string; qty_available: number; work_order_id: string } | null
    if (!lot) { setScanFeedback({ ok: false, msg: 'LOT 없음' }); return }

    if (lot.status !== 'FINAL_OK') {
      setScanFeedback({ ok: false, msg: `${lot.lot_no}: 출하검사 합격 아님 (${LOT_STATUS_LABEL[lot.status as keyof typeof LOT_STATUS_LABEL] ?? lot.status})` })
      return
    }

    if (lots.find(l => l.lot_id === lot.id)) {
      setScanFeedback({ ok: false, msg: '이미 추가됨' }); return
    }

    let productName = '-'
    let partyId: string | undefined
    let partyName: string | undefined

    if (lot.work_order_id) {
      const { data: wo } = await db.mes.from('work_orders')
        .select('product_id, delivery_plan_id')
        .eq('id', lot.work_order_id)
        .maybeSingle()
      if (wo?.product_id) {
        const { data: prod } = await db.mdm.from('products').select('product_name').eq('id', wo.product_id).maybeSingle()
        if (prod?.product_name) productName = prod.product_name as string
      }
      if (wo?.delivery_plan_id) {
        const { data: plan } = await db.mes.from('delivery_plans').select('party_id').eq('id', wo.delivery_plan_id).maybeSingle()
        if (plan?.party_id) {
          const { data: party } = await db.core.from('parties').select('party_name').eq('id', plan.party_id).maybeSingle()
          partyId = plan.party_id as string
          partyName = party?.party_name as string | undefined
        }
      }
    }

    const summary: LotSummary = { lot_id: lot.id, lot_no: lot.lot_no, barcode: code, product_name: productName, qty_available: lot.qty_available, party_id: partyId, party_name: partyName }
    setLots(prev => [...prev, summary])
    setShipQtys(prev => ({ ...prev, [lot.id]: lot.qty_available }))
    setRecognized(prev => [...prev, { barcode: code, label: `${productName} (${lot.lot_no})` }])
    setScanFeedback({ ok: true, msg: `${lot.lot_no} 추가됨 (${lot.qty_available}개)` })
  }, [lots])

  const handleSubmit = async () => {
    if (lots.length === 0) {
      toast({ variant: 'destructive', title: '오류', description: '출하할 LOT를 스캔해주세요.' })
      return
    }

    setSaving(true)
    try {
      for (const lot of lots) {
        const qty = shipQtys[lot.lot_id] ?? lot.qty_available

        // 1. Create shipment
        const { error: shipErr } = await db.mes.from('shipments').insert({
          lot_id: lot.lot_id,
          party_id: lot.party_id ?? null,
          shipped_qty: qty,
          shipped_by: user?.user_id ?? null,
          shipped_date: shipDate,
          notes: notes || null,
        })
        if (shipErr) throw new Error(shipErr.message)

        // 2. Update lot qty_available and status
        await db.mes.from('lot_master').update({
          qty_available: lot.qty_available - qty,
        }).eq('id', lot.lot_id)

        // 3. Transition status
        await db.mes.rpc('transition_lot_status', {
          p_lot_id: lot.lot_id,
          p_new_status: 'SHIPPED',
          p_actor_id: user?.user_id ?? null,
          p_notes: `출하 ${qty}개`,
        })
      }

      toast({ title: '출하 처리 완료', description: `${lots.length}건 출하됨` })
      setLots([])
      setRecognized([])
      setShipQtys({})
    } catch (e) {
      toast({ variant: 'destructive', title: '출하 처리 실패', description: String(e) })
    } finally {
      setSaving(false)
    }
  }

  const totalQty = lots.reduce((sum, lot) => sum + (shipQtys[lot.lot_id] ?? lot.qty_available), 0)

  return (
    <div className="p-4 pb-8 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-gray-900 mb-5">출하 처리</h1>

      <button
        onClick={() => { setScanning(true); setScanFeedback(null) }}
        className="w-full bg-green-600 text-white py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-3 shadow-sm active:scale-[0.97] transition-all mb-5"
      >
        <Camera className="w-6 h-6" /> LOT 스캔 (출하검사 합격 LOT)
      </button>

      {/* 출하 목록 */}
      {lots.length > 0 && (
        <div className="mb-5 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-600">출하 목록 ({lots.length}건, 총 {totalQty}개)</h2>
          </div>
          {lots.map(lot => (
            <div key={lot.lot_id} className="bg-green-50 border border-green-200 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-green-900">{lot.product_name}</p>
                  <p className="text-xs font-mono text-green-700">{lot.lot_no}</p>
                  {lot.party_name && <p className="text-xs text-green-600 mt-0.5">고객: {lot.party_name}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShipQtys(prev => ({ ...prev, [lot.lot_id]: Math.max(1, (prev[lot.lot_id] ?? lot.qty_available) - 1) }))}
                      className="w-7 h-7 flex items-center justify-center bg-white border border-green-300 rounded-lg text-green-700 font-bold">−</button>
                    <span className="text-sm font-bold text-green-900 w-8 text-center">{shipQtys[lot.lot_id] ?? lot.qty_available}</span>
                    <button onClick={() => setShipQtys(prev => ({ ...prev, [lot.lot_id]: Math.min(lot.qty_available, (prev[lot.lot_id] ?? lot.qty_available) + 1) }))}
                      className="w-7 h-7 flex items-center justify-center bg-white border border-green-300 rounded-lg text-green-700 font-bold">+</button>
                  </div>
                  <button onClick={() => { setLots(prev => prev.filter(l => l.lot_id !== lot.lot_id)); setRecognized(prev => prev.filter(r => r.barcode !== lot.barcode)) }}
                    className="text-gray-400 hover:text-red-400 text-xl font-bold ml-1">×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 출하 정보 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-700">출하 정보</h2>
        <div className="space-y-1.5">
          <Label>출하일</Label>
          <Input type="date" value={shipDate} onChange={e => setShipDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>비고</Label>
          <Input placeholder="비고 입력..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <Button onClick={handleSubmit} disabled={saving || lots.length === 0} className="w-full h-12 text-base font-bold">
          {saving ? '처리 중...' : `출하 처리 (${lots.length}건 · ${totalQty}개)`}
        </Button>
      </div>

      {scanning && (
        <CameraScanner
          onScan={handleScan}
          onClose={() => setScanning(false)}
          recognized={recognized}
          onCommitRecognized={() => setScanning(false)}
          scanFeedback={scanFeedback}
        />
      )}
    </div>
  )
}
