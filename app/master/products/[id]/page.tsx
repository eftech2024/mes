'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'

interface Spec { surface_area: number | null; piece_weight: number | null; drawing_no: string | null; rack_load_qty: number | null; immersion_seconds: number | null; target_voltage: number | null; spec_upper: number | null; spec_lower: number | null; remarks: string | null }
interface InspLink { id: string; spec_id: string; is_required: boolean; sort_order: number; spec_name: string; check_item: string; inspection_stage: string; unit: string | null }
interface InspMaster { id: string; spec_name: string; check_item: string; inspection_stage: string; unit: string | null }

export default function ProductDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()

  const [product, setProduct] = useState<any>(null)
  const [spec, setSpec] = useState<Spec | null>(null)
  const [specEditing, setSpecEditing] = useState(false)
  const [specForm, setSpecForm] = useState<Spec>({ surface_area: null, piece_weight: null, drawing_no: null, rack_load_qty: null, immersion_seconds: null, target_voltage: null, spec_upper: null, spec_lower: null, remarks: null })
  const [inspLinks, setInspLinks] = useState<InspLink[]>([])
  const [inspMasters, setInspMasters] = useState<InspMaster[]>([])
  const [addInspModal, setAddInspModal] = useState(false)
  const [addInspForm, setAddInspForm] = useState({ spec_id: '', is_required: true })
  const [loading, setLoading] = useState(true)

  const loadAll = async () => {
    setLoading(true)
    const [prodRes, specRes, linkRes] = await Promise.all([
      db.mdm.from('products').select('id, product_code, product_name, vehicle_name, default_process_type, is_active, customer_party_id').eq('id', id as string).maybeSingle(),
      db.mdm.from('product_specs').select('*').eq('product_id', id as string).maybeSingle(),
      db.mdm.from('product_inspection_specs').select('id, spec_id, is_required, sort_order').eq('product_id', id as string).order('sort_order'),
    ])
    setProduct(prodRes.data)
    setSpec(specRes.data ?? null)
    setSpecForm(specRes.data ?? { surface_area: null, piece_weight: null, drawing_no: null, rack_load_qty: null, immersion_seconds: null, target_voltage: null, spec_upper: null, spec_lower: null, remarks: null })

    if (linkRes.data && linkRes.data.length > 0) {
      const specIds = linkRes.data.map((r: any) => r.spec_id)
      const { data: masters } = await db.mdm.from('inspection_spec_master').select('id, spec_name, check_item, inspection_stage, unit').in('id', specIds)
      const masterMap: Record<string, any> = {}
      ;(masters ?? []).forEach((m: any) => { masterMap[m.id] = m })
      setInspLinks(linkRes.data.map((r: any) => ({ ...r, ...(masterMap[r.spec_id] ?? {}) })))
    } else {
      setInspLinks([])
    }
    const { data: allMasters } = await db.mdm.from('inspection_spec_master').select('id, spec_name, check_item, inspection_stage, unit').eq('is_active', true).order('inspection_stage').limit(200)
    setInspMasters(allMasters ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [id])

  const saveSpec = async () => {
    if (spec) {
      const { error } = await db.mdm.from('product_specs').update({ ...specForm, updated_at: new Date().toISOString() }).eq('product_id', id as string)
      if (error) { toast({ title: '저장 실패', description: error.message, variant: 'destructive' }); return }
    } else {
      const { error } = await db.mdm.from('product_specs').insert({ product_id: id, ...specForm })
      if (error) { toast({ title: '저장 실패', description: error.message, variant: 'destructive' }); return }
    }
    toast({ title: '사양 저장 완료' })
    setSpecEditing(false)
    loadAll()
  }

  const addInspLink = async () => {
    if (!addInspForm.spec_id) return
    const { error } = await db.mdm.from('product_inspection_specs').insert({
      product_id: id,
      spec_id: addInspForm.spec_id,
      is_required: addInspForm.is_required,
      sort_order: inspLinks.length + 1,
    })
    if (error) toast({ title: '추가 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: '검사기준 연결 완료' }); setAddInspModal(false); loadAll() }
  }

  const removeInspLink = async (linkId: string) => {
    await db.mdm.from('product_inspection_specs').delete().eq('id', linkId)
    loadAll()
  }

  const STAGE_LABEL: Record<string, string> = { INCOMING: '수입검사', PROCESS: '공정검사', FINAL: '출하검사' }
  const STAGE_COLOR: Record<string, string> = { INCOMING: 'bg-sky-100 text-sky-700', PROCESS: 'bg-amber-100 text-amber-700', FINAL: 'bg-green-100 text-green-700' }

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-b-2 border-green-500 rounded-full animate-spin" /></div>
  if (!product) return <div className="p-6 text-gray-500">품목을 찾을 수 없습니다.</div>

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-700 font-bold text-lg">←</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{product.product_name}</h1>
          <p className="text-sm text-gray-500 font-mono">{product.product_code} {product.vehicle_name ? `/ ${product.vehicle_name}` : ''}</p>
        </div>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${product.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{product.is_active ? '활성' : '비활성'}</span>
      </div>

      <Tabs defaultValue="spec">
        <TabsList className="mb-4">
          <TabsTrigger value="spec">제품 사양</TabsTrigger>
          <TabsTrigger value="inspection">검사기준</TabsTrigger>
        </TabsList>

        {/* 제품 사양 탭 */}
        <TabsContent value="spec">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-700">제품 사양</h2>
              {!specEditing
                ? <Button onClick={() => setSpecEditing(true)} variant="outline" className="text-sm">수정</Button>
                : <div className="flex gap-2"><Button variant="outline" onClick={() => setSpecEditing(false)}>취소</Button><Button onClick={saveSpec} className="bg-green-600 hover:bg-green-700">저장</Button></div>
              }
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: '표면적 (cm²)', key: 'surface_area' },
                { label: '단중 (g)', key: 'piece_weight' },
                { label: '도면번호', key: 'drawing_no', text: true },
                { label: '랙 적재수 (pcs)', key: 'rack_load_qty' },
                { label: '입조 시간 (초)', key: 'immersion_seconds' },
                { label: '목표 전압 (V)', key: 'target_voltage' },
                { label: '스펙 상한 (μm)', key: 'spec_upper' },
                { label: '스펙 하한 (μm)', key: 'spec_lower' },
              ].map(({ label, key, text }) => (
                <div key={key}>
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  {specEditing
                    ? <Input type={text ? 'text' : 'number'} value={(specForm as any)[key] ?? ''} onChange={e => setSpecForm(f => ({ ...f, [key]: text ? e.target.value || null : (e.target.value ? Number(e.target.value) : null) }))} className="h-8 text-sm" />
                    : <p className="text-sm font-semibold text-gray-900">{(spec as any)?.[key] ?? '-'}</p>
                  }
                </div>
              ))}
            </div>
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-1">비고</p>
              {specEditing
                ? <textarea className="w-full border border-gray-200 rounded-md p-2 text-sm resize-none" rows={2} value={specForm.remarks ?? ''} onChange={e => setSpecForm(f => ({ ...f, remarks: e.target.value || null }))} />
                : <p className="text-sm text-gray-700">{spec?.remarks ?? '-'}</p>
              }
            </div>
          </div>
        </TabsContent>

        {/* 검사기준 탭 */}
        <TabsContent value="inspection">
          <div className="flex justify-between mb-3">
            <p className="text-sm text-gray-500">이 품목에 적용되는 검사 기준 목록</p>
            <Button onClick={() => { setAddInspForm({ spec_id: '', is_required: true }); setAddInspModal(true) }} className="bg-green-600 hover:bg-green-700 text-sm">+ 기준 연결</Button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['검사 단계','기준명','검사 항목','단위','필수','삭제'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inspLinks.map(l => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3"><Badge className={STAGE_COLOR[l.inspection_stage] ?? 'bg-gray-100 text-gray-600'}>{STAGE_LABEL[l.inspection_stage] ?? l.inspection_stage}</Badge></td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{l.spec_name}</td>
                    <td className="px-4 py-3 text-gray-600">{l.check_item}</td>
                    <td className="px-4 py-3 text-gray-500">{l.unit ?? '-'}</td>
                    <td className="px-4 py-3">{l.is_required ? <Badge className="bg-red-100 text-red-700">필수</Badge> : <span className="text-gray-300 text-xs">선택</span>}</td>
                    <td className="px-4 py-3"><button onClick={() => removeInspLink(l.id)} className="text-xs text-red-400 hover:text-red-700">삭제</button></td>
                  </tr>
                ))}
                {inspLinks.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">연결된 검사기준이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* 검사기준 연결 모달 */}
      <Dialog open={addInspModal} onOpenChange={setAddInspModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>검사기준 연결</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>검사기준 선택</Label>
              <Select value={addInspForm.spec_id} onValueChange={v => setAddInspForm(f => ({ ...f, spec_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="기준 선택" /></SelectTrigger>
                <SelectContent>
                  {inspMasters.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      [{STAGE_LABEL[m.inspection_stage] ?? m.inspection_stage}] {m.spec_name} — {m.check_item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isReq" checked={addInspForm.is_required} onChange={e => setAddInspForm(f => ({ ...f, is_required: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="isReq">필수 검사항목</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAddInspModal(false)}>취소</Button>
              <Button onClick={addInspLink} className="bg-green-600 hover:bg-green-700">연결</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
