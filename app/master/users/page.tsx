'use client'

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
import { MasterDetailTable, type MasterDetailColumn, type MasterDetailTab } from '@/components/master-detail-table'

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

  const columns: MasterDetailColumn<SysUserRow>[] = [
    { id: 'user_code', header: '사원코드', render: row => <span className="font-mono text-gray-600">{row.user_code ?? '-'}</span> },
    {
      id: 'user_name',
      header: '이름',
      render: row => (
        <span className="font-semibold text-gray-900">
          {row.user_name}
          {row.user_id === me?.user_id && <span className="ml-1 text-xs text-green-500">(나)</span>}
        </span>
      ),
    },
    { id: 'department', header: '부서', render: row => <span className="text-gray-500">{row.department ?? '-'}</span> },
    { id: 'position_title', header: '직위', render: row => <span className="text-gray-500">{row.position_title ?? '-'}</span> },
    { id: 'role_code', header: '역할', render: row => <Badge className={ROLE_COLOR[row.role_code] ?? 'bg-gray-100 text-gray-600'}>{ROLE_LABEL[row.role_code] ?? row.role_code}</Badge> },
    {
      id: 'is_active',
      header: '상태',
      render: row => <span className={`rounded-full px-2 py-0.5 text-xs ${row.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'}`}>{row.is_active ? '활성' : '비활성'}</span>,
    },
  ]

  const detailTabs: MasterDetailTab<SysUserRow>[] = [
    {
      id: 'detail',
      label: '상세',
      render: row => (
        <div className="space-y-3 text-sm">
          {[
            ['사원코드', row.user_code ?? '-'],
            ['이름', row.user_name],
            ['부서', row.department ?? '-'],
            ['직위', row.position_title ?? '-'],
            ['역할', ROLE_LABEL[row.role_code] ?? row.role_code],
            ['전화', row.phone ?? '-'],
            ['승인일', row.approved_at ? new Date(row.approved_at).toLocaleDateString('ko-KR') : '미승인'],
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
      id: 'account',
      label: '권한',
      render: row => (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          현재 권한: {ROLE_LABEL[row.role_code] ?? row.role_code}
        </div>
      ),
    },
  ]

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

      <MasterDetailTable
        data={filtered}
        columns={columns}
        getRowId={row => row.user_id}
        detailTabs={detailTabs}
        detailTitle={row => row.user_name}
        detailSubtitle={row => `${row.user_code ?? '-'} · ${ROLE_LABEL[row.role_code] ?? row.role_code}`}
        emptyMessage="사용자가 없습니다."
        onEdit={me?.role_code === 'ADMIN' ? openEdit : undefined}
      />

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
