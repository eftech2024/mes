import { writeFileSync } from 'fs'

const content = `'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import { QRCodeSVG } from 'qrcode.react'

interface WorkOrder {
  id: string
  work_order_no: string
  status: string
  planned_start: string | null
  planned_end: string | null
  qty_planned: number
  qty_completed: number
  created_at: string
  product_id: string | null
  delivery_plan_id: string | null
  product_name: string
  product_code: string
  vehicle_name: string
  vehicle_code: string
  party_name: string
}

interface Product {
  id: string
  product_name: string
  product_code: string
  vehicle_name: string
  vehicle_code: string | null
  customer_party_id: string | null
  monthly_qty: number | null
}

interface DeliveryPlan {
  id: string
  plan_no: string
  party_id: string
  party_name: string
  product_id: string | null
}

interface LotInfo {
  lot_no: string
  barcode_value: string
}

const WO_STATUS: Record<string, { label: string; color: string }> = {
  RELEASED:    { label: '확정',    color: 'bg-blue-100 text-blue-700' },
  IN_PROGRESS: { label: '진행중',  color: 'bg-amber-100 text-amber-700' },
  COMPLETED:   { label: '완료',    color: 'bg-green-100 text-green-700' },
  CANCELLED:   { label: '취소',    color: 'bg-red-100 text-red-700' },
}

// 리드타임: ceil(qty / weeklyQty) * 5일, weeklyQty = monthly / 4.3
const calcLeadDays = (qty: number, monthlyQty: number | null): number => {
  if (!monthlyQty || monthlyQty <= 0) return 5
  const weeklyQty = monthlyQty / 4.3
  return Math.max(1, Math.ceil(qty / weeklyQty) * 5)
}

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const todayStr = () => new Date().toISOString().split('T')[0]

// LOT 바코드 생성: 순번(2) + YY(2) + MM(2) + DD(2) + 차종코드(4) = 12자리
async function generateLotBarcode(vehicleCode: string, date: Date): Promise<string> {
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const prefix = \`\${yy}\${mm}\${dd}\`
  const vCode = (vehicleCode ?? '0000').slice(0, 4).padStart(4, '0')
  // 오늘 생성된 lot_barcodes 수로 순번 결정
  const { count } = await db.mes
    .from('lot_barcodes')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', \`\${date.getFullYear()}-\${mm}-\${dd}\`)
    .lt('created_at', \`\${date.getFullYear()}-\${mm}-\${String(date.getDate() + 1).padStart(2, '0')}\`)
  const seq = String((count ?? 0) + 1).padStart(2, '0')
  return \`\${seq}\${prefix}\${vCode}\`
}

export default function WorkOrderPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const printRef = useRef<HTMLDivElement>(null)

  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [modalOpen, setModalOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [plans, setPlans] = useState<DeliveryPlan[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [form, setForm] = useState({
    delivery_plan_id: '',
    product_id: '',
    qty_planned: '',
    planned_start: '',
    planned_end: '',
  })
  const [saving, setSaving] = useState(false)

  // 인쇄/QR 모달
  const [printWO, setPrintWO] = useState<WorkOrder | null>(null)
  const [printLot, setPrintLot] = useState<LotInfo | null>(null)
  const [printModal, setPrintModal] = useState(false)
  const [lotLoading, setLotLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.mes.from('work_orders')
      .select('id, work_order_no, status, planned_start, planned_end, qty_planned, qty_completed, created_at, product_id, delivery_plan_id')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!data) { setLoading(false); return }

    const productIds = [...new Set(data.map((r: any) => r.product_id).filter(Boolean))]
    const planIds = [...new Set(data.map((r: any) => r.delivery_plan_id).filter(Boolean))]
    const [prodRes, planRes] = await Promise.all([
      productIds.length > 0
        ? db.mdm.from('products').select('id, product_name, product_code, vehicle_name, vehicle_code').in('id', productIds)
        : Promise.resolve({ data: [] }),
      planIds.length > 0
        ? db.mes.from('delivery_plans').select('id, plan_no, party_id').in('id', planIds)
        : Promise.resolve({ data: [] }),
    ])
    const partyIds = [...new Set((planRes.data ?? []).map((p: any) => p.party_id))]
    const { data: partiesData } = partyIds.length > 0
      ? await db.core.from('parties').select('id, party_name').in('id', partyIds)
      : { data: [] }

    const prodMap: Record<string, any> = {}
    ;(prodRes.data ?? []).forEach((p: any) => { prodMap[p.id] = p })
    const partyMap: Record<string, string> = {}
    ;(partiesData ?? []).forEach((p: any) => { partyMap[p.id] = p.party_name })
    const planMap: Record<string, any> = {}
    ;(planRes.data ?? []).forEach((p: any) => { planMap[p.id] = p })

    setOrders(data.map((r: any) => {
      const prod = prodMap[r.product_id]
      const plan = planMap[r.delivery_plan_id]
      return {
        ...r,
        product_name: prod?.product_name ?? '-',
        product_code: prod?.product_code ?? '-',
        vehicle_name: prod?.vehicle_name ?? '-',
        vehicle_code: prod?.vehicle_code ?? '0000',
        party_name: plan ? (partyMap[plan.party_id] ?? '-') : '-',
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = async () => {
    const today = todayStr()
    const [prodRes, planRes] = await Promise.all([
      db.mdm.from('products')
        .select('id, product_name, product_code, vehicle_name, vehicle_code, customer_party_id, monthly_qty')
        .eq('is_active', true).order('product_name').limit(500),
      db.mes.from('delivery_plans')
        .select('id, plan_no, party_id, product_id').eq('status', 'OPEN')
        .order('created_at', { ascending: false }),
    ])
    const partyIds = [...new Set((planRes.data ?? []).map((p: any) => p.party_id))]
    const { data: partiesData } = partyIds.length > 0
      ? await db.core.from('parties').select('id, party_name').in('id', partyIds)
      : { data: [] }
    const partyMap: Record<string, string> = {}
    ;(partiesData ?? []).forEach((p: any) => { partyMap[p.id] = p.party_name })
    setProducts(prodRes.data ?? [])
    setPlans((planRes.data ?? []).map((p: any) => ({ ...p, party_name: partyMap[p.party_id] ?? '-' })))
    setSelectedProduct(null)
    setForm({ delivery_plan_id: '', product_id: '', qty_planned: '', planned_start: today, planned_end: addDays(today, 1) })
    setModalOpen(true)
  }

  const applyProduct = (productId: string, prevForm: typeof form) => {
    const prod = products.find(p => p.id === productId) ?? null
    setSelectedProduct(prod)
    const qty = Number(prevForm.qty_planned) || 0
    const end = qty > 0
      ? addDays(prevForm.planned_start || todayStr(), calcLeadDays(qty, prod?.monthly_qty ?? null))
      : prevForm.planned_end
    return { ...prevForm, product_id: productId, planned_end: end }
  }

  const handleProductChange = (productId: string) => {
    setForm(f => applyProduct(productId, f))
  }

  const handlePlanChange = (planId: string) => {
    if (planId === 'NONE') { setForm(f => ({ ...f, delivery_plan_id: '' })); return }
    const plan = plans.find(p => p.id === planId)
    setForm(f => {
      const next = { ...f, delivery_plan_id: planId }
      if (plan?.product_id) return applyProduct(plan.product_id, next)
      return next
    })
  }

  const handleQtyChange = (value: string) => {
    const qty = Number(value) || 0
    setForm(f => {
      const start = f.planned_start || todayStr()
      const end = qty > 0 ? addDays(start, calcLeadDays(qty, selectedProduct?.monthly_qty ?? null)) : f.planned_end
      return { ...f, qty_planned: value, planned_end: end }
    })
  }

  const handleStartChange = (start: string) => {
    setForm(f => {
      const qty = Number(f.qty_planned) || 0
      const end = qty > 0 ? addDays(start, calcLeadDays(qty, selectedProduct?.monthly_qty ?? null)) : f.planned_end
      return { ...f, planned_start: start, planned_end: end }
    })
  }

  const handleSave = async () => {
    if (!form.product_id || !form.qty_planned) {
      toast({ title: '필수 항목 누락', description: '품명과 수량을 입력하세요.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const now = new Date()
    const yy = String(now.getFullYear()).slice(2)
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const { count } = await db.mes.from('work_orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', \`\${now.getFullYear()}-\${mm}-\${dd}\`)
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const work_order_no = \`WO-\${yy}\${mm}\${dd}-\${seq}\`

    // 1) 작업지시서 생성
    const { data: woData, error: woError } = await db.mes.from('work_orders').insert({
      work_order_no,
      delivery_plan_id: form.delivery_plan_id || null,
      product_id: form.product_id,
      qty_planned: Number(form.qty_planned),
      planned_start: form.planned_start || null,
      planned_end: form.planned_end || null,
      status: 'RELEASED',
      created_by: user?.user_id,
    }).select('id').single()

    if (woError || !woData) {
      setSaving(false)
      toast({ title: '저장 실패', description: woError?.message, variant: 'destructive' })
      return
    }

    // 2) LOT 바코드 생성 (WO와 연동)
    const vCode = (selectedProduct?.vehicle_code ?? '0000').slice(0, 4).padStart(4, '0')
    const lotBarcode = await generateLotBarcode(vCode, now)

    const { data: lotData, error: lotError } = await db.mes.from('lot_master').insert({
      lot_no: lotBarcode,
      work_order_id: woData.id,
      product_id: form.product_id,
      customer_party_id: selectedProduct?.customer_party_id ?? null,
      qty_total: Number(form.qty_planned),
      qty_available: Number(form.qty_planned),
      status: 'AVAILABLE',
      inbound_date: form.planned_start || now.toISOString().split('T')[0],
    }).select('id').single()

    if (!lotError && lotData) {
      await db.mes.from('lot_barcodes').insert({
        lot_id: lotData.id,
        barcode_value: lotBarcode,
        barcode_type: 'INTERNAL',
      })
    }

    setSaving(false)
    toast({ title: '작업지시서 생성 완료', description: \`\${work_order_no} | LOT: \${lotBarcode}\` })
    setModalOpen(false)
    load()
  }

  const openPrint = async (wo: WorkOrder) => {
    setPrintWO(wo)
    setPrintLot(null)
    setLotLoading(true)
    setPrintModal(true)
    const { data } = await db.mes.from('lot_master')
      .select('lot_no, lot_barcodes(barcode_value)')
      .eq('work_order_id', wo.id)
      .limit(1)
      .maybeSingle()
    setLotLoading(false)
    if (data) {
      const bc = (data as any).lot_barcodes?.[0]?.barcode_value ?? data.lot_no
      setPrintLot({ lot_no: data.lot_no, barcode_value: bc })
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === 'ALL' || o.status === statusFilter
    const matchSearch = !search
      || o.work_order_no.includes(search)
      || o.product_name.includes(search)
      || o.party_name.includes(search)
      || o.product_code.includes(search)
    return matchStatus && matchSearch
  })

  return (
    <>
      {/* print styles */}
      <style global jsx>{\`
        @media print {
          body > *:not(#print-area) { display: none !important; }
          #print-area { display: block !important; }
          @page { size: A4; margin: 15mm; }
        }
      \`}</style>

      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">작업지시서</h1>
          <Button onClick={openModal} className="bg-green-600 hover:bg-green-700">+ 신규 작성</Button>
        </div>
        <div className="flex gap-3 mb-4 flex-wrap">
          <Input placeholder="작업지시번호 / 품명 / 품번 / 고객사" value={search} onChange={e => setSearch(e.target.value)} className="w-80" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">전체</SelectItem>
              {Object.entries(WO_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-b-2 border-green-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="rounded-lg border shadow-sm overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['작업지시번호','품명','품번','차종','고객사','계획수량','진행률','계획시작','계획종료','상태',''].map(h => (
                    <th key={h} className="h-10 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => (
                  <tr key={o.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono font-semibold text-green-700 whitespace-nowrap">{o.work_order_no}</td>
                    <td className="px-4 py-3 font-medium">{o.product_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{o.product_code}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{o.vehicle_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.party_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{(o.qty_planned ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-3 min-w-[100px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-green-500 h-1.5 rounded-full"
                            style={{ width: \`\${Math.min(100, Math.round(((o.qty_completed ?? 0) / Math.max(1, o.qty_planned)) * 100))}%\` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
                          {Math.round(((o.qty_completed ?? 0) / Math.max(1, o.qty_planned)) * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{o.planned_start ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{o.planned_end ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge className={WO_STATUS[o.status]?.color ?? 'bg-gray-100 text-gray-600'}>
                        {WO_STATUS[o.status]?.label ?? o.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <span className="text-lg leading-none select-none">⋯</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openPrint(o)}>
                            인쇄 / 미리보기
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPrint(o)}>
                            QR 코드 보기
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openPrint(o)}>
                            LOT 추적
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">작업지시서가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 신규 작성 모달 */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>작업지시서 신규 작성</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>입고(납품) 계획 연결 <span className="text-muted-foreground text-xs ml-1">선택사항</span></Label>
              <Select value={form.delivery_plan_id || 'NONE'} onValueChange={handlePlanChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="계획 없이 발행" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">계획 없이 발행</SelectItem>
                  {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.plan_no} — {p.party_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>품명 *</Label>
              <Select value={form.product_id} onValueChange={handleProductChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="품명 선택" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedProduct && (
              <div className="grid grid-cols-3 gap-3 p-3 bg-muted/30 rounded-lg text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">품번</span>
                  <p className="font-mono font-medium">{selectedProduct.product_code ?? '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">차종</span>
                  <p className="font-medium">{selectedProduct.vehicle_name ?? '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">월간소요량</span>
                  <p className="font-medium">
                    {selectedProduct.monthly_qty
                      ? \`\${selectedProduct.monthly_qty.toLocaleString()}개/월\`
                      : '미설정'}
                  </p>
                </div>
              </div>
            )}
            <div>
              <Label>계획 수량 *</Label>
              <Input type="number" min={1} className="mt-1"
                value={form.qty_planned}
                onChange={e => handleQtyChange(e.target.value)}
                placeholder="수량 입력 시 종료일 자동 계산" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>계획 시작일</Label>
                <Input type="date" className="mt-1" value={form.planned_start}
                  onChange={e => handleStartChange(e.target.value)} />
              </div>
              <div>
                <Label>계획 종료일</Label>
                <Input type="date" className="mt-1" value={form.planned_end}
                  onChange={e => setForm(f => ({ ...f, planned_end: e.target.value }))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              리드타임 = ⌈수량 ÷ (월간소요량/4.3)⌉ × 5일 | 작업지시 생성 시 LOT 바코드 자동 발급
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>취소</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">
                {saving ? '저장 중…' : '저장 및 LOT 발급'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 인쇄/QR/LOT 모달 */}
      <Dialog open={printModal} onOpenChange={setPrintModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>작업지시서 — {printWO?.work_order_no}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2 mb-4 print:hidden">
            <Button variant="outline" onClick={() => setPrintModal(false)}>닫기</Button>
            <Button onClick={handlePrint} className="bg-green-600 hover:bg-green-700">인쇄 (A4)</Button>
          </div>
          {/* A4 인쇄 영역 */}
          <div id="print-area" ref={printRef} className="bg-white p-6 border rounded-lg text-sm space-y-6">
            {/* 헤더 */}
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">작업지시서</h2>
                <p className="text-gray-500 text-xs mt-1">Work Order</p>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p className="font-semibold text-base text-gray-900">{printWO?.work_order_no}</p>
                <p>발행일: {printWO?.created_at?.slice(0, 10)}</p>
                <p>상태: {WO_STATUS[printWO?.status ?? '']?.label ?? printWO?.status}</p>
              </div>
            </div>

            {/* 품목 정보 */}
            <div className="grid grid-cols-2 gap-4">
              <table className="text-xs w-full border-collapse">
                <tbody>
                  {[
                    ['품명', printWO?.product_name],
                    ['품번', printWO?.product_code],
                    ['차종', printWO?.vehicle_name],
                    ['고객사', printWO?.party_name],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b">
                      <td className="py-2 pr-4 font-medium text-gray-500 w-20">{k}</td>
                      <td className="py-2 font-semibold text-gray-900">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="text-xs w-full border-collapse">
                <tbody>
                  {[
                    ['계획수량', \`\${(printWO?.qty_planned ?? 0).toLocaleString()}개\`],
                    ['계획시작', printWO?.planned_start ?? '-'],
                    ['계획종료', printWO?.planned_end ?? '-'],
                    ['LOT No.', printLot?.lot_no ?? (lotLoading ? '로딩 중…' : '없음')],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b">
                      <td className="py-2 pr-4 font-medium text-gray-500 w-20">{k}</td>
                      <td className="py-2 font-semibold text-gray-900">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* QR 코드 */}
            {printLot && (
              <div className="flex items-center gap-6 p-4 border rounded-lg bg-gray-50">
                <QRCodeSVG
                  value={printLot.barcode_value}
                  size={120}
                  includeMargin
                />
                <div>
                  <p className="text-xs text-gray-500 mb-1">LOT 바코드 (내부)</p>
                  <p className="font-mono font-bold text-xl tracking-widest">{printLot.barcode_value}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    형식: 순번(2) + YY(2) + MM(2) + DD(2) + 차종코드(4) = 12자리
                  </p>
                  <p className="text-xs text-gray-400">
                    WO: {printWO?.work_order_no} | 품명: {printWO?.product_name}
                  </p>
                </div>
              </div>
            )}
            {!printLot && !lotLoading && (
              <div className="p-4 border rounded-lg bg-amber-50 text-amber-700 text-sm">
                연결된 LOT 바코드가 없습니다.
              </div>
            )}

            {/* 서명란 */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              {['작성자', '검토자', '승인자'].map(r => (
                <div key={r} className="border rounded p-3 text-center">
                  <p className="text-xs text-gray-500 mb-6">{r}</p>
                  <div className="border-t pt-2 text-xs text-gray-400">(서명)</div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
`

writeFileSync('app/workorder/page.tsx', content, 'utf8')
console.log('Written:', 'app/workorder/page.tsx', content.length, 'chars')
