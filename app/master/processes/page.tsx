'use client'

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
import { MasterDetailTable, type MasterDetailColumn, type MasterDetailTab } from '@/components/master-detail-table'
import { ensureUniqueFourDigitCode, getNextFourDigitCode } from '@/lib/four-digit-code'

interface DefectType { id: string; defect_code: string; defect_name: string; process_type_code: string | null; description: string | null; is_active: boolean }

export default function ProcessesPage() {
  const { toast } = useToast()
  const [defects, setDefects] = useState<DefectType[]>([])
  const [defectSearch, setDefectSearch] = useState('')
  const [defectModal, setDefectModal] = useState(false)
  const [editTarget, setEditTarget] = useState<DefectType | null>(null)
  const [defectForm, setDefectForm] = useState({ defect_code: '', defect_name: '', process_type_code: '', description: '' })
  const [defectSaving, setDefectSaving] = useState(false)

  const loadDefects = useCallback(async () => {
    const { data } = await db.mdm.from('defect_types').select('id, defect_code, defect_name, process_type_code, description, is_active').order('process_type_code').order('defect_name').limit(200)
    setDefects(data ?? [])
  }, [])

  useEffect(() => { loadDefects() }, [loadDefects])

  const openCreate = () => {
    setEditTarget(null)
    setDefectForm({ defect_code: getNextFourDigitCode(defects.map(defect => defect.defect_code)), defect_name: '', process_type_code: '', description: '' })
    setDefectModal(true)
  }

  const openEdit = (defect: DefectType) => {
    setEditTarget(defect)
    setDefectForm({ defect_code: defect.defect_code, defect_name: defect.defect_name, process_type_code: defect.process_type_code ?? '', description: defect.description ?? '' })
    setDefectModal(true)
  }

  const saveDefect = async () => {
    if (!defectForm.defect_name) { toast({ title: '불량명을 입력하세요.', variant: 'destructive' }); return }

    let defectCode = ''
    try {
      defectCode = ensureUniqueFourDigitCode(defectForm.defect_code, defects.map(defect => defect.defect_code), editTarget?.defect_code)
    } catch (error) {
      toast({ title: '코드 확인', description: error instanceof Error ? error.message : '코드 생성 실패', variant: 'destructive' })
      return
    }

    setDefectSaving(true)
    const payload = {
      defect_code: defectCode,
      defect_name: defectForm.defect_name,
      process_type_code: defectForm.process_type_code || null,
      description: defectForm.description || null,
      is_active: editTarget?.is_active ?? true,
    }
    const { error } = editTarget
      ? await db.mdm.from('defect_types').update(payload).eq('id', editTarget.id)
      : await db.mdm.from('defect_types').insert(payload)
    setDefectSaving(false)
    if (error) toast({ title: '저장 실패', description: error.message, variant: 'destructive' })
    else { toast({ title: editTarget ? '불량유형 수정 완료' : '불량유형 등록 완료' }); setDefectModal(false); loadDefects() }
  }

  const deleteDefect = async (defect: DefectType) => {
    if (!confirm(`${defect.defect_name} 불량유형을 삭제하시겠습니까?`)) return
    const { error } = await db.mdm.from('defect_types').delete().eq('id', defect.id)
    if (error) {
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: '불량유형 삭제 완료' })
    await loadDefects()
  }

  const PROCESS_LABEL: Record<string, string> = { ANODIZING: '아노다이징', BONDING: '본딩', OTHER_POST: '기타' }
  const PROCESS_COLOR: Record<string, string> = { ANODIZING: 'bg-blue-100 text-blue-700', BONDING: 'bg-violet-100 text-violet-700', OTHER_POST: 'bg-gray-100 text-gray-600' }

  const filteredDefects = defects.filter(d => !defectSearch || d.defect_name.toLowerCase().includes(defectSearch.toLowerCase()) || d.defect_code.toLowerCase().includes(defectSearch.toLowerCase()))

  const columns: MasterDetailColumn<DefectType>[] = [
    { id: 'defect_code', header: '코드', render: row => <span className="font-mono text-gray-700">{row.defect_code}</span> },
    { id: 'defect_name', header: '불량명', render: row => <span className="font-medium text-gray-900">{row.defect_name}</span> },
    {
      id: 'process_type_code',
      header: '공정 유형',
      render: row => row.process_type_code
        ? <span className={`rounded-full px-2 py-0.5 text-xs ${PROCESS_COLOR[row.process_type_code] ?? 'bg-gray-100 text-gray-600'}`}>{PROCESS_LABEL[row.process_type_code] ?? row.process_type_code}</span>
        : <span className="text-xs text-gray-400">공통</span>,
    },
    { id: 'description', header: '설명', render: row => <span className="text-gray-600">{row.description ?? '-'}</span> },
    {
      id: 'is_active',
      header: '활성',
      render: row => <span className={`rounded-full px-2 py-0.5 text-xs ${row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{row.is_active ? '활성' : '비활성'}</span>,
    },
  ]

  const detailTabs: MasterDetailTab<DefectType>[] = [
    {
      id: 'detail',
      label: '상세',
      render: row => (
        <div className="space-y-3 text-sm">
          {[
            ['코드', row.defect_code],
            ['불량명', row.defect_name],
            ['공정유형', row.process_type_code ? (PROCESS_LABEL[row.process_type_code] ?? row.process_type_code) : '공통'],
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
      id: 'description',
      label: '설명',
      render: row => <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{row.description ?? '설명 없음'}</div>,
    },
  ]

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
            <Button onClick={openCreate} className="bg-green-600 hover:bg-green-700">+ 불량유형 등록</Button>
          </div>
          <MasterDetailTable
            data={filteredDefects}
            columns={columns}
            getRowId={row => row.id}
            detailTabs={detailTabs}
            detailTitle={row => row.defect_name}
            detailSubtitle={row => `${row.defect_code} · ${row.process_type_code ? (PROCESS_LABEL[row.process_type_code] ?? row.process_type_code) : '공통'}`}
            emptyMessage="불량유형이 없습니다."
            onEdit={openEdit}
            onDelete={deleteDefect}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={defectModal} onOpenChange={setDefectModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editTarget ? '불량유형 수정' : '불량유형 등록'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>코드 *</Label><Input className="mt-1 font-mono" value={defectForm.defect_code} onChange={e => setDefectForm(f => ({ ...f, defect_code: e.target.value }))} maxLength={4} /></div>
              <div>
                <Label>공정 유형</Label>
                <Select value={defectForm.process_type_code || 'NONE'} onValueChange={v => setDefectForm(f => ({ ...f, process_type_code: v === 'NONE' ? '' : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="공통" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">공통</SelectItem>
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
