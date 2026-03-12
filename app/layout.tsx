'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

//  SVG icon helpers 
function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9,22 9,12 15,12 15,22"/>
    </svg>
  )
}
function IconScan({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
      <line x1="7" y1="12" x2="17" y2="12" strokeWidth={active ? 2.5 : 2}/>
    </svg>
  )
}
function IconInbound({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7,10 12,15 17,10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}
function IconPop({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 3v3M12 18v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M3 12h3M18 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
    </svg>
  )
}
function IconInspect({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}
function IconWorkorder({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
    </svg>
  )
}
function IconPlan({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IconInventory({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  )
}
function IconMaster({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  )
}
function IconShipment({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13"/>
      <path d="M16 8h4l3 3v5h-7V8z"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  )
}
function IconInspSpec({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}
function IconProcesses({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>
  )
}
function IconUsers({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function IconTools({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  )
}

const MOBILE_NAV = [
  { href: '/home',       label: '홈',     Icon: IconHome    },
  { href: '/scan',       label: '스캔',    Icon: IconScan    },
  { href: '/inbound',    label: '입고',    Icon: IconInbound },
  { href: '/pop',        label: 'POP',    Icon: IconPop     },
  { href: '/inspection', label: '검사',    Icon: IconInspect },
]

type NavItem =
  | { section: string }
  | { href: string; label: string; sub: string; Icon: (p: { active: boolean }) => JSX.Element; exact?: boolean }

const PC_NAV: NavItem[] = [
  { href: '/plan',      label: '생산계획',   sub: '납품계획 · 배정',      Icon: IconPlan      },
  { href: '/workorder', label: '작업지시서', sub: '작업지시 생성',         Icon: IconWorkorder },
  { href: '/lot',       label: 'LOT 검색',  sub: '바코드 · LOT 조회',    Icon: IconScan      },
  { href: '/inventory', label: '재고현황',   sub: '현재 재고 집계',        Icon: IconInventory },
  { href: '/shipment',  label: '출하관리',   sub: '출하처리',             Icon: IconShipment  },
  { section: '기준 관리' },
  { href: '/master',              label: '품목 / 거래처',  sub: '품목 · 거래처 · 담당자', Icon: IconMaster,    exact: true },
  { href: '/master/inspection-spec', label: '검사기준',      sub: '기준 마스터 관리',       Icon: IconInspSpec  },
  { href: '/master/processes',    label: '공정 / 불량유형', sub: '불량코드 관리',           Icon: IconProcesses },
  { href: '/master/users',        label: '사용자 관리',    sub: '계정 · 권한 관리',        Icon: IconUsers     },
  { href: '/master/tools',        label: '계측기 관리',    sub: '교정 주기 관리',          Icon: IconTools     },
]

function PwaHead() {
  return (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <link rel="manifest" href="/manifest.json" />
      <meta name="theme-color" content="#16a34a" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content="EF MES" />
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      <meta name="format-detection" content="telephone=no" />
      <meta name="application-name" content="EF MES" />
      <meta name="description" content="통합 MES/QMS 시스템" />
    </>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head><PwaHead /></head>
      <body className="bg-gray-50">
        <AuthProvider>
          <LayoutInner>{children}</LayoutInner>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  )
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, logout } = useAuth()

  const isLotDetailPage = /^\/lot\/[^/]+/.test(pathname)
  const isAuthPage = pathname === '/login' || pathname === '/signup'

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(registration => registration.update().catch(() => {}))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (loading || isLotDetailPage) return

    if (isAuthPage) {
      if (user && pathname === '/login') router.replace('/home')
      return
    }

    if (!user) router.replace('/login')
  }, [isAuthPage, isLotDetailPage, loading, pathname, router, user])

  if (isLotDetailPage) return <>{children}</>

  if (isAuthPage) return <>{children}</>

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        <div className="w-8 h-8 border-b-2 border-gray-300 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return (
    <>
      {/*  PC 레이아웃  */}
      <div className="hidden md:flex h-screen">
        <nav className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="px-4 py-4 border-b border-gray-100 flex items-center">
            <Link href="/home">
              <Image src="/logo-h.png" alt="EF Technology" width={168} height={48} className="object-contain" priority />
            </Link>
          </div>
          <div className="flex-1 p-2 space-y-0.5 overflow-y-auto">
            {PC_NAV.map((item, i) => {
              if ('section' in item) {
                return (
                  <div key={`sec-${i}`} className="px-3 pt-4 pb-1">
                    <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">{item.section}</span>
                  </div>
                )
              }
              const { href, label, sub, Icon, exact } = item
              const active = exact ? pathname === href : pathname.startsWith(href)
              const isSub = href.split('/').length > 2
              return (
                <Link key={href} href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${isSub ? 'pl-5' : ''} ${active ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <span className={active ? 'text-green-600' : 'text-gray-400'}><Icon active={active} /></span>
                  <div>
                    <div className={`${isSub ? 'text-[13px]' : 'text-sm'} font-semibold ${active ? 'text-green-700' : 'text-gray-800'}`}>{label}</div>
                    <div className={`text-[11px] mt-0.5 ${active ? 'text-green-500' : 'text-gray-400'}`}>{sub}</div>
                  </div>
                </Link>
              )
            })}
          </div>
          <div className="px-3 py-3 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{user.user_name || user.email}</div>
                <div className="text-[11px] text-gray-400">{user.role_code}</div>
              </div>
              <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 font-semibold shrink-0">로그아웃</button>
            </div>
          </div>
        </nav>
        <main className="flex-1 overflow-auto bg-gray-50">{children}</main>
      </div>

      {/*  모바일 레이아웃  */}
      <div className="flex flex-col md:hidden h-dvh">
        <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex-shrink-0 flex items-center">
          <Link href="/home">
            <Image src="/logo-h.png" alt="EF Technology" width={140} height={36} className="object-contain" priority />
          </Link>
          <span className="ml-auto text-[10px] text-gray-400 font-medium">{user.user_name || user.email}</span>
          <button onClick={logout} className="ml-2 text-[10px] text-gray-400 hover:text-red-500 font-semibold">로그아웃</button>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>

        <nav className="bg-white border-t border-gray-100 flex flex-shrink-0 safe-bottom z-50">
          {MOBILE_NAV.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className={`flex-1 flex flex-col items-center pt-2.5 pb-2 min-w-0 transition-colors ${active ? 'text-green-600' : 'text-gray-400'}`}>
                <span className={`w-6 h-0.5 rounded-full mb-2 block transition-opacity ${active ? 'bg-green-500' : 'opacity-0'}`} />
                <span className={active ? 'text-green-600' : 'text-gray-400'}><Icon active={active} /></span>
                <span className={`text-[10px] mt-1 font-semibold ${active ? 'text-green-600' : 'text-gray-400'}`}>{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
