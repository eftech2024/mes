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
                        ? <span className={`text-xs px-2 py-0.5 rounded-full ${PROCESS_COLOR[d.process_type_code] ?? 'bg-gray-100 text-gray-600'}`}>{PROCESS_LABEL[d.process_type_code] ?? d.process_type_code}</span>
                        : <span className="text-gray-400 text-xs">공통</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{d.description ?? '-'}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${d.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{d.is_active ? '활성' : '비활성'}</span></td>
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
