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
import { MasterDetailTable, type MasterDetailColumn, type MasterDetailTab } from '@/components/master-detail-table'

interface DeliveryPlan {
  id: string
  plan_no: string
  status: string
  planned_delivery_date: string | null
  total_qty: number
  party_id: string | null
  product_id: string | null
  party_name: string
  product_name: string
  product_code: string
  vehicle_name: string
  created_at: string
  notes: string | null
}

interface Party { id: string; party_name: string }
interface Product { id: string; product_name: string; product_code: string; vehicle_name: string; customer_party_id: string | null }

const PLAN_STATUS: Record<string, { label: string; color: string }> = {
  OPEN:        { label: '진행', color: 'bg-blue-100 text-blue-700' },
  IN_PROGRESS: { label: '작업중', color: 'bg-amber-100 text-amber-700' },
  COMPLETED:   { label: '완료', color: 'bg-green-100 text-green-700' },
  CLOSED:      { label: '마감', color: 'bg-gray-100 text-gray-600' },
}

const EMPTY_FORM = { party_id: '', product_id: '', planned_delivery_date: '', total_qty: '', notes: '', status: 'OPEN' }

export default function PlanPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [plans, setPlans] = useState<DeliveryPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [parties, setParties] = useState<Party[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [editingPlan, setEditingPlan] = useState<DeliveryPlan | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.mes.from('delivery_plans')
      .select('id, plan_no, status, planned_delivery_date, total_qty, party_id, product_id, created_at, notes')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!data) { setLoading(false); return }

    const partyIds = [...new Set(data.map((row: any) => row.party_id).filter(Boolean))]
    const productIds = [...new Set(data.map((row: any) => row.product_id).filter(Boolean))]
    const [partiesRes, productsRes] = await Promise.all([
      partyIds.length > 0 ? db.core.from('parties').select('id, party_name').in('id', partyIds) : Promise.resolve({ data: [] }),
      productIds.length > 0 ? db.mdm.from('products').select('id, product_name, product_code, vehicle_name').in('id', productIds) : Promise.resolve({ data: [] }),
    ])
    const partyMap: Record<string, string> = {}
    ;(partiesRes.data ?? []).forEach((row: any) => { partyMap[row.id] = row.party_name })
    const productMap: Record<string, any> = {}
    ;(productsRes.data ?? []).forEach((row: any) => { productMap[row.id] = row })

    setPlans(data.map((row: any) => {
      const product = productMap[row.product_id]
      return {
        ...row,
        party_name: partyMap[row.party_id] ?? '-',
        product_name: product?.product_name ?? '-',
        product_code: product?.product_code ?? '-',
        vehicle_name: product?.vehicle_name ?? '-',
      }
    }))
    setLoading(false)
  }, [])

  const loadReferences = useCallback(async () => {
    const [partiesRes, productsRes] = await Promise.all([
      db.core.from('parties').select('id, party_name').eq('party_type', 'CUSTOMER').order('party_name').limit(500),
      db.mdm.from('products').select('id, product_name, product_code, vehicle_name, customer_party_id').eq('is_active', true).order('product_name').limit(500),
    ])
    setParties(partiesRes.data ?? [])
    setProducts(productsRes.data ?? [])
    return productsRes.data ?? []
  }, [])

  useEffect(() => { void load() }, [load])

  const openCreate = async () => {
    setEditingPlan(null)
    await loadReferences()
    setSelectedProduct(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = async (plan: DeliveryPlan) => {
    setEditingPlan(plan)
    const referenceProducts = await loadReferences()
    const product = referenceProducts.find((item: Product) => item.id === plan.product_id) ?? null
    setSelectedProduct(product)
    setForm({
      party_id: plan.party_id ?? '',
      product_id: plan.product_id ?? '',
      planned_delivery_date: plan.planned_delivery_date ?? '',
      total_qty: String(plan.total_qty ?? ''),
      notes: plan.notes ?? '',
      status: plan.status,
    })
    setModalOpen(true)
  }

  const handleProductChange = (productId: string) => {
    const product = products.find(item => item.id === productId) ?? null
    setSelectedProduct(product)
    setForm(prev => ({
      ...prev,
      product_id: productId,
      party_id: product?.customer_party_id ?? prev.party_id,
    }))
  }

  const save = async () => {
    if (!form.product_id) {
      toast({ title: '품명을 선택하세요.', variant: 'destructive' })
      return
    }

    setSaving(true)

    const payload = {
      party_id: form.party_id || null,
      product_id: form.product_id,
      planned_delivery_date: form.planned_delivery_date || null,
      total_qty: Number(form.total_qty) || 0,
      status: form.status,
      notes: form.notes || null,
    }

    const result = editingPlan
      ? await db.mes.from('delivery_plans').update(payload).eq('id', editingPlan.id)
      : await db.mes.from('delivery_plans').insert({
          ...payload,
          plan_no: await (async () => {
            const today = new Date()
            const yy = String(today.getFullYear()).slice(2)
            const mm = String(today.getMonth() + 1).padStart(2, '0')
            const dd = String(today.getDate()).padStart(2, '0')
            const { count } = await db.mes.from('delivery_plans').select('id', { count: 'exact', head: true }).gte('created_at', `${today.getFullYear()}-${mm}-${dd}`)
            const seq = String((count ?? 0) + 1).padStart(4, '0')
            return `DP-${yy}${mm}${dd}-${seq}`
          })(),
          created_by: user?.user_id,
        })

    setSaving(false)

    if (result.error) {
      toast({ title: '저장 실패', description: result.error.message, variant: 'destructive' })
      return
    }

    toast({ title: editingPlan ? '계획 수정 완료' : '납품 계획 생성 완료' })
    setModalOpen(false)
    await load()
  }

  const deletePlan = async (plan: DeliveryPlan) => {
    if (!confirm(`${plan.plan_no} 계획을 삭제하시겠습니까?`)) return
    const { error } = await db.mes.from('delivery_plans').delete().eq('id', plan.id)
    if (error) {
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: '계획 삭제 완료' })
    await load()
  }

  const filtered = plans.filter(plan =>
    !search || plan.plan_no.includes(search) || plan.party_name.includes(search) || plan.product_name.includes(search) || plan.product_code.includes(search)
  )

  const columns: MasterDetailColumn<DeliveryPlan>[] = [
    { id: 'plan_no', header: '계획번호', render: row => <span className="font-mono font-semibold text-green-700">{row.plan_no}</span> },
    { id: 'party_name', header: '고객사', render: row => <span className="text-gray-800">{row.party_name}</span> },
    { id: 'product_name', header: '품명', render: row => <span className="font-medium text-gray-900">{row.product_name}</span> },
    { id: 'product_code', header: '품번', render: row => <span className="font-mono text-xs text-gray-500">{row.product_code}</span> },
    { id: 'planned_delivery_date', header: '납기예정일', render: row => <span className="text-gray-500">{row.planned_delivery_date ?? '-'}</span> },
    { id: 'total_qty', header: '총수량', className: 'text-right', headerClassName: 'text-right', render: row => <span className="tabular-nums">{(row.total_qty ?? 0).toLocaleString()}</span> },
    { id: 'status', header: '상태', render: row => <Badge className={PLAN_STATUS[row.status]?.color ?? 'bg-gray-100 text-gray-600'}>{PLAN_STATUS[row.status]?.label ?? row.status}</Badge> },
  ]

  const detailTabs: MasterDetailTab<DeliveryPlan>[] = [
    {
      id: 'detail',
      label: '상세',
      render: row => (
        <div className="space-y-3 text-sm">
          {[
            ['계획번호', row.plan_no],
            ['고객사', row.party_name],
            ['품명', row.product_name],
            ['품번', row.product_code],
            ['차종', row.vehicle_name],
            ['납기예정일', row.planned_delivery_date ?? '-'],
            ['총수량', `${(row.total_qty ?? 0).toLocaleString()}개`],
            ['상태', PLAN_STATUS[row.status]?.label ?? row.status],
          ].map(([label, value]) => (
            <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
              <span className="text-gray-400">{label}</span>
              <span className="font-medium text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'memo',
      label: '메모',
      render: row => (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          {row.notes ?? '메모 없음'}
        </div>
      ),
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">생산·납품 계획</h1>
        <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700">+ 계획 등록</Button>
      </div>

      <div className="mb-4 flex gap-3">
        <Input placeholder="계획번호 / 품명 / 고객사 검색" value={search} onChange={event => setSearch(event.target.value)} className="w-80" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-green-500" /></div>
      ) : (
        <MasterDetailTable
          data={filtered}
          columns={columns}
          getRowId={row => row.id}
          detailTabs={detailTabs}
          detailTitle={row => row.product_name}
          detailSubtitle={row => `${row.plan_no} · ${row.party_name}`}
          onEdit={openEdit}
          onDelete={deletePlan}
          emptyMessage="납품 계획이 없습니다."
        />
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingPlan ? '납품 계획 수정' : '납품 계획 등록'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>품명 *</Label>
              <Select value={form.product_id} onValueChange={handleProductChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="품명 선택" /></SelectTrigger>
                <SelectContent>
                  {products.map(product => <SelectItem key={product.id} value={product.id}>{product.product_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedProduct && (
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                <div><span className="text-xs text-gray-500">품번</span><p className="font-mono font-medium">{selectedProduct.product_code ?? '-'}</p></div>
                <div><span className="text-xs text-gray-500">차종</span><p className="font-medium">{selectedProduct.vehicle_name ?? '-'}</p></div>
              </div>
            )}
            <div>
              <Label>고객사</Label>
              <Select value={form.party_id || 'NONE'} onValueChange={value => setForm(prev => ({ ...prev, party_id: value === 'NONE' ? '' : value }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="고객사 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">선택 안함</SelectItem>
                  {parties.map(party => <SelectItem key={party.id} value={party.id}>{party.party_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>납기 예정일</Label>
              <Input type="date" className="mt-1" value={form.planned_delivery_date} onChange={event => setForm(prev => ({ ...prev, planned_delivery_date: event.target.value }))} />
            </div>
            <div>
              <Label>총 수량</Label>
              <Input type="number" min={0} className="mt-1" value={form.total_qty} onChange={event => setForm(prev => ({ ...prev, total_qty: event.target.value }))} />
            </div>
            <div>
              <Label>상태</Label>
              <Select value={form.status} onValueChange={value => setForm(prev => ({ ...prev, status: value }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PLAN_STATUS).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>메모</Label>
              <Input className="mt-1" value={form.notes} onChange={event => setForm(prev => ({ ...prev, notes: event.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>취소</Button>
              <Button onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700">{saving ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
