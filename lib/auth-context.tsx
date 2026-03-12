'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase, db, type SysUser } from '@/lib/supabase'

export interface AuthUser extends SysUser {
  email: string | null
}

interface AuthContextType {
  user:    AuthUser | null
  loading: boolean
  login:   (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout:  () => Promise<void>
  signup:  (email: string, password: string, name: string, code?: string) => Promise<{ ok: boolean; error?: string }>
}

const AuthContext = createContext<AuthContextType>({
  user:    null,
  loading: true,
  login:   async () => ({ ok: false }),
  logout:  async () => {},
  signup:  async () => ({ ok: false }),
})

async function fetchProfile(supabaseUser: SupabaseUser): Promise<AuthUser | null> {
  const { data } = await db.sys
    .from('users')
    .select('*')
    .eq('user_id', supabaseUser.id)
    .single()
  if (!data) return null
  return { ...(data as SysUser), email: supabaseUser.email ?? null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 최초 세션 확인
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user)
        setUser(profile)
      }
      setLoading(false)
    })

    // 세션 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user)
        setUser(profile)
      } else {
        setUser(null)
      }
      if (event !== 'INITIAL_SESSION') setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: error.message }
    if (!data.user) return { ok: false, error: '로그인 실패' }

    const profile = await fetchProfile(data.user)
    if (!profile) return { ok: false, error: '사용자 정보를 찾을 수 없습니다.' }
    if (!profile.is_active) return { ok: false, error: '승인 대기 중입니다. 관리자에게 문의하세요.' }

    setUser(profile)
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  const signup = useCallback(async (email: string, password: string, name: string, department?: string) => {
    // 1) Supabase Auth 회원가입 — 이름을 메타데이터로 전달 (트리거가 sys.users 자동 생성)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { user_name: name } },
    })
    if (error) return { ok: false, error: error.message }
    if (!data.user) return { ok: false, error: '회원가입 실패' }

    // 2) 트리거가 sys.users 행을 생성한 후 부서 정보 업데이트
    //    (잠깐 대기 후 RPC 호출 — 트리거 실행 시간 확보)
    await new Promise(r => setTimeout(r, 800))
    await supabase.rpc('update_signup_profile', {
      p_user_id:    data.user.id,
      p_user_name:  name,
      p_department: department ?? null,
    })

    return { ok: true }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

