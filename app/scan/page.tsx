'use client'

import { useState, useCallback } from 'react'
import { Camera } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { CameraScanner, RecognizedItem } from '@/components/CameraScanner'
import { db } from '@/lib/supabase'
import { LOT_STATUS_LABEL, LOT_STATUS_COLOR } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'

interface LotInfo {
  barcode: string
  lot_no: string
  status: string
  product_name: string
  qty: number
}

export default function ScanPage() {
  const router = useRouter()
  const [scanning, setScanning] = useState(false)
  const [recognized, setRecognized] = useState<RecognizedItem[]>([])
  const [lotInfoMap, setLotInfoMap] = useState<Record<string, LotInfo>>({})
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleScan = useCallback(async (code: string) => {
    // Look up barcode in lot_barcodes
    const { data, error } = await db.mes
      .from('lot_barcodes')
      .select(`
        barcode_value,
        lot_master (
          lot_no, status, qty_total,
          work_order_id
        )
      `)
      .eq('barcode_value', code)
      .maybeSingle()

    if (error || !data) {
      setFeedback({ ok: false, msg: `미등록 바코드: ${code}` })
      return
    }

    const lot = data.lot_master as unknown as { lot_no: string; status: string; qty_total: number; work_order_id: string } | null
    if (!lot) {
      setFeedback({ ok: false, msg: '연결된 LOT 없음' })
      return
    }

    // Get product name via work_order
    let productName = '-'
    if (lot.work_order_id) {
      const { data: wo } = await db.mes
        .from('work_orders')
        .select('product_id')
        .eq('id', lot.work_order_id)
        .maybeSingle()
      if (wo?.product_id) {
        const { data: prod } = await db.mdm
          .from('products')
          .select('product_name')
          .eq('id', wo.product_id)
          .maybeSingle()
        if (prod?.product_name) productName = prod.product_name as string
      }
    }

    const info: LotInfo = {
      barcode: code,
      lot_no: lot.lot_no,
      status: lot.status,
      product_name: productName,
      qty: lot.qty_total,
    }

    setLotInfoMap(prev => ({ ...prev, [code]: info }))
    setRecognized(prev => [...prev, { barcode: code, label: `${productName} (${code})` }])
    setFeedback({ ok: true, msg: `${code} — ${LOT_STATUS_LABEL[lot.status as keyof typeof LOT_STATUS_LABEL] ?? lot.status}` })
  }, [])

  const handleCommit = () => {
    setScanning(false)
    // Navigate to first LOT detail if only one scanned
    const barcodes = Object.keys(lotInfoMap)
    if (barcodes.length === 1) {
      router.push(`/lot/${encodeURIComponent(barcodes[0])}`)
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-lg font-bold text-gray-900 mb-4">QR 스캔</h1>

      <button
        onClick={() => { setScanning(true); setRecognized([]); setLotInfoMap({}); setFeedback(null) }}
        className="w-full bg-green-600 text-white py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-3 shadow-sm active:scale-[0.97] transition-all mb-6"
      >
        <Camera className="w-6 h-6" /> 스캔 시작
      </button>

      {/* 스캔 결과 목록 */}
      {Object.keys(lotInfoMap).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">스캔 결과</h2>
          {Object.values(lotInfoMap).map(info => (
            <div key={info.barcode}
              onClick={() => router.push(`/lot/${encodeURIComponent(info.barcode)}`)}
              className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm cursor-pointer hover:border-green-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{info.product_name}</p>
                  <p className="text-xs font-mono text-green-700 mt-0.5">{info.barcode}</p>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">LOT 참조: {info.lot_no}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <Badge className={LOT_STATUS_COLOR[info.status as keyof typeof LOT_STATUS_COLOR] ?? ''}>
                    {LOT_STATUS_LABEL[info.status as keyof typeof LOT_STATUS_LABEL] ?? info.status}
                  </Badge>
                  <span className="text-xs text-gray-400">{info.qty}개</span>
                </div>
              </div>
              <p className="text-xs text-green-600 font-semibold mt-2">LOT 상세 보기 →</p>
            </div>
          ))}
        </div>
      )}

      {/* Camera scanner overlay */}
      {scanning && (
        <CameraScanner
          onScan={handleScan}
          onClose={() => setScanning(false)}
          recognized={recognized}
          onCommitRecognized={handleCommit}
          scanFeedback={feedback}
        />
      )}
    </div>
  )
}
