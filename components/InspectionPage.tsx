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

type InspectionType = 'INCOMING' | 'PROCESS' | 'FINAL'
type JudgeResult = 'OK' | 'NG' | 'CONDITIONAL_OK'

interface InspectionConfig {
  title: string
  requiredStatus: string
  nextStatus: string
  nextStatusNG: string
  color: string
  bgColor: string
  checkItems: { key: string; label: string; type: 'judge' | 'number' | 'text' }[]
}

const CONFIGS: Record<InspectionType, InspectionConfig> = {
  INCOMING: {
    title: '수입검사',
    requiredStatus: 'INCOMING_INSPECTION_WAIT',
    nextStatus: 'READY_FOR_PROCESS',
    nextStatusNG: 'INCOMING_NG',
    color: 'sky',
    bgColor: 'bg-sky-500 hover:bg-sky-600',
    checkItems: [
      { key: 'appearance', label: '외관', type: 'judge' },
      { key: 'dimension', label: '치수', type: 'judge' },
      { key: 'material', label: '소재', type: 'judge' },
    ],
  },
  PROCESS: {
    title: '공정검사',
    requiredStatus: 'PROCESS_INSPECTION_WAIT',
    nextStatus: 'FINAL_INSPECTION_WAIT',
    nextStatusNG: 'PROCESS_NG',
    color: 'violet',
    bgColor: 'bg-violet-600 hover:bg-violet-700',
    checkItems: [
      { key: 'film_thickness', label: '피막두께 (μm)', type: 'number' },
      { key: 'appearance', label: '외관', type: 'judge' },
      { key: 'color', label: '색상', type: 'judge' },
      { key: 'dimension', label: '치수', type: 'judge' },
    ],
  },
  FINAL: {
    title: '출하검사',
    requiredStatus: 'FINAL_INSPECTION_WAIT',
    nextStatus: 'FINAL_OK',
    nextStatusNG: 'PROCESS_NG',
    color: 'orange',
    bgColor: 'bg-orange-500 hover:bg-orange-600',
    checkItems: [
      { key: 'film_thickness', label: '피막두께 (μm)', type: 'number' },
      { key: 'appearance', label: '외관', type: 'judge' },
      { key: 'color', label: '색상', type: 'judge' },
      { key: 'dimension', label: '치수', type: 'judge' },
      { key: 'packaging', label: '포장', type: 'judge' },
    ],
  },
}

interface LotSummary {
  lot_id: string
  lot_no: string
  barcode: string
  product_name: string
  qty: number
}

export function InspectionPage({ type }: { type: InspectionType }) {
  const cfg = CONFIGS[type]
  const { user } = useAuth()
  const [lots, setLots] = useState<LotSummary[]>([])
  const [scanning, setScanning] = useState(false)
  const [recognized, setRecognized] = useState<RecognizedItem[]>([])
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // Inspection form values
  const [results, setResults] = useState<Record<string, string>>({})
  const [overallResult, setOverallResult] = useState<JudgeResult>('OK')
  const [inspector, setInspector] = useState(user?.user_name ?? '')
  const [notes, setNotes] = useState('')

  const setResult = (key: string, value: string) => setResults(prev => ({ ...prev, [key]: value }))

  const handleScan = useCallback(async (code: string) => {
    const { data } = await db.mes
      .from('lot_barcodes')
      .select('barcode_value, lot_master(id, lot_no, status, qty_total, work_order_id)')
      .eq('barcode_value', code)
      .maybeSingle()

    if (!data) { setScanFeedback({ ok: false, msg: `미등록: ${code}` }); return }
    const lot = data.lot_master as unknown as { id: string; lot_no: string; status: string; qty_total: number; work_order_id: string } | null
    if (!lot) { setScanFeedback({ ok: false, msg: 'LOT 없음' }); return }

    if (lot.status !== cfg.requiredStatus) {
      setScanFeedback({ ok: false, msg: `${lot.lot_no}: 상태 불일치 (${LOT_STATUS_LABEL[lot.status as keyof typeof LOT_STATUS_LABEL] ?? lot.status})` })
      return
    }

    if (lots.find(l => l.lot_id === lot.id)) {
      setScanFeedback({ ok: false, msg: '이미 추가됨' }); return
    }

    let productName = '-'
    if (lot.work_order_id) {
      const { data: wo } = await db.mes.from('work_orders').select('product_id').eq('id', lot.work_order_id).maybeSingle()
      if (wo?.product_id) {
        const { data: prod } = await db.mdm.from('products').select('product_name').eq('id', wo.product_id).maybeSingle()
        if (prod?.product_name) productName = prod.product_name as string
      }
    }

    setLots(prev => [...prev, { lot_id: lot.id, lot_no: lot.lot_no, barcode: code, product_name: productName, qty: lot.qty_total }])
    setRecognized(prev => [...prev, { barcode: code, label: lot.lot_no }])
    setScanFeedback({ ok: true, msg: `${lot.lot_no} 추가됨` })
  }, [lots, cfg.requiredStatus])

  const handleSubmit = async () => {
    if (lots.length === 0) {
      toast({ variant: 'destructive', title: '오류', description: 'LOT를 스캔해주세요.' })
      return
    }

    setSaving(true)
    try {
      const nextStatus = overallResult === 'OK' || overallResult === 'CONDITIONAL_OK'
        ? cfg.nextStatus
        : cfg.nextStatusNG

      for (const lot of lots) {
        // 1. Create inspection record
        const { data: insp, error: inspErr } = await db.qms.from('inspections').insert({
          lot_id: lot.lot_id,
          inspection_type: type,
          inspector_id: user?.user_id ?? null,
          overall_result: overallResult,
          notes: notes || null,
        }).select('id').single()

        if (inspErr || !insp) throw new Error(inspErr?.message ?? '검사 기록 실패')

        // 2. Create inspection results
        const resultRows = Object.entries(results).map(([item, value]) => ({
          inspection_id: insp.id,
          check_item: item,
          measured_value: value,
          result: value === 'NG' ? 'NG' : value === 'OK' ? 'OK' : 'OK',
        }))
        if (resultRows.length > 0) {
          await db.qms.from('inspection_results').insert(resultRows)
        }

        // 3. Transition status
        await db.mes.rpc('transition_lot_status', {
          p_lot_id: lot.lot_id,
          p_new_status: nextStatus,
          p_actor_id: user?.user_id ?? null,
          p_notes: `${cfg.title} ${overallResult}`,
        })
      }

      toast({ title: `${cfg.title} 완료`, description: `${lots.length}건 처리됨 → ${LOT_STATUS_LABEL[nextStatus as keyof typeof LOT_STATUS_LABEL] ?? nextStatus}` })
      setLots([])
      setRecognized([])
      setResults({})
    } catch (e) {
      toast({ variant: 'destructive', title: '검사 등록 실패', description: String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 pb-8 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-gray-900 mb-5">{cfg.title}</h1>

      <button
        onClick={() => { setScanning(true); setScanFeedback(null) }}
        className={`w-full text-white py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-3 shadow-sm active:scale-[0.97] transition-all mb-5 ${cfg.bgColor}`}
      >
        <Camera className="w-6 h-6" /> LOT 스캔
      </button>

      {lots.length > 0 && (
        <div className="mb-5 space-y-2">
          <h2 className="text-sm font-bold text-gray-600">대상 LOT ({lots.length}건)</h2>
          {lots.map(lot => (
            <div key={lot.lot_id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900">{lot.product_name}</p>
                <p className="text-xs font-mono text-gray-500">{lot.lot_no} · {lot.qty}개</p>
              </div>
              <button onClick={() => { setLots(prev => prev.filter(l => l.lot_id !== lot.lot_id)); setRecognized(prev => prev.filter(r => r.barcode !== lot.barcode)) }}
                className="text-gray-400 hover:text-red-400 text-xl font-bold">×</button>
            </div>
          ))}
        </div>
      )}

      {/* 검사 항목 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-bold text-gray-700">검사 항목</h2>

        {cfg.checkItems.map(item => (
          <div key={item.key} className="space-y-1.5">
            <Label>{item.label}</Label>
            {item.type === 'judge' ? (
              <div className="grid grid-cols-2 gap-2">
                {(['OK', 'NG'] as const).map(v => (
                  <button key={v} onClick={() => setResult(item.key, v)}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                      results[item.key] === v
                        ? v === 'OK' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 text-gray-600'
                    }`}>
                    {v === 'OK' ? '✅ 합격' : '❌ 불합격'}
                  </button>
                ))}
              </div>
            ) : (
              <Input type="number" step="0.01" placeholder="측정값 입력"
                value={results[item.key] ?? ''}
                onChange={e => setResult(item.key, e.target.value)} />
            )}
          </div>
        ))}

        {/* 종합 판정 */}
        <div className="space-y-1.5">
          <Label>종합 판정</Label>
          <div className="grid grid-cols-3 gap-2">
            {(['OK', 'CONDITIONAL_OK', 'NG'] as JudgeResult[]).map(v => (
              <button key={v} onClick={() => setOverallResult(v)}
                className={`py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                  overallResult === v
                    ? v === 'OK' ? 'border-green-500 bg-green-50 text-green-700'
                      : v === 'NG' ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-yellow-500 bg-yellow-50 text-yellow-700'
                    : 'border-gray-200 text-gray-600'
                }`}>
                {v === 'OK' ? '합격' : v === 'NG' ? '불합격' : '조건부 합격'}
              </button>
            ))}
          </div>
        </div>

        {/* 검사자 */}
        <div className="space-y-1.5">
          <Label>검사자</Label>
          <Input placeholder="검사자 이름" value={inspector} onChange={e => setInspector(e.target.value)} />
        </div>

        {/* 특이사항 */}
        <div className="space-y-1.5">
          <Label>특이사항</Label>
          <Input placeholder="특이사항..." value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <Button onClick={handleSubmit} disabled={saving || lots.length === 0} className={`w-full h-12 text-base font-bold text-white ${cfg.bgColor}`}>
          {saving ? '저장 중...' : `${cfg.title} 완료 (${lots.length}건)`}
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
