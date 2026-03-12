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

  const removeSpec = async (spec: InspSpec) => {
    if (!confirm(`${spec.spec_name} 기준을 삭제하시겠습니까?`)) return
    const { error } = await db.mdm.from('inspection_spec_master').delete().eq('id', spec.id)
    if (error) {
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: '검사기준 삭제 완료' })
    await load()
  }

  const filtered = specs.filter(s => {
    const matchStage = stageFilter === 'ALL' || s.inspection_stage === stageFilter
    const matchSearch = !search || s.spec_name.toLowerCase().includes(search.toLowerCase()) || s.check_item.toLowerCase().includes(search.toLowerCase())
    return matchStage && matchSearch
  })

  const columns: MasterDetailColumn<InspSpec>[] = [
    {
      id: 'inspection_stage',
      header: '검사 단계',
      render: row => <Badge className={STAGE_COLOR[row.inspection_stage] ?? 'bg-gray-100 text-gray-600'}>{STAGE_LABEL[row.inspection_stage] ?? row.inspection_stage}</Badge>,
    },
    { id: 'spec_name', header: '기준명', render: row => <span className="font-medium text-gray-900">{row.spec_name}</span> },
    { id: 'check_item', header: '검사 항목', render: row => <span className="text-gray-700">{row.check_item}</span> },
    { id: 'measuring_tool', header: '계측기', render: row => <span className="text-gray-500">{row.measuring_tool ?? '-'}</span> },
    {
      id: 'criteria',
      header: '기준치',
      render: row => (
        <span className="text-xs text-gray-500">
          {row.lower_limit != null || row.upper_limit != null
            ? `${row.lower_limit ?? '?'} ~ ${row.upper_limit ?? '?'}${row.unit ? ` ${row.unit}` : ''}`
            : row.criteria_text ?? '-'}
        </span>
      ),
    },
    {
      id: 'is_active',
      header: '상태',
      render: row => (
        <button onClick={(event) => { event.stopPropagation(); void toggleActive(row) }} className={`rounded-full px-2 py-0.5 text-xs ${row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
          {row.is_active ? '활성' : '비활성'}
        </button>
      ),
    },
  ]

  const detailTabs: MasterDetailTab<InspSpec>[] = [
    {
      id: 'detail',
      label: '상세',
      render: row => (
        <div className="space-y-3 text-sm">
          {[
            ['검사단계', STAGE_LABEL[row.inspection_stage] ?? row.inspection_stage],
            ['기준명', row.spec_name],
            ['검사항목', row.check_item],
            ['계측기', row.measuring_tool ?? '-'],
            ['기준치', row.lower_limit != null || row.upper_limit != null ? `${row.lower_limit ?? '?'} ~ ${row.upper_limit ?? '?'}${row.unit ? ` ${row.unit}` : ''}` : (row.criteria_text ?? '-')],
            ['상태', row.is_active ? '활성' : '비활성'],
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
      id: 'rule',
      label: '판정기준',
      render: row => <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{row.criteria_text ?? '수치 범위를 기준으로 판정합니다.'}</div>,
    },
  ]

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

      <MasterDetailTable
        data={filtered}
        columns={columns}
        getRowId={row => row.id}
        detailTabs={detailTabs}
        detailTitle={row => row.spec_name}
        detailSubtitle={row => `${STAGE_LABEL[row.inspection_stage] ?? row.inspection_stage} · ${row.check_item}`}
        emptyMessage="검사기준이 없습니다."
        onEdit={openEdit}
        onDelete={removeSpec}
      />

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
                <Select value={form.process_type_code || 'NONE'} onValueChange={v => setForm(f => ({ ...f, process_type_code: v === 'NONE' ? '' : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="전체 공용" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">전체 공용</SelectItem>
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
