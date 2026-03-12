'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tag, Factory, Package, Camera } from 'lucide-react'
import { db } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { CameraScanner, RecognizedItem } from '@/components/CameraScanner'
import { generateBarcode, generateLotNo } from '@/lib/barcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { toast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'

interface Product { id: string; product_name: string; product_code: string }
interface WorkOrder { id: string; work_order_no: string; qty_planned: number; product_id: string; product_name?: string }

interface InboundItem {
  work_order_id: string
  work_order_no: string
  product_id: string
  product_name: string
  qty: number
  vehicle_name: string
  delivery_date: string
  barcode_type: 'INTERNAL' | 'CUSTOMER'
  // generated
  lot_no?: string
  barcodes?: string[]
}

export default function InboundPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'manual' | 'scan'>('manual')
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [scanning, setScanning] = useState(false)
  const [scannedBarcodes, setScannedBarcodes] = useState<RecognizedItem[]>([])
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<InboundItem>({
    work_order_id: '',
    work_order_no: '',
    product_id: '',
    product_name: '',
    qty: 1,
    vehicle_name: '',
    delivery_date: new Date().toISOString().slice(0, 10),
    barcode_type: 'INTERNAL',
  })

  useEffect(() => {
    const load = async () => {
      const [woRes, prodRes] = await Promise.all([
        db.mes.from('work_orders')
          .select('id, work_order_no, qty_planned, product_id')
          .in('status', ['RELEASED'])
          .order('work_order_no', { ascending: false })
          .limit(50),
        db.mdm.from('products')
          .select('id, product_name, product_code')
          .eq('is_active', true)
          .order('product_name'),
      ])

      const prodMap: Record<string, string> = {}
      ;(prodRes.data ?? []).forEach((p: Product) => { prodMap[p.id] = p.product_name })
      setProducts(prodRes.data ?? [])

      const wos = (woRes.data ?? []).map((w: WorkOrder) => ({
        ...w,
        product_name: prodMap[w.product_id] ?? '-',
      }))
      setWorkOrders(wos)
    }
    load()
  }, [])

  const set = (k: keyof InboundItem, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleWorkOrderChange = (woId: string) => {
    const wo = workOrders.find(w => w.id === woId)
    if (!wo) return
    set('work_order_id', woId)
    set('work_order_no', wo.work_order_no)
    set('product_id', wo.product_id)
    set('product_name', wo.product_name ?? '')
    set('qty', wo.qty_planned)
  }

  // Generate barcodes from sequential numbers for qty
  const generateBarcodes = async (qty: number, vehicleName: string, date: string): Promise<string[]> => {
    const barcodes: string[] = []
    const d = new Date(date)
    for (let i = 0; i < qty; i++) {
      const seqNo = Math.floor(Math.random() * 99) + 1
      barcodes.push(generateBarcode(seqNo, d, vehicleName))
    }
    return barcodes
  }

  // Handle customer barcode scan
  const handleCustomerScan = useCallback((code: string) => {
    if (scannedBarcodes.find(b => b.barcode === code)) return
    setScannedBarcodes(prev => [...prev, { barcode: code, label: code }])
    setScanFeedback({ ok: true, msg: `바코드 등록: ${code}` })
  }, [scannedBarcodes])

  const handleSubmit = async () => {
    if (!form.work_order_id && !form.product_id) {
      toast({ variant: 'destructive', title: '오류', description: '작업지시서 또는 품목을 선택해주세요.' })
      return
    }
    if (form.qty < 1) {
      toast({ variant: 'destructive', title: '오류', description: '수량을 입력해주세요.' })
      return
    }

    setSaving(true)
    try {
      const now = new Date()
      const lotNo = generateLotNo(now, Math.floor(Math.random() * 9999) + 1)

      let barcodes: string[] = []
      if (form.barcode_type === 'CUSTOMER') {
        barcodes = scannedBarcodes.map(b => b.barcode)
        if (barcodes.length === 0) {
          toast({ variant: 'destructive', title: '오류', description: '고객 바코드를 스캔해주세요.' })
          setSaving(false)
          return
        }
      } else {
        barcodes = await generateBarcodes(form.qty, form.vehicle_name, form.delivery_date)
      }

      // 1. Create lot_master
      const { data: lot, error: lotErr } = await db.mes.from('lot_master').insert({
        lot_no: lotNo,
        work_order_id: form.work_order_id || null,
        product_id: form.product_id || null,
        qty_total: form.qty,
        qty_available: form.qty,
        status: 'INCOMING_INSPECTION_WAIT',
        inbound_date: form.delivery_date,
      }).select('id').single()

      if (lotErr || !lot) throw new Error(lotErr?.message ?? 'LOT 생성 실패')

      // 2. Create lot_barcodes
      const { error: bcErr } = await db.mes.from('lot_barcodes').insert(
        barcodes.map(b => ({
          lot_id: lot.id,
          barcode_value: b,
          barcode_type: form.barcode_type,
        }))
      )
      if (bcErr) throw new Error(bcErr.message)

      // 3. Create inbound_receipt
      await db.mes.from('inbound_receipts').insert({
        lot_id: lot.id,
        received_qty: form.qty,
        received_by: user?.user_id ?? null,
        received_date: form.delivery_date,
        work_order_id: form.work_order_id || null,
      })

      // 4. Log lot_event
      await db.mes.from('lot_events').insert({
        lot_id: lot.id,
        event_type: 'STATUS_CHANGE',
        from_status: null,
        to_status: 'INCOMING_INSPECTION_WAIT',
        actor_id: user?.user_id ?? null,
        note: '입고 등록',
      })

      toast({ title: '입고 등록 완료', description: `LOT: ${lotNo} (${form.qty}개, 바코드 ${barcodes.length}개)` })

      // Reset form
      setForm(prev => ({ ...prev, work_order_id: '', work_order_no: '', product_id: '', product_name: '', qty: 1, vehicle_name: '' }))
      setScannedBarcodes([])
    } catch (e) {
      toast({ variant: 'destructive', title: '입고 등록 실패', description: String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 pb-8 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-gray-900 mb-5">입고 등록</h1>

      {/* 탭: 작업지시서 선택 vs. 직접 입력 */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
        {(['manual', 'scan'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {t === 'manual' ? '작업지시서 선택' : '바코드 입고'}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {/* 작업지시서 선택 */}
        {tab === 'manual' && (
          <div className="space-y-1.5">
            <Label>작업지시서</Label>
            <Select value={form.work_order_id} onValueChange={handleWorkOrderChange}>
              <SelectTrigger>
                <SelectValue placeholder="작업지시서 선택..." />
              </SelectTrigger>
              <SelectContent>
                {workOrders.map(wo => (
                  <SelectItem key={wo.id} value={wo.id}>
                    {wo.work_order_no} — {wo.product_name} ({wo.qty_ordered}개)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 품목 (작업지시서 없을 때 직접 선택) */}
        {!form.work_order_id && (
          <div className="space-y-1.5">
            <Label>품목</Label>
            <Select value={form.product_id} onValueChange={v => { set('product_id', v); set('product_name', products.find(p => p.id === v)?.product_name ?? '') }}>
              <SelectTrigger>
                <SelectValue placeholder="품목 선택..." />
              </SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.product_name} ({p.product_code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 선택된 품목 표시 */}
        {form.product_name && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
            <Tag className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-green-800">{form.product_name}</p>
              {form.work_order_no && <p className="text-xs text-green-600">작업지시: {form.work_order_no}</p>}
            </div>
          </div>
        )}

        {/* 수량 */}
        <div className="space-y-1.5">
          <Label>수량</Label>
          <Input type="number" min={1} value={form.qty} onChange={e => set('qty', parseInt(e.target.value) || 1)} />
        </div>

        {/* 납품일 */}
        <div className="space-y-1.5">
          <Label>납품일</Label>
          <Input type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} />
        </div>

        {/* 차종명 */}
        <div className="space-y-1.5">
          <Label>차종명 <span className="text-gray-400 font-normal">(선택)</span></Label>
          <Input placeholder="예: FE, GE..." value={form.vehicle_name} onChange={e => set('vehicle_name', e.target.value)} />
        </div>

        {/* 바코드 유형 */}
        <div className="space-y-1.5">
          <Label>바코드 유형</Label>
          <div className="grid grid-cols-2 gap-2">
            {(['INTERNAL', 'CUSTOMER'] as const).map(t => (
              <button key={t} onClick={() => set('barcode_type', t)}
                className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${form.barcode_type === t ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'}`}>
                {t === 'INTERNAL'
                  ? <><Factory className="w-4 h-4 inline-block mr-1 -mt-0.5" />내부 생성</>
                  : <><Package className="w-4 h-4 inline-block mr-1 -mt-0.5" />고객 바코드</>}
              </button>
            ))}
          </div>
        </div>

        {/* 고객 바코드 스캔 */}
        {form.barcode_type === 'CUSTOMER' && (
          <div className="space-y-2">
            <Button type="button" variant="outline" onClick={() => setScanning(true)} className="w-full">
              <Camera className="w-4 h-4" /> 고객 바코드 스캔
            </Button>
            {scannedBarcodes.length > 0 && (
              <div className="space-y-1">
                {scannedBarcodes.map(b => (
                  <div key={b.barcode} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs font-mono text-gray-700">{b.barcode}</span>
                    <button onClick={() => setScannedBarcodes(prev => prev.filter(x => x.barcode !== b.barcode))}
                      className="text-gray-400 hover:text-red-400 text-sm font-bold">×</button>
                  </div>
                ))}
                <p className="text-xs text-gray-500 text-right">{scannedBarcodes.length}개 스캔됨</p>
              </div>
            )}
          </div>
        )}

        {/* 제출 버튼 */}
        <Button onClick={handleSubmit} disabled={saving || (!form.work_order_id && !form.product_id)} className="w-full h-12 text-base font-bold">
          {saving ? '등록 중...' : '입고 등록'}
        </Button>
      </div>

      {/* Scanner */}
      {scanning && (
        <CameraScanner
          onScan={handleCustomerScan}
          onClose={() => setScanning(false)}
          recognized={scannedBarcodes}
          onCommitRecognized={() => setScanning(false)}
          scanFeedback={scanFeedback}
        />
      )}
    </div>
  )
}
