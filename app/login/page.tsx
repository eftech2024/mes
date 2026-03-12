'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const { login, user, loading } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 이미 로그인된 세션이 있으면 홈으로 자동 이동
  useEffect(() => {
    if (!loading && user) router.replace('/home')
  }, [loading, user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setSubmitting(true)
    setError(null)
    const result = await login(email, password)
    if (!result.ok) {
      setError(result.error ?? '로그인 실패')
      setSubmitting(false)
    }
    // 성공 시 useEffect가 user 변경을 감지해 자동 redirect
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-b-2 border-green-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image src="/logo-h.png" alt="EF Technology" width={180} height={52} className="object-contain" priority />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-6">로그인</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" type="email" placeholder="user@example.com"
                value={email} onChange={e => setEmail(e.target.value)}
                autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input id="password" type="password" placeholder="비밀번호 입력"
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password" required />
            </div>
            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? '로그인 중...' : '로그인'}
            </Button>
          </form>
          <p className="mt-3 text-[11px] text-gray-400 text-center">
            로그인 상태는 자동으로 유지됩니다
          </p>
          <p className="mt-4 text-center text-sm text-gray-500">
            계정이 없으신가요?{' '}
            <Link href="/signup" className="text-green-600 font-semibold hover:underline">회원가입</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

