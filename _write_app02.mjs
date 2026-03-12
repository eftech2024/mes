import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

function write(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
  console.log('Written:', filePath)
}

// ─── app/master/page.tsx (완전 재작성 — 탭 확장) ─────────────────────────────
write('app/master/page.tsx', `'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'

interface Product { id: string; product_code: string; product_name: string; vehicle_name: string | null; default_process_type: string; is_active: boolean; customer_name?: string }
interface Party { id: string; party_code: string; party_name: string; party_type: string; is_active: boolean }
interface Contact { id: string; party_id: string; contact_name: string; department: string | null; phone: string | null; email: string | null; is_primary: boolean; party_name?: string }

export default function MasterPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  // Products
  const [products, setProducts] = useState<Product[]>([])
  const [prodSearch, setProdSearch] = useState('')
  const [prodModal, setProdModal] = useState(false)
  const [prodForm, setProdForm] = useState({ product_code: '', product_name: '', vehicle_name: '', customer_party_id: '', default_process_type: 'ANODIZING' })
  const [prodSaving, setProdSaving] = useState(false)

  // Parties
  const [parties, setParties] = useState<Party[]>([])
  const [partySearch, setPartySearch] = useState('')
  const [partyModal, setPartyModal] = useState(false)
  const [partyForm, setPartyForm] = useState({ party_code: '', party_name: '', party_type: 'CUSTOMER', address: '' })
  const [partySaving, setPartySaving] = useState(false)

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactSearch, setContactSearch] = useState('')
  const [contactModal, setContactModal] = useState(false)
  const [contactForm, setContactForm] = useState({ party_id: '', contact_name: '', department: '', phone: '', email: '', is_primary: false })
  const [contactSaving, setContactSaving] = useState(false)

  const loadProducts = useCallback(async () => {
    const { data } = await db.mdm.from('products')
      .select('id, product_code, product_name, vehicle_name, default_process_type, is_active, customer_party_id')
      .order('product_name').limit(500)
    if (!data) return
    const customerIds = [...new Set(data.map((r: any) => r.customer_party_id).filter(Boolean))]
    const { data: parties } = customerIds.length > 0
      ? await db.core.from('parties').select('id, party_name').in('id', customerIds)
      : { data: [] }
    const partyMap: Record<string, string> = {}
    ;(parties ?? []).forEach((p: any) => { partyMap[p.id] = p.party_name })
    setProducts(data.map((r: any) => ({ ...r, customer_name: partyMap[r.customer_party_id] ?? '-' })))
  }, [])

  const loadParties = useCallback(async () => {
    const { data } = await db.core.from('parties').select('id, party_code, party_name, party_type, is_active').order('party_name').limit(500)
    setParties(data ?? [])
  }, [])

  const loadContacts = useCallback(async () => {
    const { data } = await db.core.from('contacts').select('id, party_id, contact_name, department, phone, email, is_primary').order('contact_name').limit(500)
    if (!data) return
    const partyIds = [...new Set(data.map((r: any) => r.party_id).filter(Boolean))]
    const { data: partiesData } = partyIds.length > 0
      ? await db.core.from('parties').select('id, party_name').in('id', partyIds)
      : { data: [] }
    const partyMap: Record<string, string> = {}
    ;(partiesData ?? []).forEach((p: any) => { partyMap[p.id] = p.party_name })
    setContacts(data.map((r: any) => ({ ...r, party_name: partyMap[r.party_id] ?? '-' })))
  }, [])

  useEffect(() => { loadProducts(); loadParties(); loadContacts() }, [loadProducts, loadParties, loadContacts])

  const saveProd = async () => {
    if (!prodForm.product_code || !prodForm.product_name) { toast({ title: '코드와 품목명을 입력하세요.', variant: 'destructive' }); return }
    setProdSaving(true)
    const { error } = await db.mdm.from('products').insert({
      product_code: prodForm.product_code,
      product_name: prodForm.product_name,
      vehicle_name: prodForm.vehicle_name || null,
      customer_party_id: prodForm.customer_party_id || null,
      default_process_type: prodForm.default_process_type,
      is_active: true,
      created_by: user?.user_id,
    })
    setProdSaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: '품목 등록 완료' }); setProdModal(false); loadProducts() }
  }

  const saveParty = async () => {
    if (!partyForm.party_code || !partyForm.party_name) { toast({ title: '코드와 거래처명을 입력하세요.', variant: 'destructive' }); return }
    setPartySaving(true)
    const { error } = await db.core.from('parties').insert({ ...partyForm, address: partyForm.address || null, is_active: true, created_by: user?.user_id })
    setPartySaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: '거래처 등록 완료' }); setPartyModal(false); loadParties() }
  }

  const saveContact = async () => {
    if (!contactForm.party_id || !contactForm.contact_name) { toast({ title: '거래처와 담당자명을 입력하세요.', variant: 'destructive' }); return }
    setContactSaving(true)
    const { error } = await db.core.from('contacts').insert({
      party_id: contactForm.party_id,
      contact_name: contactForm.contact_name,
      department: contactForm.department || null,
      phone: contactForm.phone || null,
      email: contactForm.email || null,
      is_primary: contactForm.is_primary,
      is_active: true,
    })
    setContactSaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: '담당자 등록 완료' }); setContactModal(false); loadContacts() }
  }

  const PROCESS_LABEL: Record<string, string> = { ANODIZING: '아노다이징', BONDING: '본딩', OTHER_POST: '기타 후공정' }
  const PARTY_LABEL: Record<string, string> = { CUSTOMER: '고객사', SUPPLIER: '공급사', BOTH: '혼합' }

  const filteredProds = products.filter(p => !prodSearch || p.product_name.toLowerCase().includes(prodSearch.toLowerCase()) || (p.product_code ?? '').toLowerCase().includes(prodSearch.toLowerCase()) || (p.vehicle_name ?? '').toLowerCase().includes(prodSearch.toLowerCase()))
  const filteredParties = parties.filter(p => !partySearch || p.party_name.toLowerCase().includes(partySearch.toLowerCase()) || (p.party_code ?? '').toLowerCase().includes(partySearch.toLowerCase()))
  const filteredContacts = contacts.filter(c => !contactSearch || c.contact_name.toLowerCase().includes(contactSearch.toLowerCase()) || (c.party_name ?? '').toLowerCase().includes(contactSearch.toLowerCase()))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">마스터 데이터</h1>
        <div className="flex gap-2">
          <Link href="/master/inspection-spec"><Button variant="outline" className="text-sm">검사기준 마스터</Button></Link>
          <Link href="/master/processes"><Button variant="outline" className="text-sm">공정/불량유형</Button></Link>
          <Link href="/master/users"><Button variant="outline" className="text-sm">사용자 관리</Button></Link>
          <Link href="/master/tools"><Button variant="outline" className="text-sm">계측기 관리</Button></Link>
        </div>
      </div>

      <Tabs defaultValue="products">
        <TabsList className="mb-4">
          <TabsTrigger value="products">품목</TabsTrigger>
          <TabsTrigger value="parties">거래처</TabsTrigger>
          <TabsTrigger value="contacts">담당자</TabsTrigger>
        </TabsList>

        {/* 품목 탭 */}
        <TabsContent value="products">
          <div className="flex gap-3 mb-4">
            <Input placeholder="품목명 / 코드 / 차종 검색" value={prodSearch} onChange={e => setProdSearch(e.target.value)} className="w-72" />
            <Button onClick={() => { setProdForm({ product_code: '', product_name: '', vehicle_name: '', customer_party_id: '', default_process_type: 'ANODIZING' }); setProdModal(true) }} className="bg-green-600 hover:bg-green-700">+ 품목 등록</Button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['품목코드','품목명','차종','고객사','공정','사양','활성'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProds.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{p.product_code}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      <Link href={\`/master/products/\${p.id}\`} className="text-green-700 hover:underline">{p.product_name}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.vehicle_name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.customer_name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{PROCESS_LABEL[p.default_process_type] ?? p.default_process_type}</td>
                    <td className="px-4 py-3"><Link href={\`/master/products/\${p.id}\`} className="text-xs text-blue-500 hover:underline">상세 →</Link></td>
                    <td className="px-4 py-3"><span className={\`text-xs px-2 py-0.5 rounded-full \${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}\`}>{p.is_active ? '활성' : '비활성'}</span></td>
                  </tr>
                ))}
                {filteredProds.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">품목이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* 거래처 탭 */}
        <TabsContent value="parties">
          <div className="flex gap-3 mb-4">
            <Input placeholder="거래처명 / 코드 검색" value={partySearch} onChange={e => setPartySearch(e.target.value)} className="w-64" />
            <Button onClick={() => { setPartyForm({ party_code: '', party_name: '', party_type: 'CUSTOMER', address: '' }); setPartyModal(true) }} className="bg-green-600 hover:bg-green-700">+ 거래처 등록</Button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['코드','거래처명','유형','활성'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredParties.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{p.party_code}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{p.party_name}</td>
                    <td className="px-4 py-3 text-gray-500">{PARTY_LABEL[p.party_type] ?? p.party_type}</td>
                    <td className="px-4 py-3"><span className={\`text-xs px-2 py-0.5 rounded-full \${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}\`}>{p.is_active ? '활성' : '비활성'}</span></td>
                  </tr>
                ))}
                {filteredParties.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400">거래처가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* 담당자 탭 */}
        <TabsContent value="contacts">
          <div className="flex gap-3 mb-4">
            <Input placeholder="담당자명 / 거래처 검색" value={contactSearch} onChange={e => setContactSearch(e.target.value)} className="w-64" />
            <Button onClick={() => { setContactForm({ party_id: '', contact_name: '', department: '', phone: '', email: '', is_primary: false }); setContactModal(true) }} className="bg-green-600 hover:bg-green-700">+ 담당자 등록</Button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['소속 거래처','담당자명','부서','전화','이메일','대표'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContacts.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{c.party_name}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{c.contact_name}</td>
                    <td className="px-4 py-3 text-gray-500">{c.department ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.email ?? '-'}</td>
                    <td className="px-4 py-3">{c.is_primary ? <Badge className="bg-green-100 text-green-700">대표</Badge> : <span className="text-gray-300 text-xs">-</span>}</td>
                  </tr>
                ))}
                {filteredContacts.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">담당자가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* 품목 등록 모달 */}
      <Dialog open={prodModal} onOpenChange={setProdModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>품목 등록</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>품목코드 *</Label><Input className="mt-1" value={prodForm.product_code} onChange={e => setProdForm(f => ({ ...f, product_code: e.target.value }))} /></div>
              <div><Label>차종</Label><Input className="mt-1" value={prodForm.vehicle_name} onChange={e => setProdForm(f => ({ ...f, vehicle_name: e.target.value }))} /></div>
            </div>
            <div><Label>품목명 *</Label><Input className="mt-1" value={prodForm.product_name} onChange={e => setProdForm(f => ({ ...f, product_name: e.target.value }))} /></div>
            <div>
              <Label>고객사</Label>
              <Select value={prodForm.customer_party_id} onValueChange={v => setProdForm(f => ({ ...f, customer_party_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="고객사 선택 (선택)" /></SelectTrigger>
                <SelectContent>{parties.filter(p => p.party_type === 'CUSTOMER' || p.party_type === 'BOTH').map(p => <SelectItem key={p.id} value={p.id}>{p.party_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>공정 유형</Label>
              <Select value={prodForm.default_process_type} onValueChange={v => setProdForm(f => ({ ...f, default_process_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANODIZING">아노다이징</SelectItem>
                  <SelectItem value="BONDING">본딩</SelectItem>
                  <SelectItem value="OTHER_POST">기타 후공정</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setProdModal(false)}>취소</Button>
              <Button onClick={saveProd} disabled={prodSaving} className="bg-green-600 hover:bg-green-700">{prodSaving ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 거래처 등록 모달 */}
      <Dialog open={partyModal} onOpenChange={setPartyModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>거래처 등록</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>거래처코드 *</Label><Input className="mt-1" value={partyForm.party_code} onChange={e => setPartyForm(f => ({ ...f, party_code: e.target.value }))} /></div>
              <div>
                <Label>유형</Label>
                <Select value={partyForm.party_type} onValueChange={v => setPartyForm(f => ({ ...f, party_type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUSTOMER">고객사</SelectItem>
                    <SelectItem value="SUPPLIER">공급사</SelectItem>
                    <SelectItem value="BOTH">혼합</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>거래처명 *</Label><Input className="mt-1" value={partyForm.party_name} onChange={e => setPartyForm(f => ({ ...f, party_name: e.target.value }))} /></div>
            <div><Label>주소</Label><Input className="mt-1" value={partyForm.address} onChange={e => setPartyForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPartyModal(false)}>취소</Button>
              <Button onClick={saveParty} disabled={partySaving} className="bg-green-600 hover:bg-green-700">{partySaving ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 담당자 등록 모달 */}
      <Dialog open={contactModal} onOpenChange={setContactModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>담당자 등록</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>소속 거래처 *</Label>
              <Select value={contactForm.party_id} onValueChange={v => setContactForm(f => ({ ...f, party_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="거래처 선택" /></SelectTrigger>
                <SelectContent>{parties.map(p => <SelectItem key={p.id} value={p.id}>{p.party_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>담당자명 *</Label><Input className="mt-1" value={contactForm.contact_name} onChange={e => setContactForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
              <div><Label>부서</Label><Input className="mt-1" value={contactForm.department} onChange={e => setContactForm(f => ({ ...f, department: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>전화</Label><Input className="mt-1" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>이메일</Label><Input className="mt-1" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isPrimary" checked={contactForm.is_primary} onChange={e => setContactForm(f => ({ ...f, is_primary: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="isPrimary">대표 담당자</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setContactModal(false)}>취소</Button>
              <Button onClick={saveContact} disabled={contactSaving} className="bg-green-600 hover:bg-green-700">{contactSaving ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
`)

// ─── app/master/products/[id]/page.tsx — 품목 상세 + 사양 + 검사기준 연결 ─────
write('app/master/products/[id]/page.tsx', `'use client'

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
          <p className="text-sm text-gray-500 font-mono">{product.product_code} {product.vehicle_name ? \`/ \${product.vehicle_name}\` : ''}</p>
        </div>
        <span className={\`ml-auto text-xs px-2 py-0.5 rounded-full \${product.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}\`}>{product.is_active ? '활성' : '비활성'}</span>
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
`)

// ─── app/master/inspection-spec/page.tsx — 검사기준 마스터 ───────────────────
write('app/master/inspection-spec/page.tsx', `'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'

interface InspSpec {
  id: string
  spec_name: string
  check_item: string
  inspection_stage: string
  process_type_code: string | null
  measuring_tool: string | null
  criteria_text: string | null
  lower_limit: number | null
  upper_limit: number | null
  unit: string | null
  is_active: boolean
}

const STAGE_LABEL: Record<string, string> = { INCOMING: '수입검사', PROCESS: '공정검사', FINAL: '출하검사' }
const STAGE_COLOR: Record<string, string> = { INCOMING: 'bg-sky-100 text-sky-700', PROCESS: 'bg-amber-100 text-amber-700', FINAL: 'bg-green-100 text-green-700' }

export default function InspectionSpecPage() {
  const { toast } = useToast()
  const [specs, setSpecs] = useState<InspSpec[]>([])
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('ALL')
  const [modal, setModal] = useState(false)
  const [editTarget, setEditTarget] = useState<InspSpec | null>(null)
  const [form, setForm] = useState({ spec_name: '', check_item: '', inspection_stage: 'INCOMING', process_type_code: '', measuring_tool: '', criteria_text: '', lower_limit: '', upper_limit: '', unit: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await db.mdm.from('inspection_spec_master').select('id, spec_name, check_item, inspection_stage, process_type_code, measuring_tool, criteria_text, lower_limit, upper_limit, unit, is_active').order('inspection_stage').order('spec_name').limit(500)
    setSpecs(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditTarget(null)
    setForm({ spec_name: '', check_item: '', inspection_stage: 'INCOMING', process_type_code: '', measuring_tool: '', criteria_text: '', lower_limit: '', upper_limit: '', unit: '' })
    setModal(true)
  }

  const openEdit = (s: InspSpec) => {
    setEditTarget(s)
    setForm({ spec_name: s.spec_name, check_item: s.check_item, inspection_stage: s.inspection_stage, process_type_code: s.process_type_code ?? '', measuring_tool: s.measuring_tool ?? '', criteria_text: s.criteria_text ?? '', lower_limit: s.lower_limit?.toString() ?? '', upper_limit: s.upper_limit?.toString() ?? '', unit: s.unit ?? '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.spec_name || !form.check_item) { toast({ title: '기준명과 검사항목을 입력하세요.', variant: 'destructive' }); return }
    setSaving(true)
    const payload = {
      spec_name: form.spec_name,
      check_item: form.check_item,
      inspection_stage: form.inspection_stage,
      process_type_code: form.process_type_code || null,
      measuring_tool: form.measuring_tool || null,
      criteria_text: form.criteria_text || null,
      lower_limit: form.lower_limit ? Number(form.lower_limit) : null,
      upper_limit: form.upper_limit ? Number(form.upper_limit) : null,
      unit: form.unit || null,
      is_active: true,
    }
    const { error } = editTarget
      ? await db.mdm.from('inspection_spec_master').update(payload).eq('id', editTarget.id)
      : await db.mdm.from('inspection_spec_master').insert(payload)
    setSaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: editTarget ? '수정 완료' : '등록 완료' }); setModal(false); load() }
  }

  const toggleActive = async (spec: InspSpec) => {
    await db.mdm.from('inspection_spec_master').update({ is_active: !spec.is_active }).eq('id', spec.id)
    load()
  }

  const filtered = specs.filter(s => {
    const matchStage = stageFilter === 'ALL' || s.inspection_stage === stageFilter
    const matchSearch = !search || s.spec_name.toLowerCase().includes(search.toLowerCase()) || s.check_item.toLowerCase().includes(search.toLowerCase())
    return matchStage && matchSearch
  })

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/master" className="text-gray-400 hover:text-gray-700 font-bold text-lg">←</Link>
        <h1 className="text-2xl font-bold text-gray-900">검사기준 마스터</h1>
        <Button onClick={openNew} className="ml-auto bg-green-600 hover:bg-green-700">+ 기준 등록</Button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <Input placeholder="기준명 / 검사항목 검색" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체</SelectItem>
            <SelectItem value="INCOMING">수입검사</SelectItem>
            <SelectItem value="PROCESS">공정검사</SelectItem>
            <SelectItem value="FINAL">출하검사</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{['검사 단계','기준명','검사 항목','계측기','기준치','단위','상태',''].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3"><Badge className={STAGE_COLOR[s.inspection_stage] ?? 'bg-gray-100 text-gray-600'}>{STAGE_LABEL[s.inspection_stage] ?? s.inspection_stage}</Badge></td>
                <td className="px-4 py-3 font-semibold text-gray-900">{s.spec_name}</td>
                <td className="px-4 py-3 text-gray-600">{s.check_item}</td>
                <td className="px-4 py-3 text-gray-500">{s.measuring_tool ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {s.lower_limit != null || s.upper_limit != null
                    ? \`\${s.lower_limit ?? '?'} ~ \${s.upper_limit ?? '?'}\`
                    : s.criteria_text ?? '-'}
                </td>
                <td className="px-4 py-3 text-gray-500">{s.unit ?? '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(s)} className={\`text-xs px-2 py-0.5 rounded-full \${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}\`}>{s.is_active ? '활성' : '비활성'}</button>
                </td>
                <td className="px-4 py-3"><button onClick={() => openEdit(s)} className="text-xs text-blue-500 hover:underline">수정</button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">검사기준이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editTarget ? '검사기준 수정' : '검사기준 등록'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>검사 단계 *</Label>
                <Select value={form.inspection_stage} onValueChange={v => setForm(f => ({ ...f, inspection_stage: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INCOMING">수입검사</SelectItem>
                    <SelectItem value="PROCESS">공정검사</SelectItem>
                    <SelectItem value="FINAL">출하검사</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>공정 유형 (선택)</Label>
                <Select value={form.process_type_code} onValueChange={v => setForm(f => ({ ...f, process_type_code: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="전체 공용" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">전체 공용</SelectItem>
                    <SelectItem value="ANODIZING">아노다이징</SelectItem>
                    <SelectItem value="BONDING">본딩</SelectItem>
                    <SelectItem value="OTHER_POST">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>기준명 *</Label><Input className="mt-1" value={form.spec_name} onChange={e => setForm(f => ({ ...f, spec_name: e.target.value }))} /></div>
            <div><Label>검사 항목 *</Label><Input className="mt-1" value={form.check_item} onChange={e => setForm(f => ({ ...f, check_item: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>계측기</Label><Input className="mt-1" value={form.measuring_tool} onChange={e => setForm(f => ({ ...f, measuring_tool: e.target.value }))} /></div>
              <div><Label>단위</Label><Input className="mt-1" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="μm, V, ℃ …" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>하한</Label><Input type="number" className="mt-1" value={form.lower_limit} onChange={e => setForm(f => ({ ...f, lower_limit: e.target.value }))} /></div>
              <div><Label>상한</Label><Input type="number" className="mt-1" value={form.upper_limit} onChange={e => setForm(f => ({ ...f, upper_limit: e.target.value }))} /></div>
            </div>
            <div><Label>기준 텍스트</Label><Input className="mt-1" value={form.criteria_text} onChange={e => setForm(f => ({ ...f, criteria_text: e.target.value }))} placeholder="수치 범위 외 문자 기준" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModal(false)}>취소</Button>
              <Button onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700">{saving ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
`)

// ─── app/master/processes/page.tsx — 공정/불량유형 마스터 ────────────────────
write('app/master/processes/page.tsx', `'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'

interface DefectType { id: string; defect_code: string; defect_name: string; process_type_code: string | null; description: string | null; is_active: boolean }

export default function ProcessesPage() {
  const { toast } = useToast()
  const [defects, setDefects] = useState<DefectType[]>([])
  const [defectSearch, setDefectSearch] = useState('')
  const [defectModal, setDefectModal] = useState(false)
  const [defectForm, setDefectForm] = useState({ defect_code: '', defect_name: '', process_type_code: '', description: '' })
  const [defectSaving, setDefectSaving] = useState(false)

  const loadDefects = useCallback(async () => {
    const { data } = await db.mdm.from('defect_types').select('id, defect_code, defect_name, process_type_code, description, is_active').order('process_type_code').order('defect_name').limit(200)
    setDefects(data ?? [])
  }, [])

  useEffect(() => { loadDefects() }, [loadDefects])

  const saveDefect = async () => {
    if (!defectForm.defect_code || !defectForm.defect_name) { toast({ title: '코드와 불량명을 입력하세요.', variant: 'destructive' }); return }
    setDefectSaving(true)
    const { error } = await db.mdm.from('defect_types').insert({
      defect_code: defectForm.defect_code,
      defect_name: defectForm.defect_name,
      process_type_code: defectForm.process_type_code || null,
      description: defectForm.description || null,
      is_active: true,
    })
    setDefectSaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: '불량유형 등록 완료' }); setDefectModal(false); loadDefects() }
  }

  const PROCESS_LABEL: Record<string, string> = { ANODIZING: '아노다이징', BONDING: '본딩', OTHER_POST: '기타' }
  const PROCESS_COLOR: Record<string, string> = { ANODIZING: 'bg-blue-100 text-blue-700', BONDING: 'bg-violet-100 text-violet-700', OTHER_POST: 'bg-gray-100 text-gray-600' }

  const filteredDefects = defects.filter(d => !defectSearch || d.defect_name.toLowerCase().includes(defectSearch.toLowerCase()) || d.defect_code.toLowerCase().includes(defectSearch.toLowerCase()))

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/master" className="text-gray-400 hover:text-gray-700 font-bold text-lg">←</Link>
        <h1 className="text-2xl font-bold text-gray-900">공정 / 불량유형 마스터</h1>
      </div>

      <Tabs defaultValue="defects">
        <TabsList className="mb-4">
          <TabsTrigger value="defects">불량유형</TabsTrigger>
        </TabsList>

        <TabsContent value="defects">
          <div className="flex gap-3 mb-4">
            <Input placeholder="불량명 / 코드 검색" value={defectSearch} onChange={e => setDefectSearch(e.target.value)} className="w-64" />
            <Button onClick={() => { setDefectForm({ defect_code: '', defect_name: '', process_type_code: '', description: '' }); setDefectModal(true) }} className="bg-green-600 hover:bg-green-700">+ 불량유형 등록</Button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['코드','불량명','공정 유형','설명','활성'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredDefects.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{d.defect_code}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{d.defect_name}</td>
                    <td className="px-4 py-3">
                      {d.process_type_code
                        ? <span className={\`text-xs px-2 py-0.5 rounded-full \${PROCESS_COLOR[d.process_type_code] ?? 'bg-gray-100 text-gray-600'}\`}>{PROCESS_LABEL[d.process_type_code] ?? d.process_type_code}</span>
                        : <span className="text-gray-400 text-xs">공통</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{d.description ?? '-'}</td>
                    <td className="px-4 py-3"><span className={\`text-xs px-2 py-0.5 rounded-full \${d.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}\`}>{d.is_active ? '활성' : '비활성'}</span></td>
                  </tr>
                ))}
                {filteredDefects.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">불량유형이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={defectModal} onOpenChange={setDefectModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>불량유형 등록</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>코드 *</Label><Input className="mt-1" value={defectForm.defect_code} onChange={e => setDefectForm(f => ({ ...f, defect_code: e.target.value }))} /></div>
              <div>
                <Label>공정 유형</Label>
                <Select value={defectForm.process_type_code} onValueChange={v => setDefectForm(f => ({ ...f, process_type_code: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="공통" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">공통</SelectItem>
                    <SelectItem value="ANODIZING">아노다이징</SelectItem>
                    <SelectItem value="BONDING">본딩</SelectItem>
                    <SelectItem value="OTHER_POST">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>불량명 *</Label><Input className="mt-1" value={defectForm.defect_name} onChange={e => setDefectForm(f => ({ ...f, defect_name: e.target.value }))} /></div>
            <div><Label>설명</Label><Input className="mt-1" value={defectForm.description} onChange={e => setDefectForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDefectModal(false)}>취소</Button>
              <Button onClick={saveDefect} disabled={defectSaving} className="bg-green-600 hover:bg-green-700">{defectSaving ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
`)

// ─── app/master/users/page.tsx — 사용자 관리 (어드민) ────────────────────────
write('app/master/users/page.tsx', `'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'

interface SysUserRow { user_id: string; user_code: string | null; user_name: string; department: string | null; position_title: string | null; phone: string | null; role_code: string; is_active: boolean; approved_at: string | null; created_at: string }

const ROLE_LABEL: Record<string, string> = { ADMIN: '관리자', MANAGER: '매니저', QC: '품질', OPERATOR: '작업자', VIEWER: '열람' }
const ROLE_COLOR: Record<string, string> = { ADMIN: 'bg-red-100 text-red-700', MANAGER: 'bg-blue-100 text-blue-700', QC: 'bg-violet-100 text-violet-700', OPERATOR: 'bg-amber-100 text-amber-700', VIEWER: 'bg-gray-100 text-gray-600' }

export default function UsersPage() {
  const { user: me } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<SysUserRow[]>([])
  const [search, setSearch] = useState('')
  const [editModal, setEditModal] = useState(false)
  const [editTarget, setEditTarget] = useState<SysUserRow | null>(null)
  const [editForm, setEditForm] = useState({ role_code: '', department: '', position_title: '', phone: '', is_active: true })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await db.sys.from('users').select('user_id, user_code, user_name, department, position_title, phone, role_code, is_active, approved_at, created_at').order('created_at', { ascending: false }).limit(200)
    setUsers(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = (u: SysUserRow) => {
    setEditTarget(u)
    setEditForm({ role_code: u.role_code, department: u.department ?? '', position_title: u.position_title ?? '', phone: u.phone ?? '', is_active: u.is_active })
    setEditModal(true)
  }

  const saveEdit = async () => {
    if (!editTarget) return
    setSaving(true)
    const payload: any = {
      role_code: editForm.role_code,
      department: editForm.department || null,
      position_title: editForm.position_title || null,
      phone: editForm.phone || null,
      is_active: editForm.is_active,
    }
    if (editForm.is_active && !editTarget.approved_at) {
      payload.approved_at = new Date().toISOString()
    }
    const { error } = await db.sys.from('users').update(payload).eq('user_id', editTarget.user_id)
    setSaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: '사용자 정보 수정 완료' }); setEditModal(false); load() }
  }

  const filtered = users.filter(u => !search || u.user_name.toLowerCase().includes(search.toLowerCase()) || (u.department ?? '').toLowerCase().includes(search.toLowerCase()) || (u.user_code ?? '').toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/master" className="text-gray-400 hover:text-gray-700 font-bold text-lg">←</Link>
        <h1 className="text-2xl font-bold text-gray-900">사용자 관리</h1>
        <span className="ml-2 text-sm text-gray-400">총 {users.length}명</span>
      </div>

      <div className="flex gap-3 mb-4">
        <Input placeholder="이름 / 부서 / 코드 검색" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{['사원코드','이름','부서','직위','역할','전화','승인일','상태',''].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(u => (
              <tr key={u.user_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-gray-500">{u.user_code ?? '-'}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{u.user_name}{u.user_id === me?.user_id && <span className="ml-1 text-xs text-green-500">(나)</span>}</td>
                <td className="px-4 py-3 text-gray-500">{u.department ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500">{u.position_title ?? '-'}</td>
                <td className="px-4 py-3"><Badge className={ROLE_COLOR[u.role_code] ?? 'bg-gray-100 text-gray-600'}>{ROLE_LABEL[u.role_code] ?? u.role_code}</Badge></td>
                <td className="px-4 py-3 text-gray-500">{u.phone ?? '-'}</td>
                <td className="px-4 py-3 text-gray-500">{u.approved_at ? new Date(u.approved_at).toLocaleDateString('ko-KR') : <span className="text-amber-500">미승인</span>}</td>
                <td className="px-4 py-3"><span className={\`text-xs px-2 py-0.5 rounded-full \${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}\`}>{u.is_active ? '활성' : '비활성'}</span></td>
                <td className="px-4 py-3">{me?.role_code === 'ADMIN' && <button onClick={() => openEdit(u)} className="text-xs text-blue-500 hover:underline">수정</button>}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">사용자가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={editModal} onOpenChange={setEditModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editTarget?.user_name} 정보 수정</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>부서</Label><Input className="mt-1" value={editForm.department} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))} /></div>
              <div><Label>직위</Label><Input className="mt-1" value={editForm.position_title} onChange={e => setEditForm(f => ({ ...f, position_title: e.target.value }))} /></div>
            </div>
            <div><Label>전화</Label><Input className="mt-1" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div>
              <Label>역할</Label>
              <Select value={editForm.role_code} onValueChange={v => setEditForm(f => ({ ...f, role_code: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="isActive">계정 활성화 (체크 해제 시 로그인 불가)</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditModal(false)}>취소</Button>
              <Button onClick={saveEdit} disabled={saving} className="bg-green-600 hover:bg-green-700">{saving ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
`)

// ─── app/master/tools/page.tsx — 계측기 관리 ─────────────────────────────────
write('app/master/tools/page.tsx', `'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'

interface Tool { id: string; tool_code: string; tool_name: string; tool_type: string | null; serial_no: string | null; last_calibration_date: string | null; next_calibration_date: string | null; calibration_cycle_months: number | null; status: string; remarks: string | null }

const STATUS_COLOR: Record<string, string> = { NORMAL: 'bg-green-100 text-green-700', EXPIRED: 'bg-red-100 text-red-700', REPAIR: 'bg-amber-100 text-amber-700', RETIRED: 'bg-gray-100 text-gray-500' }
const STATUS_LABEL: Record<string, string> = { NORMAL: '정상', EXPIRED: '교정만료', REPAIR: '수리중', RETIRED: '폐기' }

export default function ToolsPage() {
  const { toast } = useToast()
  const [tools, setTools] = useState<Tool[]>([])
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Tool | null>(null)
  const [form, setForm] = useState({ tool_code: '', tool_name: '', tool_type: '', serial_no: '', last_calibration_date: '', next_calibration_date: '', calibration_cycle_months: '', status: 'NORMAL', remarks: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await db.mdm.from('measurement_tools').select('id, tool_code, tool_name, tool_type, serial_no, last_calibration_date, next_calibration_date, calibration_cycle_months, status, remarks').order('tool_name').limit(200)
    setTools(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditTarget(null)
    setForm({ tool_code: '', tool_name: '', tool_type: '', serial_no: '', last_calibration_date: '', next_calibration_date: '', calibration_cycle_months: '', status: 'NORMAL', remarks: '' })
    setModal(true)
  }

  const openEdit = (t: Tool) => {
    setEditTarget(t)
    setForm({ tool_code: t.tool_code, tool_name: t.tool_name, tool_type: t.tool_type ?? '', serial_no: t.serial_no ?? '', last_calibration_date: t.last_calibration_date ?? '', next_calibration_date: t.next_calibration_date ?? '', calibration_cycle_months: t.calibration_cycle_months?.toString() ?? '', status: t.status, remarks: t.remarks ?? '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.tool_code || !form.tool_name) { toast({ title: '코드와 계측기명을 입력하세요.', variant: 'destructive' }); return }
    setSaving(true)
    const payload = {
      tool_code: form.tool_code,
      tool_name: form.tool_name,
      tool_type: form.tool_type || null,
      serial_no: form.serial_no || null,
      last_calibration_date: form.last_calibration_date || null,
      next_calibration_date: form.next_calibration_date || null,
      calibration_cycle_months: form.calibration_cycle_months ? Number(form.calibration_cycle_months) : null,
      status: form.status,
      remarks: form.remarks || null,
    }
    const { error } = editTarget
      ? await db.mdm.from('measurement_tools').update(payload).eq('id', editTarget.id)
      : await db.mdm.from('measurement_tools').insert(payload)
    setSaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: editTarget ? '수정 완료' : '등록 완료' }); setModal(false); load() }
  }

  const today = new Date().toISOString().split('T')[0]
  const filtered = tools.filter(t => !search || t.tool_name.toLowerCase().includes(search.toLowerCase()) || t.tool_code.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/master" className="text-gray-400 hover:text-gray-700 font-bold text-lg">←</Link>
        <h1 className="text-2xl font-bold text-gray-900">계측기 관리</h1>
        <Button onClick={openNew} className="ml-auto bg-green-600 hover:bg-green-700">+ 계측기 등록</Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {['NORMAL','EXPIRED','REPAIR','RETIRED'].map(s => (
          <div key={s} className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-400">{STATUS_LABEL[s]}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{tools.filter(t => t.status === s).length}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <Input placeholder="계측기명 / 코드 검색" value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{['코드','계측기명','유형','시리얼','최근교정일','차기교정일','상태',''].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(t => {
              const isExpiring = t.next_calibration_date && t.next_calibration_date <= today
              return (
                <tr key={t.id} className={\`hover:bg-gray-50 \${isExpiring ? 'bg-red-50/30' : ''}\`}>
                  <td className="px-4 py-3 font-mono text-gray-600">{t.tool_code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{t.tool_name}</td>
                  <td className="px-4 py-3 text-gray-500">{t.tool_type ?? '-'}</td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{t.serial_no ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{t.last_calibration_date ?? '-'}</td>
                  <td className={\`px-4 py-3 \${isExpiring ? 'text-red-600 font-bold' : 'text-gray-500'}\`}>{t.next_calibration_date ?? '-'}</td>
                  <td className="px-4 py-3"><Badge className={STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-600'}>{STATUS_LABEL[t.status] ?? t.status}</Badge></td>
                  <td className="px-4 py-3"><button onClick={() => openEdit(t)} className="text-xs text-blue-500 hover:underline">수정</button></td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">계측기가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? '계측기 수정' : '계측기 등록'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>코드 *</Label><Input className="mt-1" value={form.tool_code} onChange={e => setForm(f => ({ ...f, tool_code: e.target.value }))} /></div>
              <div><Label>유형</Label><Input className="mt-1" value={form.tool_type} onChange={e => setForm(f => ({ ...f, tool_type: e.target.value }))} placeholder="두께계, 버니어 …" /></div>
            </div>
            <div><Label>계측기명 *</Label><Input className="mt-1" value={form.tool_name} onChange={e => setForm(f => ({ ...f, tool_name: e.target.value }))} /></div>
            <div><Label>시리얼 번호</Label><Input className="mt-1" value={form.serial_no} onChange={e => setForm(f => ({ ...f, serial_no: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>최근 교정일</Label><Input type="date" className="mt-1" value={form.last_calibration_date} onChange={e => setForm(f => ({ ...f, last_calibration_date: e.target.value }))} /></div>
              <div><Label>차기 교정일</Label><Input type="date" className="mt-1" value={form.next_calibration_date} onChange={e => setForm(f => ({ ...f, next_calibration_date: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>교정 주기 (개월)</Label><Input type="number" className="mt-1" value={form.calibration_cycle_months} onChange={e => setForm(f => ({ ...f, calibration_cycle_months: e.target.value }))} /></div>
              <div>
                <Label>상태</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>비고</Label><Input className="mt-1" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModal(false)}>취소</Button>
              <Button onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700">{saving ? '저장 중…' : '저장'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
`)

console.log('All app_02 pages written successfully.')
