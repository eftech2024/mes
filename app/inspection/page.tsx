'use client'

import Link from 'next/link'
import { Search, Microscope, CheckCircle2 } from 'lucide-react'

const ITEMS = [
  { href: '/inspection/incoming', label: '수입검사', desc: '입고 후 품질 검사', icon: <Search className="w-7 h-7" />,       color: 'sky' },
  { href: '/inspection/process',  label: '공정검사', desc: '작업 완료 후 검사', icon: <Microscope className="w-7 h-7" />,   color: 'violet' },
  { href: '/inspection/final',    label: '출하검사', desc: '출하 전 최종 검사', icon: <CheckCircle2 className="w-7 h-7" />, color: 'orange' },
]

const colorMap: Record<string, string> = {
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
}

export default function InspectionIndexPage() {
  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-gray-900 mb-5">검사</h1>
      <div className="space-y-3">
        {ITEMS.map(item => (
          <Link key={item.href} href={item.href}
            className={`flex items-center gap-4 p-5 rounded-xl border ${colorMap[item.color]} active:scale-[0.98] transition-all`}>
            <span className="[&>svg]:w-7 [&>svg]:h-7">{item.icon}</span>
            <div>
              <p className="text-base font-bold">{item.label}</p>
              <p className="text-xs mt-0.5 opacity-70">{item.desc}</p>
            </div>
            <span className="ml-auto text-lg opacity-50">›</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
