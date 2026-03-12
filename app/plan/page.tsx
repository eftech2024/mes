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

interface DeliveryPlan {
  id: string
  plan_no: string
  status: string
  planned_delivery_date: string | null
  total_qty: number
  party_name: string
  work_order_count: number
  created_at: string
}

interface Party { id: string; party_name: string }

const PLAN_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT:     { label: '초안',  color: 'bg-gray-100 text-gray-600' },
  OPEN:      { label: '진행',  color: 'bg-blue-100 text-blue-700' },
  CLOSED:    { label: '완료',  color: 'bg-green-100 text-green-700' },
  CANCELLED: { label: '취소',  color: 'bg-red-100 text-red-700' },
}

export default function PlanPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [plans, setPlans] = useState<DeliveryPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [parties, setParties] = useState<Party[]>([])
  const [form, setForm] = useState({ party_id: '', planned_delivery_date: '', total_qty: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.mes.from('delivery_plans')
      .select('id, plan_no, status, planned_delivery_date, total_qty, party_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!data) { setLoading(false); return }

    const partyIds = [...new Set(data.map((r: any) => r.party_id).filter(Boolean))]
    const { data: partiesData } = partyIds.length > 0 ? await db.core.from('parties').select('id, party_name').in('id', partyIds) : { data: [] }
    const partyMap: Record<string, string> = {}
    ;(partiesData ?? []).forEach((p: any) => { partyMap[p.id] = p.party_name })

    // Count work orders per plan
    const planIds = data.map((r: any) => r.id)
    const { data: woData } = planIds.length > 0
      ? await db.mes.from('work_orders').select('delivery_plan_id').in('delivery_plan_id', planIds)
      : { data: [] }
    const woCountMap: Record<string, number> = {}
    ;(woData ?? []).forEach((w: any) => { woCountMap[w.delivery_plan_id] = (woCountMap[w.delivery_plan_id] ?? 0) + 1 })

    setPlans(data.map((r: any) => ({
      ...r,
      party_name: partyMap[r.party_id] ?? '-',
      work_order_count: woCountMap[r.id] ?? 0,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openModal = async () => {
    const { data } = await db.core.from('parties').select('id, party_name').eq('party_type', 'CUSTOMER').order('party_name').limit(500)
    setParties(data ?? [])
    setForm({ party_id: '', planned_delivery_date: '', total_qty: '', notes: '' })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.party_id) { toast({ title: '고객사를 선택하세요.', variant: 'destructive' }); return }
    setSaving(true)
    const today = new Date()
    const yy = String(today.getFullYear()).slice(2)
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const { count } = await db.mes.from('delivery_plans').select('id', { count: 'exact', head: true }).gte('created_at', `${today.getFullYear()}-${mm}-${dd}`)
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const plan_no = `DP-${yy}${mm}${dd}-${seq}`
    const { error } = await db.mes.from('delivery_plans').insert({
      plan_no,
      party_id: form.party_id,
      planned_delivery_date: form.planned_delivery_date || null,
      total_qty: Number(form.total_qty) || 0,
      status: 'OPEN',
      created_by: user?.user_id,
    })
    setSaving(false)
    if (error) { toast({ title: '저장 실패', description: error.message, variant: 'destructive' }) }
    else { toast({ title: '납품 계획 생성 완료', description: plan_no }); setModalOpen(false); load() }
  }

  const filtered = plans.filter(p => !search || p.plan_no.includes(search) || p.party_name.includes(search))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">생산·납품 계획</h1>
        <Button onClick={openModal} className="bg-green-600 hover:bg-green-700">+ 계획 등록</Button>
      </div>
      <div className="flex gap-3 mb-4">
        <Input placeholder="계획번호 / 고객사 검색" value={search} onChange={e => setSearch(e.target.value)} className="w-72" />
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-b-2 border-green-500 rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{['계획번호','고객사','납기예정일','총수량','작업지시수','상태'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-semibold text-green-700">{p.plan_no}</td>
                  <td className="px-4 py-3 text-gray-800">{p.party_name}</td>
                  <td className="px-4 py-3 text-gray-500">{p.planned_delivery_date ?? '-'}</td>
                  <td className="px-4 py-3 text-right">{(p.total_qty ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">{p.work_order_count}</td>
                  <td className="px-4 py-3"><Badge className={PLAN_STATUS[p.status]?.color ?? 'bg-gray-100 text-gray-600'}>{PLAN_STATUS[p.status]?.label ?? p.status}</Badge></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">납품 계획이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>납품 계획 등록</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>고객사 *</Label>
              <Select value={form.party_id} onValueChange={v => setForm(f => ({ ...f, party_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="고객사 선택" /></SelectTrigger>
                <SelectContent>{parties.map(p => <SelectItem key={p.id} value={p.id}>{p.party_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>납기 예정일</Label>
              <Input type="date" className="mt-1" value={form.planned_delivery_date} onChange={e => setForm(f => ({ ...f, planned_delivery_date: e.target.value }))} />
            </div>
            <div>
              <Label>총 수량</Label>
              <Input type="number" min={0} className="mt-1" value={form.total_qty} onChange={e => setForm(f => ({ ...f, total_qty: e.target.value }))} />
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
