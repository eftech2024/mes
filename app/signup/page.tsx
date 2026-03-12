'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SignupPage() {
  const { signup } = useAuth()
  const [form, setForm] = useState({ email: '', full_name: '', department: '', password: '', confirmPassword: '' })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.email || !form.full_name || !form.password) {
      setError('이메일, 이름, 비밀번호는 필수입니다.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }
    if (form.password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }

    setLoading(true)
    const result = await signup(form.email, form.password, form.full_name, form.department)
    setLoading(false)

    if (!result.ok) {
      setError(result.error ?? '가입 신청 중 오류가 발생했습니다.')
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <Image src="/logo-h.png" alt="EF Technology" width={260} height={70} className="object-contain" priority />
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center"><svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg></div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">가입 신청 완료</h2>
            <p className="text-sm text-gray-500 mb-5">관리자 승인 후 로그인할 수 있습니다.</p>
            <Link href="/login"
              className="block w-full bg-green-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-green-700 transition-colors text-center">
              로그인으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Image src="/logo-h.png" alt="EF Technology" width={260} height={70} className="object-contain" priority />
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">회원가입</h2>
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일 *</Label>
            <Input id="email" type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="user@example.com" autoComplete="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="full_name">이름 *</Label>
            <Input id="full_name" type="text" value={form.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="홍길동" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="department">부서</Label>
            <Input id="department" type="text" value={form.department} onChange={e => set('department', e.target.value)}
              placeholder="생산팀" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호 * (8자 이상)</Label>
            <Input id="password" type="password" value={form.password} onChange={e => set('password', e.target.value)}
              placeholder="비밀번호" autoComplete="new-password" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">비밀번호 확인 *</Label>
            <Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
              placeholder="비밀번호 재입력" autoComplete="new-password" required />
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? '신청 중...' : '가입 신청'}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-4">
          이미 계정이 있으신가요? <Link href="/login" className="text-green-600 font-semibold hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  )
}
