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
import { MasterDetailTable, type MasterDetailColumn, type MasterDetailTab } from '@/components/master-detail-table'
import { ensureUniqueFourDigitCode, getNextFourDigitCode } from '@/lib/four-digit-code'

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
    setForm({ tool_code: getNextFourDigitCode(tools.map(tool => tool.tool_code)), tool_name: '', tool_type: '', serial_no: '', last_calibration_date: '', next_calibration_date: '', calibration_cycle_months: '', status: 'NORMAL', remarks: '' })
    setModal(true)
  }

  const openEdit = (t: Tool) => {
    setEditTarget(t)
    setForm({ tool_code: t.tool_code, tool_name: t.tool_name, tool_type: t.tool_type ?? '', serial_no: t.serial_no ?? '', last_calibration_date: t.last_calibration_date ?? '', next_calibration_date: t.next_calibration_date ?? '', calibration_cycle_months: t.calibration_cycle_months?.toString() ?? '', status: t.status, remarks: t.remarks ?? '' })
    setModal(true)
  }

  const save = async () => {
    if (!form.tool_name) { toast({ title: '계측기명을 입력하세요.', variant: 'destructive' }); return }

    let toolCode = ''
    try {
      toolCode = ensureUniqueFourDigitCode(form.tool_code, tools.map(tool => tool.tool_code), editTarget?.tool_code)
    } catch (error) {
      toast({ title: '코드 확인', description: error instanceof Error ? error.message : '코드 생성 실패', variant: 'destructive' })
      return
    }

    setSaving(true)
    const payload = {
      tool_code: toolCode,
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

  const removeTool = async (tool: Tool) => {
    if (!confirm(`${tool.tool_name} 계측기를 삭제하시겠습니까?`)) return
    const { error } = await db.mdm.from('measurement_tools').delete().eq('id', tool.id)
    if (error) {
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: '계측기 삭제 완료' })
    await load()
  }

  const today = new Date().toISOString().split('T')[0]
  const filtered = tools.filter(t => !search || t.tool_name.toLowerCase().includes(search.toLowerCase()) || t.tool_code.toLowerCase().includes(search.toLowerCase()))

  const columns: MasterDetailColumn<Tool>[] = [
    { id: 'tool_code', header: '코드', render: row => <span className="font-mono text-gray-700">{row.tool_code}</span> },
    { id: 'tool_name', header: '계측기명', render: row => <span className="font-medium text-gray-900">{row.tool_name}</span> },
    { id: 'tool_type', header: '유형', render: row => <span className="text-gray-600">{row.tool_type ?? '-'}</span> },
    { id: 'serial_no', header: '시리얼', render: row => <span className="font-mono text-xs text-gray-500">{row.serial_no ?? '-'}</span> },
    {
      id: 'next_calibration_date',
      header: '차기교정일',
      render: row => {
        const isExpired = Boolean(row.next_calibration_date && row.next_calibration_date <= today)
        return <span className={isExpired ? 'font-semibold text-red-600' : 'text-gray-500'}>{row.next_calibration_date ?? '-'}</span>
      },
    },
    {
      id: 'status',
      header: '상태',
      render: row => <Badge className={STATUS_COLOR[row.status] ?? 'bg-gray-100 text-gray-600'}>{STATUS_LABEL[row.status] ?? row.status}</Badge>,
    },
  ]

  const detailTabs: MasterDetailTab<Tool>[] = [
    {
      id: 'detail',
      label: '상세',
      render: row => (
        <div className="space-y-3 text-sm">
          {[
            ['코드', row.tool_code],
            ['계측기명', row.tool_name],
            ['유형', row.tool_type ?? '-'],
            ['시리얼', row.serial_no ?? '-'],
            ['최근교정일', row.last_calibration_date ?? '-'],
            ['차기교정일', row.next_calibration_date ?? '-'],
            ['교정주기', row.calibration_cycle_months ? `${row.calibration_cycle_months}개월` : '-'],
            ['상태', STATUS_LABEL[row.status] ?? row.status],
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
      label: '비고',
      render: row => <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{row.remarks ?? '비고 없음'}</div>,
    },
  ]

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

      <MasterDetailTable
        data={filtered}
        columns={columns}
        getRowId={row => row.id}
        detailTabs={detailTabs}
        detailTitle={row => row.tool_name}
        detailSubtitle={row => `${row.tool_code} · ${STATUS_LABEL[row.status] ?? row.status}`}
        emptyMessage="계측기가 없습니다."
        onEdit={openEdit}
        onDelete={removeTool}
        rowClassName={row => row.next_calibration_date && row.next_calibration_date <= today ? 'bg-red-50/30' : ''}
      />

      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? '계측기 수정' : '계측기 등록'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>코드 *</Label><Input className="mt-1 font-mono" value={form.tool_code} onChange={e => setForm(f => ({ ...f, tool_code: e.target.value }))} maxLength={4} /></div>
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
