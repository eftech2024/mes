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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'

type ProcessType = 'ANODIZING' | 'BONDING' | 'OTHER_POST'

interface LotSummary {
  lot_id: string
  lot_no: string
  barcode: string
  status: string
  product_name: string
  qty: number
}

interface ProcessForm {
  process_type: ProcessType
  // ANODIZING params
  current_a?: string
  voltage_v?: string
  temperature_c?: string
  duration_min?: string
  // BONDING params
  bonding_temp?: string
  bonding_pressure?: string
  bonding_time?: string
  // Common
  operator_name: string
  notes: string
}

const PROCESS_LABELS: Record<ProcessType, string> = {
  ANODIZING: '아노다이징',
  BONDING: '본딩',
  OTHER_POST: '기타 후공정',
}

export default function PopPage() {
  const { user } = useAuth()
  const [lots, setLots] = useState<LotSummary[]>([])
  const [scanning, setScanning] = useState(false)
  const [recognized, setRecognized] = useState<RecognizedItem[]>([])
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ProcessForm>({
    process_type: 'ANODIZING',
    current_a: '',
    voltage_v: '',
    temperature_c: '',
    duration_min: '',
    bonding_temp: '',
    bonding_pressure: '',
    bonding_time: '',
    operator_name: user?.user_name ?? '',
    notes: '',
  })

  const set = (k: keyof ProcessForm, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleScan = useCallback(async (code: string) => {
    const { data } = await db.mes
      .from('lot_barcodes')
      .select('barcode_value, lot_master(id, lot_no, status, qty_total, work_order_id)')
      .eq('barcode_value', code)
      .maybeSingle()

    if (!data) { setScanFeedback({ ok: false, msg: `미등록: ${code}` }); return }

    const lot = data.lot_master as unknown as { id: string; lot_no: string; status: string; qty_total: number; work_order_id: string } | null
    if (!lot) { setScanFeedback({ ok: false, msg: 'LOT 없음' }); return }

    if (lot.status !== 'READY_FOR_PROCESS') {
      setScanFeedback({ ok: false, msg: `${lot.lot_no}: 작업대기 상태가 아님 (${LOT_STATUS_LABEL[lot.status as keyof typeof LOT_STATUS_LABEL] ?? lot.status})` })
      return
    }

    if (lots.find(l => l.lot_id === lot.id)) {
      setScanFeedback({ ok: false, msg: '이미 추가됨' })
      return
    }

    // Get product name
    let productName = '-'
    if (lot.work_order_id) {
      const { data: wo } = await db.mes.from('work_orders').select('product_id').eq('id', lot.work_order_id).maybeSingle()
      if (wo?.product_id) {
        const { data: prod } = await db.mdm.from('products').select('product_name').eq('id', wo.product_id).maybeSingle()
        if (prod?.product_name) productName = prod.product_name as string
      }
    }

    const summary: LotSummary = { lot_id: lot.id, lot_no: lot.lot_no, barcode: code, status: lot.status, product_name: productName, qty: lot.qty_total }
    setLots(prev => [...prev, summary])
    setRecognized(prev => [...prev, { barcode: code, label: lot.lot_no }])
    setScanFeedback({ ok: true, msg: `${lot.lot_no} 추가됨` })
  }, [lots])

  const handleSubmit = async () => {
    if (lots.length === 0) {
      toast({ variant: 'destructive', title: '오류', description: '처리할 LOT를 스캔해주세요.' })
      return
    }

    // Build parameters based on process type
    const params: Record<string, string | number> = {}
    if (form.process_type === 'ANODIZING') {
      if (form.current_a) params.current_a = parseFloat(form.current_a)
      if (form.voltage_v) params.voltage_v = parseFloat(form.voltage_v)
      if (form.temperature_c) params.temperature_c = parseFloat(form.temperature_c)
      if (form.duration_min) params.duration_min = parseFloat(form.duration_min)
    } else if (form.process_type === 'BONDING') {
      if (form.bonding_temp) params.bonding_temp = parseFloat(form.bonding_temp)
      if (form.bonding_pressure) params.bonding_pressure = parseFloat(form.bonding_pressure)
      if (form.bonding_time) params.bonding_time = parseFloat(form.bonding_time)
    }

    setSaving(true)
    try {
      for (const lot of lots) {
        // 1. Create process_run
        const { data: run, error: runErr } = await db.mes.from('process_runs').insert({
          lot_id: lot.lot_id,
          process_type: form.process_type,
          operator_id: user?.user_id ?? null,
          started_at: new Date().toISOString(),
          status: 'COMPLETED',
          notes: form.notes || null,
        }).select('id').single()

        if (runErr || !run) throw new Error(runErr?.message ?? '작업실적 생성 실패')

        // 2. Create process_parameters
        const paramRows = Object.entries(params).map(([name, value]) => ({
          run_id: run.id,
          param_name: name,
          param_value: typeof value === 'number' ? value : parseFloat(String(value)),
        }))
        if (paramRows.length > 0) {
          await db.mes.from('process_parameters').insert(paramRows)
        }

        // 3. Transition lot status
        await db.mes.rpc('transition_lot_status', {
          p_lot_id: lot.lot_id,
          p_new_status: 'PROCESS_DONE',
          p_actor_id: user?.user_id ?? null,
          p_notes: `${PROCESS_LABELS[form.process_type]} 작업 완료`,
        })
      }

      toast({ title: '작업실적 등록 완료', description: `${lots.length}건 처리됨` })
      setLots([])
      setRecognized([])
    } catch (e) {
      toast({ variant: 'destructive', title: '등록 실패', description: String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 pb-8 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-gray-900 mb-5">작업실적 (POP)</h1>

      {/* LOT 스캔 버튼 */}
      <button
        onClick={() => { setScanning(true); setScanFeedback(null) }}
        className="w-full bg-amber-500 text-white py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-3 shadow-sm active:scale-[0.97] transition-all mb-5"
      >
        <Camera className="w-6 h-6" /> LOT 스캔
      </button>

      {/* 스캔된 LOT 목록 */}
      {lots.length > 0 && (
        <div className="mb-5 space-y-2">
          <h2 className="text-sm font-bold text-gray-600">처리 대상 LOT ({lots.length}건)</h2>
          {lots.map(lot => (
            <div key={lot.lot_id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-amber-900">{lot.product_name}</p>
                <p className="text-xs font-mono text-amber-700">{lot.lot_no} · {lot.qty}개</p>
              </div>
              <button onClick={() => { setLots(prev => prev.filter(l => l.lot_id !== lot.lot_id)); setRecognized(prev => prev.filter(r => r.barcode !== lot.barcode)) }}
                className="text-gray-400 hover:text-red-400 text-xl font-bold">×</button>
            </div>
          ))}
        </div>
      )}

      {/* 공정 파라미터 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-700">공정 파라미터</h2>

        {/* 공정 유형 */}
        <div className="space-y-1.5">
          <Label>공정 유형</Label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PROCESS_LABELS) as ProcessType[]).map(t => (
              <button key={t} onClick={() => set('process_type', t)}
                className={`py-2.5 rounded-xl text-xs font-semibold border transition-colors ${form.process_type === t ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600'}`}>
                {PROCESS_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* ANODIZING params */}
        {form.process_type === 'ANODIZING' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">전류 (A)</Label>
              <Input type="number" step="0.1" placeholder="예: 15.5" value={form.current_a} onChange={e => set('current_a', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">전압 (V)</Label>
              <Input type="number" step="0.1" placeholder="예: 18.0" value={form.voltage_v} onChange={e => set('voltage_v', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">온도 (℃)</Label>
              <Input type="number" step="0.1" placeholder="예: 20.0" value={form.temperature_c} onChange={e => set('temperature_c', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">처리 시간 (분)</Label>
              <Input type="number" step="1" placeholder="예: 45" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} />
            </div>
          </div>
        )}

        {/* BONDING params */}
        {form.process_type === 'BONDING' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">본딩 온도 (℃)</Label>
              <Input type="number" step="0.1" placeholder="예: 150" value={form.bonding_temp} onChange={e => set('bonding_temp', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">압력 (kPa)</Label>
              <Input type="number" step="1" placeholder="예: 200" value={form.bonding_pressure} onChange={e => set('bonding_pressure', e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">본딩 시간 (초)</Label>
              <Input type="number" step="1" placeholder="예: 30" value={form.bonding_time} onChange={e => set('bonding_time', e.target.value)} />
            </div>
          </div>
        )}

        {/* 작업자 */}
        <div className="space-y-1.5">
          <Label>작업자</Label>
          <Input placeholder="작업자 이름" value={form.operator_name} onChange={e => set('operator_name', e.target.value)} />
        </div>

        {/* 특이사항 */}
        <div className="space-y-1.5">
          <Label>특이사항</Label>
          <Input placeholder="특이사항 입력..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <Button onClick={handleSubmit} disabled={saving || lots.length === 0} className="w-full h-12 text-base font-bold bg-amber-500 hover:bg-amber-600">
          {saving ? '등록 중...' : `작업실적 등록 (${lots.length}건)`}
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
