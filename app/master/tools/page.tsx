'use client'

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
                <tr key={t.id} className={`hover:bg-gray-50 ${isExpiring ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3 font-mono text-gray-600">{t.tool_code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{t.tool_name}</td>
                  <td className="px-4 py-3 text-gray-500">{t.tool_type ?? '-'}</td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{t.serial_no ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{t.last_calibration_date ?? '-'}</td>
                  <td className={`px-4 py-3 ${isExpiring ? 'text-red-600 font-bold' : 'text-gray-500'}`}>{t.next_calibration_date ?? '-'}</td>
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
