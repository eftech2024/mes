import { writeFileSync } from 'fs'

const content = `'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/components/ui/use-toast'
import Link from 'next/link'

function genCode4(name: string): string {
  if (!name.trim()) return ''
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xFFFF
  return (h % 10000).toString().padStart(4, '0')
}

function weeklyFromMonthly(monthly: number | null): string {
  return monthly && monthly > 0 ? Math.round(monthly / 4.3).toLocaleString() : '-'
}

interface Product {
  id: string; product_code: string; product_name: string
  vehicle_name: string | null; vehicle_code: string | null
  default_process_type: string; is_active: boolean
  customer_name?: string; customer_party_id: string | null
  annual_qty: number | null; monthly_qty: number | null
}
interface Party { id: string; party_code: string; party_name: string; party_type: string; is_active: boolean }
interface Contact {
  id: string; party_id: string; contact_name: string
  department: string | null; phone: string | null; email: string | null
  is_primary: boolean; party_name?: string
}

type ProdForm = {
  product_code: string; product_name: string; vehicle_name: string; vehicle_code: string
  customer_party_id: string; default_process_type: string
  annual_qty: string; monthly_qty: string; is_active: boolean
}
type PartyForm = { party_code: string; party_name: string; party_type: string; address: string; is_active: boolean }

const EMPTY_PROD: ProdForm = {
  product_code: '', product_name: '', vehicle_name: '', vehicle_code: '',
  customer_party_id: '', default_process_type: 'ANODIZING',
  annual_qty: '', monthly_qty: '', is_active: true,
}
const EMPTY_PARTY: PartyForm = { party_code: '', party_name: '', party_type: 'CUSTOMER', address: '', is_active: true }
const PROCESS_LABEL: Record<string, string> = { ANODIZING: '아노다이징', BONDING: '본딩', OTHER_POST: '기타 후공정' }
const PARTY_LABEL: Record<string, string> = { CUSTOMER: '고객사', SUPPLIER: '공급사', BOTH: '혼합' }

export default function MasterPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [products, setProducts] = useState<Product[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [prodSearch, setProdSearch] = useState('')
  const [prodModal, setProdModal] = useState(false)
  const [editProdId, setEditProdId] = useState<string | null>(null)
  const [prodForm, setProdForm] = useState<ProdForm>(EMPTY_PROD)
  const [prodSaving, setProdSaving] = useState(false)

  const [partySearch, setPartySearch] = useState('')
  const [partyModal, setPartyModal] = useState(false)
  const [editPartyId, setEditPartyId] = useState<string | null>(null)
  const [partyForm, setPartyForm] = useState<PartyForm>(EMPTY_PARTY)
  const [partySaving, setPartySaving] = useState(false)

  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactSearch, setContactSearch] = useState('')
  const [contactModal, setContactModal] = useState(false)
  const [contactForm, setContactForm] = useState({ party_id: '', contact_name: '', department: '', phone: '', email: '', is_primary: false })
  const [contactSaving, setContactSaving] = useState(false)

  const loadProducts = useCallback(async () => {
    const { data } = await db.mdm.from('products')
      .select('id, product_code, product_name, vehicle_name, vehicle_code, default_process_type, is_active, customer_party_id, annual_qty, monthly_qty')
      .order('product_name').limit(500)
    if (!data) return
    const ids = [...new Set(data.map((r: any) => r.customer_party_id).filter(Boolean))]
    const { data: pd } = ids.length > 0
      ? await db.core.from('parties').select('id, party_name').in('id', ids)
      : { data: [] }
    const pm: Record<string, string> = {}
    ;(pd ?? []).forEach((p: any) => { pm[p.id] = p.party_name })
    setProducts(data.map((r: any) => ({ ...r, customer_name: pm[r.customer_party_id] ?? '-' })))
  }, [])

  const loadParties = useCallback(async () => {
    const { data } = await db.core.from('parties')
      .select('id, party_code, party_name, party_type, is_active')
      .order('party_name').limit(500)
    setParties(data ?? [])
  }, [])

  const loadContacts = useCallback(async () => {
    const { data } = await db.core.from('contacts')
      .select('id, party_id, contact_name, department, phone, email, is_primary')
      .order('contact_name').limit(500)
    if (!data) return
    const ids = [...new Set(data.map((r: any) => r.party_id).filter(Boolean))]
    const { data: pd } = ids.length > 0
      ? await db.core.from('parties').select('id, party_name').in('id', ids)
      : { data: [] }
    const pm: Record<string, string> = {}
    ;(pd ?? []).forEach((p: any) => { pm[p.id] = p.party_name })
    setContacts(data.map((r: any) => ({ ...r, party_name: pm[r.party_id] ?? '-' })))
  }, [])

  useEffect(() => { loadProducts(); loadParties(); loadContacts() }, [loadProducts, loadParties, loadContacts])

  const handleVehicleNameChange = (name: string) => {
    setProdForm(f => ({ ...f, vehicle_name: name, vehicle_code: genCode4(name) }))
  }

  const saveProd = async () => {
    if (!prodForm.product_name) { toast({ title: '품목명을 입력하세요.', variant: 'destructive' }); return }
    setProdSaving(true)
    const payload: any = {
      product_code: prodForm.product_code || null,
      product_name: prodForm.product_name,
      vehicle_name: prodForm.vehicle_name || null,
      vehicle_code: prodForm.vehicle_code || null,
      customer_party_id: prodForm.customer_party_id || null,
      default_process_type: prodForm.default_process_type,
      annual_qty: prodForm.annual_qty ? Number(prodForm.annual_qty) : null,
      monthly_qty: prodForm.monthly_qty ? Number(prodForm.monthly_qty) : null,
      is_active: prodForm.is_active,
    }
    const { error } = editProdId
      ? await db.mdm.from('products').update(payload).eq('id', editProdId)
      : await db.mdm.from('products').insert({ ...payload, created_by: user?.user_id })
    setProdSaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: editProdId ? '품목 수정 완료' : '품목 등록 완료' }); setProdModal(false); loadProducts() }
  }

  const openEditProd = (p: Product) => {
    setProdForm({
      product_code: p.product_code ?? '',
      product_name: p.product_name,
      vehicle_name: p.vehicle_name ?? '',
      vehicle_code: p.vehicle_code ?? '',
      customer_party_id: p.customer_party_id ?? '',
      default_process_type: p.default_process_type,
      annual_qty: p.annual_qty?.toString() ?? '',
      monthly_qty: p.monthly_qty?.toString() ?? '',
      is_active: p.is_active,
    })
    setEditProdId(p.id)
    setProdModal(true)
  }

  const deleteProd = async (id: string) => {
    if (!confirm('이 품목을 삭제하시겠습니까?')) return
    const { error } = await db.mdm.from('products').delete().eq('id', id)
    if (error) toast({ title: '삭제 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: '삭제 완료' }); loadProducts() }
  }

  const saveParty = async () => {
    if (!partyForm.party_code || !partyForm.party_name) {
      toast({ title: '코드와 거래처명을 입력하세요.', variant: 'destructive' }); return
    }
    setPartySaving(true)
    const payload = {
      party_code: partyForm.party_code,
      party_name: partyForm.party_name,
      party_type: partyForm.party_type,
      address: partyForm.address || null,
      is_active: partyForm.is_active,
    }
    const { error } = editPartyId
      ? await db.core.from('parties').update(payload).eq('id', editPartyId)
      : await db.core.from('parties').insert({ ...payload, created_by: user?.user_id })
    setPartySaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: editPartyId ? '수정 완료' : '등록 완료' }); setPartyModal(false); loadParties() }
  }

  const openEditParty = (p: Party) => {
    setPartyForm({ party_code: p.party_code, party_name: p.party_name, party_type: p.party_type, address: '', is_active: p.is_active })
    setEditPartyId(p.id)
    setPartyModal(true)
  }

  const deleteParty = async (id: string) => {
    if (!confirm('이 거래처를 삭제하시겠습니까?')) return
    const { error } = await db.core.from('parties').delete().eq('id', id)
    if (error) toast({ title: '삭제 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: '삭제 완료' }); loadParties() }
  }

  const saveContact = async () => {
    if (!contactForm.party_id || !contactForm.contact_name) {
      toast({ title: '거래처와 담당자명을 입력하세요.', variant: 'destructive' }); return
    }
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
    else { toast({ title: '등록 완료' }); setContactModal(false); loadContacts() }
  }

  const filteredProds = products.filter(p =>
    !prodSearch ||
    p.product_name.toLowerCase().includes(prodSearch.toLowerCase()) ||
    (p.product_code ?? '').toLowerCase().includes(prodSearch.toLowerCase()) ||
    (p.vehicle_name ?? '').toLowerCase().includes(prodSearch.toLowerCase()),
  )
  const filteredParties = parties.filter(p =>
    !partySearch ||
    p.party_name.toLowerCase().includes(partySearch.toLowerCase()) ||
    p.party_code.toLowerCase().includes(partySearch.toLowerCase()),
  )
  const filteredContacts = contacts.filter(c =>
    !contactSearch ||
    c.contact_name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    (c.party_name ?? '').toLowerCase().includes(contactSearch.toLowerCase()),
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">마스터 데이터</h1>
        <div className="flex gap-2">
          <Link href="/master/inspection-spec"><Button variant="outline" size="sm">검사기준</Button></Link>
          <Link href="/master/processes"><Button variant="outline" size="sm">공정/불량유형</Button></Link>
          <Link href="/master/users"><Button variant="outline" size="sm">사용자 관리</Button></Link>
          <Link href="/master/tools"><Button variant="outline" size="sm">계측기 관리</Button></Link>
        </div>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">품목</TabsTrigger>
          <TabsTrigger value="parties">거래처</TabsTrigger>
          <TabsTrigger value="contacts">담당자</TabsTrigger>
        </TabsList>

        {/* 품목 탭 */}
        <TabsContent value="products" className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <Input
              placeholder="품목명 / 품번 / 차종 검색"
              value={prodSearch}
              onChange={e => setProdSearch(e.target.value)}
              className="w-72"
            />
            <Button
              onClick={() => { setProdForm(EMPTY_PROD); setEditProdId(null); setProdModal(true) }}
              className="bg-green-600 hover:bg-green-700"
            >
              + 품목 등록
            </Button>
          </div>
          <div className="rounded-lg border shadow-sm overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['품번', '품목명', '차종', '차종코드', '고객사', '공정', '연간수량', '월간소요량', '주간생산량', '상태', ''].map(h => (
                    <th key={h} className="h-10 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProds.map(p => (
                  <tr key={p.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.product_code ?? '-'}</td>
                    <td className="px-4 py-3 font-medium">{p.product_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.vehicle_name ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">{p.vehicle_code ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.customer_name ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{PROCESS_LABEL[p.default_process_type] ?? p.default_process_type}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.annual_qty ? p.annual_qty.toLocaleString() : '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.monthly_qty ? p.monthly_qty.toLocaleString() : '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700 font-medium">{weeklyFromMonthly(p.monthly_qty)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={p.is_active ? 'default' : 'secondary'}
                        className={p.is_active ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                      >
                        {p.is_active ? '활성' : '비활성'}
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
                          <DropdownMenuItem onClick={() => openEditProd(p)}>수정</DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              db.mdm.from('products').update({ is_active: !p.is_active }).eq('id', p.id).then(loadProducts)
                            }
                          >
                            {p.is_active ? '비활성화' : '활성화'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteProd(p.id)}
                          >
                            삭제
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {filteredProds.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">품목이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* 거래처 탭 */}
        <TabsContent value="parties" className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <Input placeholder="거래처명 / 코드 검색" value={partySearch} onChange={e => setPartySearch(e.target.value)} className="w-64" />
            <Button
              onClick={() => { setPartyForm(EMPTY_PARTY); setEditPartyId(null); setPartyModal(true) }}
              className="bg-green-600 hover:bg-green-700"
            >
              + 거래처 등록
            </Button>
          </div>
          <div className="rounded-lg border shadow-sm overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['코드', '거래처명', '유형', '상태', ''].map(h => (
                    <th key={h} className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredParties.map(p => (
                  <tr key={p.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.party_code}</td>
                    <td className="px-4 py-3 font-medium">{p.party_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{PARTY_LABEL[p.party_type] ?? p.party_type}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={p.is_active ? 'default' : 'secondary'}
                        className={p.is_active ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}
                      >
                        {p.is_active ? '활성' : '비활성'}
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
                          <DropdownMenuItem onClick={() => openEditParty(p)}>수정</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteParty(p.id)}
                          >
                            삭제
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {filteredParties.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">거래처가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* 담당자 탭 */}
        <TabsContent value="contacts" className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <Input placeholder="담당자명 / 거래처 검색" value={contactSearch} onChange={e => setContactSearch(e.target.value)} className="w-64" />
            <Button
              onClick={() => { setContactForm({ party_id: '', contact_name: '', department: '', phone: '', email: '', is_primary: false }); setContactModal(true) }}
              className="bg-green-600 hover:bg-green-700"
            >
              + 담당자 등록
            </Button>
          </div>
          <div className="rounded-lg border shadow-sm overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {['소속 거래처', '담당자명', '부서', '전화', '이메일', '대표'].map(h => (
                    <th key={h} className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map(c => (
                  <tr key={c.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 text-muted-foreground">{c.party_name}</td>
                    <td className="px-4 py-3 font-medium">{c.contact_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.department ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.email ?? '-'}</td>
                    <td className="px-4 py-3">
                      {c.is_primary
                        ? <Badge className="bg-green-100 text-green-700 hover:bg-green-100">대표</Badge>
                        : <span className="text-muted-foreground text-xs">-</span>
                      }
                    </td>
                  </tr>
                ))}
                {filteredContacts.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">담당자가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* 품목 등록/수정 모달 */}
      <Dialog open={prodModal} onOpenChange={setProdModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editProdId ? '품목 수정' : '품목 등록'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>차종명</Label>
                <Input
                  className="mt-1"
                  placeholder="예: EV6, K5"
                  value={prodForm.vehicle_name}
                  onChange={e => handleVehicleNameChange(e.target.value)}
                />
              </div>
              <div>
                <Label>차종코드 <span className="text-xs text-muted-foreground">(4자리, 자동생성)</span></Label>
                <Input
                  className="mt-1 font-mono"
                  maxLength={4}
                  placeholder="0000"
                  value={prodForm.vehicle_code}
                  onChange={e => setProdForm(f => ({ ...f, vehicle_code: e.target.value.replace(/\\D/g, '').slice(0, 4) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>품번 <span className="text-xs text-muted-foreground">(중복 가능)</span></Label>
                <Input
                  className="mt-1 font-mono"
                  placeholder="품번 입력"
                  value={prodForm.product_code}
                  onChange={e => setProdForm(f => ({ ...f, product_code: e.target.value }))}
                />
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
            </div>
            <div>
              <Label>품목명 *</Label>
              <Input
                className="mt-1"
                value={prodForm.product_name}
                onChange={e => setProdForm(f => ({ ...f, product_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>고객사</Label>
              <Select
                value={prodForm.customer_party_id || 'NONE'}
                onValueChange={v => setProdForm(f => ({ ...f, customer_party_id: v === 'NONE' ? '' : v }))}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="선택 안함" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">선택 안함</SelectItem>
                  {parties
                    .filter(p => p.party_type === 'CUSTOMER' || p.party_type === 'BOTH')
                    .map(p => <SelectItem key={p.id} value={p.id}>{p.party_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border p-3 space-y-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">생산량 정보</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>연간 양산 수량</Label>
                  <Input
                    type="number" min={0} className="mt-1" placeholder="연간 총 수량"
                    value={prodForm.annual_qty}
                    onChange={e => setProdForm(f => ({ ...f, annual_qty: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>월간 소요량</Label>
                  <Input
                    type="number" min={0} className="mt-1" placeholder="월 평균 소요"
                    value={prodForm.monthly_qty}
                    onChange={e => setProdForm(f => ({ ...f, monthly_qty: e.target.value }))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                주간 생산량 (자동계산) ={' '}
                <span className="font-semibold text-green-700">
                  {prodForm.monthly_qty
                    ? \`\${Math.round(Number(prodForm.monthly_qty) / 4.3).toLocaleString()}개/주\`
                    : '월간 소요량 입력 시 자동계산'
                  }
                </span>
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setProdModal(false)}>취소</Button>
              <Button onClick={saveProd} disabled={prodSaving} className="bg-green-600 hover:bg-green-700">
                {prodSaving ? '저장 중…' : editProdId ? '수정 저장' : '등록'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 거래처 등록/수정 모달 */}
      <Dialog open={partyModal} onOpenChange={setPartyModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editPartyId ? '거래처 수정' : '거래처 등록'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>거래처코드 *</Label>
                <Input className="mt-1 font-mono" value={partyForm.party_code}
                  onChange={e => setPartyForm(f => ({ ...f, party_code: e.target.value }))} />
              </div>
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
            <div>
              <Label>거래처명 *</Label>
              <Input className="mt-1" value={partyForm.party_name}
                onChange={e => setPartyForm(f => ({ ...f, party_name: e.target.value }))} />
            </div>
            <div>
              <Label>주소</Label>
              <Input className="mt-1" value={partyForm.address}
                onChange={e => setPartyForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPartyModal(false)}>취소</Button>
              <Button onClick={saveParty} disabled={partySaving} className="bg-green-600 hover:bg-green-700">
                {partySaving ? '저장 중…' : editPartyId ? '수정 저장' : '등록'}
              </Button>
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
                <SelectContent>
                  {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.party_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>담당자명 *</Label>
                <Input className="mt-1" value={contactForm.contact_name} onChange={e => setContactForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div>
                <Label>부서</Label>
                <Input className="mt-1" value={contactForm.department} onChange={e => setContactForm(f => ({ ...f, department: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>전화</Label>
                <Input className="mt-1" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <Label>이메일</Label>
                <Input className="mt-1" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setContactModal(false)}>취소</Button>
              <Button onClick={saveContact} disabled={contactSaving} className="bg-green-600 hover:bg-green-700">
                {contactSaving ? '저장 중…' : '등록'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
`

writeFileSync('app/master/page.tsx', content, 'utf8')
console.log('Written:', 'app/master/page.tsx', content.length, 'chars')
