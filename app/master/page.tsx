'use client'

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
                      <Link href={`/master/products/${p.id}`} className="text-green-700 hover:underline">{p.product_name}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.vehicle_name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.customer_name ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-500">{PROCESS_LABEL[p.default_process_type] ?? p.default_process_type}</td>
                    <td className="px-4 py-3"><Link href={`/master/products/${p.id}`} className="text-xs text-blue-500 hover:underline">상세 →</Link></td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{p.is_active ? '활성' : '비활성'}</span></td>
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
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{p.is_active ? '활성' : '비활성'}</span></td>
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
