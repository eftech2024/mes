'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

interface WorkOrder {
  id: string
  work_order_no: string
  status: string
  planned_start: string | null
  planned_end: string | null
  qty_planned: number
  qty_completed: number
  created_at: string
  product_name: string
  party_name: string
}

interface Product { id: string; product_name: string; product_code: string }
interface DeliveryPlan { id: string; plan_no: string; party_id: string; party_name: string }

const WO_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT:       { label: '초안',    color: 'bg-gray-100 text-gray-600' },
  RELEASED:    { label: '확정',    color: 'bg-blue-100 text-blue-700' },
  IN_PROGRESS: { label: '진행중',  color: 'bg-amber-100 text-amber-700' },
  COMPLETED:   { label: '완료',    color: 'bg-green-100 text-green-700' },
  CANCELLED:   { label: '취소',    color: 'bg-red-100 text-red-700' },
}

export default function WorkOrderPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [orders, setOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [modalOpen, setModalOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [plans, setPlans] = useState<DeliveryPlan[]>([])
  const [form, setForm] = useState({ delivery_plan_id: '', product_id: '', qty_planned: '', planned_start: '', planned_end: '' })
  const [saving, setSaving] = useState(false)

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
      productIds.length > 0 ? db.mdm.from('products').select('id, product_name').in('id', productIds) : Promise.resolve({ data: [] }),
      planIds.length > 0 ? db.mes.from('delivery_plans').select('id, plan_no, party_id').in('id', planIds) : Promise.resolve({ data: [] }),
    ])
    const partyIds = [...new Set((planRes.data ?? []).map((p: any) => p.party_id))]
    const { data: partiesData } = partyIds.length > 0 ? await db.core.from('parties').select('id, party_name').in('id', partyIds) : { data: [] }

    const prodMap: Record<string, string> = {}
    ;(prodRes.data ?? []).forEach((p: any) => { prodMap[p.id] = p.product_name })
    const partyMap: Record<string, string> = {}
    ;(partiesData ?? []).forEach((p: any) => { partyMap[p.id] = p.party_name })
    const planMap: Record<string, any> = {}
    ;(planRes.data ?? []).forEach((p: any) => { planMap[p.id] = p })

    setOrders(data.map((r: any) => ({
      ...r,
      product_name: prodMap[r.product_id] ?? '-',
      party_name: r.delivery_plan_id ? (partyMap[planMap[r.delivery_plan_id]?.party_id] ?? '-') : '-',
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = async () => {
    const [prodRes, planRes] = await Promise.all([
      db.mdm.from('products').select('id, product_name, product_code').order('product_name').limit(500),
      db.mes.from('delivery_plans').select('id, plan_no, party_id').eq('status', 'OPEN').order('created_at', { ascending: false }),
    ])
    const partyIds = [...new Set((planRes.data ?? []).map((p: any) => p.party_id))]
    const { data: partiesData } = partyIds.length > 0 ? await db.core.from('parties').select('id, party_name').in('id', partyIds) : { data: [] }
    const partyMap: Record<string, string> = {}
    ;(partiesData ?? []).forEach((p: any) => { partyMap[p.id] = p.party_name })
    setProducts(prodRes.data ?? [])
    setPlans((planRes.data ?? []).map((p: any) => ({ ...p, party_name: partyMap[p.party_id] ?? '-' })))
    setForm({ delivery_plan_id: '', product_id: '', qty_planned: '', planned_start: '', planned_end: '' })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.product_id || !form.qty_planned) {
      toast({ title: '필수 항목 누락', description: '품목과 수량을 입력하세요.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const today = new Date()
    const yy = String(today.getFullYear()).slice(2)
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const { count } = await db.mes.from('work_orders').select('id', { count: 'exact', head: true }).gte('created_at', `${today.getFullYear()}-${mm}-${dd}`)
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const work_order_no = `WO-${yy}${mm}${dd}-${seq}`
    const { error } = await db.mes.from('work_orders').insert({
      work_order_no,
      delivery_plan_id: form.delivery_plan_id || null,
      product_id: form.product_id,
      qty_planned: Number(form.qty_planned),
      planned_start: form.planned_start || null,
      planned_end: form.planned_end || null,
      status: 'RELEASED',
      created_by: user?.user_id,
    })
    setSaving(false)
    if (error) { toast({ title: '저장 실패', description: error.message, variant: 'destructive' }) }
    else { toast({ title: '작업지시서 생성 완료', description: work_order_no }); setModalOpen(false); load() }
  }

  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === 'ALL' || o.status === statusFilter
    const matchSearch = !search || o.work_order_no.includes(search) || o.product_name.includes(search) || o.party_name.includes(search)
    return matchStatus && matchSearch
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">작업지시서</h1>
        <Button onClick={openModal} className="bg-green-600 hover:bg-green-700">+ 신규 작성</Button>
      </div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <Input placeholder="작업지시번호 / 품목 / 고객사" value={search} onChange={e => setSearch(e.target.value)} className="w-72" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체</SelectItem>
            {Object.entries(WO_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-b-2 border-green-500 rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{['작업지시번호','품목명','고객사','계획수량','진행률','계획시작','계획종료','상태'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(o => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-green-700">{o.work_order_no}</td>
                  <td className="px-4 py-3 text-gray-800">{o.product_name}</td>
                  <td className="px-4 py-3 text-gray-500">{o.party_name}</td>
                  <td className="px-4 py-3 text-right">{o.qty_planned.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.round((o.qty_completed / o.qty_planned) * 100))}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{Math.round((o.qty_completed / o.qty_planned) * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{o.planned_start ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{o.planned_end ?? '-'}</td>
                  <td className="px-4 py-3"><Badge className={WO_STATUS[o.status]?.color ?? 'bg-gray-100 text-gray-600'}>{WO_STATUS[o.status]?.label ?? o.status}</Badge></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">작업지시서가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>작업지시서 신규 작성</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>납품 계획 (선택)</Label>
              <Select value={form.delivery_plan_id} onValueChange={v => setForm(f => ({ ...f, delivery_plan_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="납품 계획 선택" /></SelectTrigger>
                <SelectContent>{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.plan_no} — {p.party_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>품목 *</Label>
              <Select value={form.product_id} onValueChange={v => setForm(f => ({ ...f, product_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="품목 선택" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>[{p.product_code}] {p.product_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>계획 수량 *</Label>
              <Input type="number" min={1} className="mt-1" value={form.qty_planned} onChange={e => setForm(f => ({ ...f, qty_planned: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>계획 시작일</Label><Input type="date" className="mt-1" value={form.planned_start} onChange={e => setForm(f => ({ ...f, planned_start: e.target.value }))} /></div>
              <div><Label>계획 종료일</Label><Input type="date" className="mt-1" value={form.planned_end} onChange={e => setForm(f => ({ ...f, planned_end: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>취소</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700">{saving ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
