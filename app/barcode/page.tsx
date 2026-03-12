// @ts-nocheck
'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import jsQR from 'jsqr'
import { QRCodeSVG } from 'qrcode.react'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from '@/components/data-table'
import { supabase, 바코드Type, 품목Type, 업체Type } from '@/lib/supabase'
import { generateBarcode, 차종목록, 차종코드Map } from '@/lib/barcode'

const chB = createColumnHelper<바코드Type>()

const 공정상태List = ['입고대기', '수입검사', '공정진행', '공정검사', '출하검사', '출고완료'] as const
type 공정상태T = typeof 공정상태List[number]

const 다음상태Map: Record<string, string> = {
  '입고대기': '수입검사', '수입검사': '공정진행', '공정진행': '공정검사',
  '공정검사': '출하검사', '출하검사': '출고완료',
}
const 타임스탬프컬럼: Record<string, string> = {
  '수입검사': '수입검사일시', '공정진행': '공정진행일시', '공정검사': '공정검사일시',
  '출하검사': '출하검사일시', '출고완료': '출고완료일시',
}
const 데이터컬럼: Record<string, string> = {
  '수입검사': '수입검사데이터', '공정진행': '공정진행데이터',
  '공정검사': '공정검사데이터', '출하검사': '출하검사데이터',
}
const 상태색: Record<string, string> = {
  '입고대기': 'bg-gray-100 text-gray-700', '수입검사': 'bg-sky-50 text-sky-700',
  '공정진행': 'bg-amber-50 text-amber-700', '공정검사': 'bg-violet-50 text-violet-700',
  '출하검사': 'bg-orange-50 text-orange-700', '출고완료': 'bg-green-100 text-green-700',
}
const 탭강조: Record<string, { tab: string; btn: string; scan: string }> = {
  '입고대기': { tab: 'border-gray-700 text-gray-800', btn: 'bg-gray-700 text-white hover:bg-gray-800', scan: 'bg-gray-50 border-gray-200' },
  '수입검사': { tab: 'border-sky-600 text-sky-700', btn: 'bg-sky-600 text-white hover:bg-sky-700', scan: 'bg-sky-50 border-sky-200' },
  '공정진행': { tab: 'border-amber-500 text-amber-700', btn: 'bg-amber-500 text-white hover:bg-amber-600', scan: 'bg-amber-50 border-amber-200' },
  '공정검사': { tab: 'border-violet-600 text-violet-700', btn: 'bg-violet-600 text-white hover:bg-violet-700', scan: 'bg-violet-50 border-violet-200' },
  '출하검사': { tab: 'border-orange-500 text-orange-700', btn: 'bg-orange-500 text-white hover:bg-orange-600', scan: 'bg-orange-50 border-orange-200' },
  '출고완료': { tab: 'border-green-600 text-green-700', btn: 'bg-green-600 text-white hover:bg-green-700', scan: 'bg-green-50 border-green-200' },
}

const getDefaultForm = (tab: string): Record<string, string> => {
  const t = new Date().toISOString().slice(0, 10)
  const map: Record<string, Record<string, string>> = {
    // 수입검사: 피막두께 없음 (소재/반제품 수입검사이므로)
    '수입검사': { 외관: '합격', 치수: '합격', 검사자: '', 검사일: t },
    '공정진행': { 담당자: '', 전류: '', 온도: '', 시간: '', 특이사항: '' },
    '공정검사': { 피막두께: '', 외관: '합격', 색상: '합격', 치수: '합격', 검사자: '' },
    '출하검사': { 피막두께: '', 외관: '합격', 치수: '합격', 색상: '합격', 검사자: '', 검사일: t, 특이사항: '', 출고일자: t, 출고수량: '' },
    '출고완료': { 출고일자: t, 출고수량: '' },
  }
  return { ...(map[tab] ?? {}) }
}

/* ─── 카메라 QR 스캐너 (듀얼 감지: BarcodeDetector + jsQR) ──── */

// 오디오: iOS PWA 호환 — 싱글톤 AudioContext
let _audioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext | null {
  try {
    if (_audioCtx && _audioCtx.state !== 'closed') return _audioCtx
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    _audioCtx = new AC()
    return _audioCtx
  } catch { return null }
}
function playBeep(ok: boolean) {
  const ctx = getAudioCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain); gain.connect(ctx.destination)
  osc.type = ok ? 'square' : 'sawtooth'
  osc.frequency.value = ok ? 1800 : 350
  gain.gain.value = ok ? 0.15 : 0.1
  osc.start()
  osc.stop(ctx.currentTime + (ok ? 0.1 : 0.2))
}

interface ScanResult { text: string; corners: { x: number; y: number }[] }

function CameraScanner({
  onScan,
  onClose,
  recognized,
  onCommitRecognized,
  scanFeedback,
}: {
  onScan: (code: string) => void
  onClose: () => void
  recognized: { barcode: string; 품명: string }[]
  onCommitRecognized: () => void
  scanFeedback: { ok: boolean; msg: string } | null
}) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const fileRef     = useRef<HTMLInputElement>(null)
  const scannedRef  = useRef<Set<string>>(new Set())
  const detectTmr   = useRef<number>(0)
  const fbRef       = useRef(scanFeedback)
  const onScanRef   = useRef(onScan)

  const [mode, setMode]       = useState<'loading' | 'active' | 'error'>('loading')
  const [errMsg, setErrMsg]   = useState('')

  // ── 렌더 중 동기 업데이트 ──
  onScanRef.current = onScan
  fbRef.current = scanFeedback
  scannedRef.current = new Set(recognized.map(r => r.barcode))

  useEffect(() => { if (scanFeedback && !scanFeedback.ok) playBeep(false) }, [scanFeedback])

  // iOS AudioContext unlock
  useEffect(() => {
    const unlock = () => { const c = getAudioCtx(); if (c?.state === 'suspended') c.resume().catch(() => {}) }
    document.addEventListener('touchstart', unlock, { once: true })
    document.addEventListener('click', unlock, { once: true })
    return () => { document.removeEventListener('touchstart', unlock); document.removeEventListener('click', unlock) }
  }, [])

  // ── Canvas AR 드로잉 ─────────────────────────────
  const drawAR = useCallback((codes: ScanResult[]) => {
    const canvas = canvasRef.current, video = videoRef.current
    if (!canvas || !video) return
    const dpr = window.devicePixelRatio || 1
    const cw = canvas.clientWidth, ch = canvas.clientHeight
    if (canvas.width !== Math.round(cw * dpr)) canvas.width = Math.round(cw * dpr)
    if (canvas.height !== Math.round(ch * dpr)) canvas.height = Math.round(ch * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch)

    // 코드 없을 때 — 가이드 표시 (중앙에 얇은 코너 브래킷)
    if (!codes.length) {
      const gs = Math.min(cw, ch) * 0.55
      const gx = (cw - gs) / 2, gy = (ch - gs) / 2, gl = gs * 0.15
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(gx, gy + gl); ctx.lineTo(gx, gy); ctx.lineTo(gx + gl, gy); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(gx + gs - gl, gy); ctx.lineTo(gx + gs, gy); ctx.lineTo(gx + gs, gy + gl); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(gx, gy + gs - gl); ctx.lineTo(gx, gy + gs); ctx.lineTo(gx + gl, gy + gs); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(gx + gs - gl, gy + gs); ctx.lineTo(gx + gs, gy + gs); ctx.lineTo(gx + gs, gy + gs - gl); ctx.stroke()
      return
    }

    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh) return
    const scale = Math.max(cw / vw, ch / vh)
    const ox = (vw * scale - cw) / 2, oy = (vh * scale - ch) / 2
    const mx = (x: number) => x * scale - ox
    const my = (y: number) => y * scale - oy

    for (const code of codes) {
      if (!code.text) continue
      const done = scannedRef.current.has(code.text)
      const fb = fbRef.current
      const color = done ? '#22c55e' : (fb && !fb.ok) ? '#ef4444' : '#facc15'
      const pts = code.corners.length >= 4
        ? code.corners.map(p => ({ x: mx(p.x), y: my(p.y) }))
        : null

      if (pts) {
        // 폴리곤 영역
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.closePath()
        const [r, g, b] = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)]
        ctx.fillStyle = `rgba(${r},${g},${b},0.12)`
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 2.5
        ctx.stroke()
        // 코너 도트
        for (const p of pts) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
        }
        // 텍스트 라벨
        const label = code.text.length > 22 ? code.text.slice(0, 20) + '…' : code.text
        const icon = done ? ' ✓' : ''
        ctx.font = 'bold 12px -apple-system, sans-serif'
        const tw = ctx.measureText(label + icon).width
        const lx = Math.min(...pts.map(p => p.x)), ly = Math.min(...pts.map(p => p.y)) - 28
        const pw = tw + 16, ph = 22, rr = 5
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.beginPath()
        ctx.moveTo(lx + rr, ly); ctx.lineTo(lx + pw - rr, ly)
        ctx.quadraticCurveTo(lx + pw, ly, lx + pw, ly + rr)
        ctx.lineTo(lx + pw, ly + ph - rr)
        ctx.quadraticCurveTo(lx + pw, ly + ph, lx + pw - rr, ly + ph)
        ctx.lineTo(lx + rr, ly + ph)
        ctx.quadraticCurveTo(lx, ly + ph, lx, ly + ph - rr)
        ctx.lineTo(lx, ly + rr)
        ctx.quadraticCurveTo(lx, ly, lx + rr, ly)
        ctx.fill()
        ctx.fillStyle = color
        ctx.fillText(label + icon, lx + 8, ly + ph - 6)
      }
    }
  }, [])

  // ── 카메라 + 듀얼 감지 루프 ─────────────────────
  useEffect(() => {
    let cancelled = false
    // jsQR용 오프스크린 캔버스 (축소 해상도 → 빠른 감지)
    const DW = 640, DH = 480
    const offCanvas = document.createElement('canvas')
    offCanvas.width = DW; offCanvas.height = DH
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true })!

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream

        // 연속 자동초점
        const track = stream.getVideoTracks()[0]
        try {
          const caps = track.getCapabilities?.() as Record<string, unknown>
          if (Array.isArray(caps?.focusMode) && (caps.focusMode as string[]).includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] })
          }
        } catch {}

        // 비디오 재생 대기
        const v = videoRef.current!
        v.srcObject = stream
        await new Promise<void>(resolve => {
          const h = () => { v.removeEventListener('loadeddata', h); resolve() }
          v.addEventListener('loadeddata', h)
          v.play().catch(() => resolve())
        })
        if (cancelled) return
        setMode('active')

        // BarcodeDetector 확인 (있으면 하드웨어 가속 우선)
        type NativeDetector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string; cornerPoints?: { x: number; y: number }[] }[]> }
        let nativeDet: NativeDetector | null = null
        const BD = (window as unknown as Record<string, unknown>).BarcodeDetector as (new (o: { formats: string[] }) => NativeDetector) | undefined
        if (BD) { try { nativeDet = new BD({ formats: ['qr_code'] }) } catch {} }

        // ── 감지 루프 (setTimeout — 겹침 없이 순차 실행) ──
        const detect = async () => {
          if (cancelled) return
          const vid = videoRef.current
          if (!vid || vid.readyState < 2) { detectTmr.current = window.setTimeout(detect, 200); return }

          let results: ScanResult[] = []

          // 1차: 네이티브 BarcodeDetector (빠름, 하드웨어 가속)
          if (nativeDet) {
            try {
              const codes = await nativeDet.detect(vid)
              results = codes.filter(c => c.rawValue).map(c => ({
                text: c.rawValue.replace(/\*/g, '').trim(),
                corners: (c.cornerPoints || []).map(p => ({ x: p.x, y: p.y })),
              }))
            } catch {}
          }

          // 2차: jsQR 폴백 (네이티브 실패 or 미지원 시)
          if (!results.length) {
            offCtx.drawImage(vid, 0, 0, DW, DH)
            const imgData = offCtx.getImageData(0, 0, DW, DH)
            const code = jsQR(imgData.data, DW, DH, { inversionAttempts: 'dontInvert' })
            if (code?.data) {
              const sx = vid.videoWidth / DW, sy = vid.videoHeight / DH
              results = [{
                text: code.data.replace(/\*/g, '').trim(),
                corners: [
                  { x: code.location.topLeftCorner.x * sx, y: code.location.topLeftCorner.y * sy },
                  { x: code.location.topRightCorner.x * sx, y: code.location.topRightCorner.y * sy },
                  { x: code.location.bottomRightCorner.x * sx, y: code.location.bottomRightCorner.y * sy },
                  { x: code.location.bottomLeftCorner.x * sx, y: code.location.bottomLeftCorner.y * sy },
                ],
              }]
            }
          }

          // AR 오버레이
          drawAR(results)

          // 새 코드 처리
          for (const r of results) {
            if (!r.text || scannedRef.current.has(r.text)) continue
            scannedRef.current.add(r.text)
            playBeep(true)
            try { navigator?.vibrate?.([60, 40, 90]) } catch {}
            onScanRef.current(r.text)
          }

          if (!cancelled) detectTmr.current = window.setTimeout(detect, 100)
        }

        detect()
      } catch {
        if (!cancelled) { setErrMsg('카메라 권한을 허용해 주세요'); setMode('error') }
      }
    }

    start()
    return () => {
      cancelled = true
      clearTimeout(detectTmr.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 파일 캡처 (보조)
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const cx = c.getContext('2d')!
      cx.drawImage(img, 0, 0)
      const d = cx.getImageData(0, 0, c.width, c.height)
      const code = jsQR(d.data, d.width, d.height)
      if (code?.data) {
        const t = code.data.replace(/\*/g, '').trim()
        if (t && !scannedRef.current.has(t)) { playBeep(true); onScan(t) }
      }
      if (fileRef.current) fileRef.current.value = ''
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000' }}>
      {/* 비디오 + Canvas AR */}
      <video ref={videoRef} playsInline muted autoPlay
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <canvas ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      {/* 오버레이 UI */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10000, display: 'flex', flexDirection: 'column' }}>

        {/* 상단 */}
        <div style={{ pointerEvents: 'auto', background: 'linear-gradient(to bottom,rgba(0,0,0,0.6),transparent)', padding: '14px 16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '15px', fontWeight: 800, color: '#fff', margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>QR 스캔</p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => fileRef.current?.click()} style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📷</button>
              <button onClick={onClose} style={{ width: '36px', height: '36px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '20px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleCapture} style={{ display: 'none' }} />
        </div>

        {/* 중앙 */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {mode === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', color: '#fff' }}>
              <div style={{ width: '28px', height: '28px', border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: '13px', opacity: 0.8, margin: 0 }}>카메라 시작 중...</p>
            </div>
          )}
          {mode === 'error' && (
            <div style={{ textAlign: 'center', padding: '24px', color: '#fff' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 6px' }}>카메라 오류</p>
              <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>{errMsg}</p>
              <button onClick={() => fileRef.current?.click()} style={{ marginTop: '16px', padding: '12px 24px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>사진으로 스캔</button>
            </div>
          )}
        </div>

        {/* 하단 */}
        <div style={{ pointerEvents: 'auto', background: 'linear-gradient(to top,rgba(0,0,0,0.85),rgba(0,0,0,0.4),transparent)', padding: '20px 16px 34px' }}>
          {scanFeedback && (
            <div style={{ margin: '0 0 12px', padding: '11px 16px', borderRadius: '14px', fontSize: '15px', fontWeight: 700, textAlign: 'center', background: scanFeedback.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)', color: scanFeedback.ok ? '#86efac' : '#fca5a5', border: `1px solid ${scanFeedback.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` }}>
              {scanFeedback.msg}
            </div>
          )}
          {recognized.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', borderRadius: '16px', padding: '14px 14px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#86efac', margin: 0 }}>인식됨 {recognized.length}건</p>
                <button onClick={onCommitRecognized} style={{ padding: '10px 20px', border: 'none', borderRadius: '12px', background: '#16a34a', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>인식 완료</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recognized.length > 3 && (
                  <div style={{ textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>...+{recognized.length - 3}건 더</div>
                )}
                {recognized.slice(-3).map((r) => (
                  <div key={r.barcode} style={{ padding: '8px 12px', borderRadius: '12px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{r.barcode}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#86efac', marginLeft: '8px' }}>{r.품명}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

/* ─── 큐 항목 카드 (per-row form) ────────────────── */
interface 큐항목 { id: string; barcode: string; 품명: string; 업체: string; 차종: string; formData: Record<string, string> }

function QueueCard({ tab, item, idx, onChange, onRegister, onRemove }: {
  tab: 공정상태T; item: 큐항목; idx: number
  onChange: (key: string, val: string) => void
  onRegister: () => void
  onRemove: () => void
}) {
  const inp = 'border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400 bg-white w-full box-border max-w-full'
  const JudgeSel = ({ k }: { k: string }) => (
    <select value={item.formData[k] ?? '합격'} onChange={e => onChange(k, e.target.value)}
      className={`border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400 w-full box-border max-w-full appearance-none ${item.formData[k] === '불합격' ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
      <option value="합격">합격</option><option value="불합격">불합격</option>
    </select>
  )
  const Lbl = ({ children }: { children: string }) => <p className="text-xs text-gray-400 mb-0.5 font-semibold">{children}</p>
  const tc = 탭강조[tab]

  const hasForm = tab !== '입고대기'
  const btnLabel = tab === '출고완료' ? '정보 저장' : `${tab} 완료`

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* 항목 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <span className="text-xs font-bold text-gray-400 w-5 text-right shrink-0">{idx + 1}</span>
        <span className="text-sm font-bold text-gray-900 flex-1 min-w-0 truncate">{item.품명}</span>
        <span className="font-mono text-xs text-gray-500 shrink-0">{item.barcode}</span>
        <button onClick={onRemove} className="shrink-0 text-gray-300 hover:text-red-400 text-lg font-bold leading-none ml-1">×</button>
      </div>

      {/* 폼 영역 */}
      <div className="px-3 py-2.5 overflow-hidden">
        {!hasForm && (
          // 입고대기: 폼 없음, 처리 버튼만
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-mono">{item.barcode}</span>
            <button onClick={onRegister} className={`px-4 py-1.5 rounded-lg text-sm font-bold ${tc.btn}`}>입고완료 →</button>
          </div>
        )}

        {tab === '수입검사' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="w-24 shrink-0">
                <Lbl>외관</Lbl><JudgeSel k="외관" />
              </div>
              <div className="flex-1 min-w-0">
                <Lbl>검사일</Lbl><input type="date" value={item.formData.검사일 ?? ''} onChange={e => onChange('검사일', e.target.value)} className={inp} />
              </div>
            </div>
            <button onClick={onRegister} className={`w-full py-2 rounded-lg text-sm font-bold ${tc.btn}`}>{btnLabel}</button>
          </div>
        )}

        {tab === '공정진행' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div><Lbl>담당자</Lbl><input value={item.formData.담당자 ?? ''} onChange={e => onChange('담당자', e.target.value)} placeholder="성명" className={inp} /></div>
              <div><Lbl>전류(A)</Lbl><input value={item.formData.전류 ?? ''} onChange={e => onChange('전류', e.target.value)} placeholder="예:120" className={inp} /></div>
              <div><Lbl>온도(℃)</Lbl><input value={item.formData.온도 ?? ''} onChange={e => onChange('온도', e.target.value)} placeholder="예:18" className={inp} /></div>
              <div><Lbl>시간(min)</Lbl><input value={item.formData.시간 ?? ''} onChange={e => onChange('시간', e.target.value)} placeholder="예:60" className={inp} /></div>
              <div><Lbl>특이사항</Lbl><input value={item.formData.특이사항 ?? ''} onChange={e => onChange('특이사항', e.target.value)} placeholder="없음" className={inp} /></div>
            </div>
            <div className="flex justify-end"><button onClick={onRegister} className={`px-5 py-2 rounded-xl text-sm font-bold ${tc.btn}`}>{btnLabel}</button></div>
          </div>
        )}

        {tab === '공정검사' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div><Lbl>피막두께(μm)</Lbl><input value={item.formData.피막두께 ?? ''} onChange={e => onChange('피막두께', e.target.value)} placeholder="예:15.2" className={inp} /></div>
              <div><Lbl>외관</Lbl><JudgeSel k="외관" /></div>
              <div><Lbl>색상</Lbl><JudgeSel k="색상" /></div>
              <div><Lbl>치수</Lbl><JudgeSel k="치수" /></div>
              <div><Lbl>검사자</Lbl><input value={item.formData.검사자 ?? ''} onChange={e => onChange('검사자', e.target.value)} placeholder="성명" className={inp} /></div>
            </div>
            <div className="flex justify-end"><button onClick={onRegister} className={`px-5 py-2 rounded-xl text-sm font-bold ${tc.btn}`}>{btnLabel}</button></div>
          </div>
        )}

        {tab === '출하검사' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div><Lbl>피막두께(μm)</Lbl><input value={item.formData.피막두께 ?? ''} onChange={e => onChange('피막두께', e.target.value)} placeholder="예:15.2" className={inp} /></div>
              <div><Lbl>외관</Lbl><JudgeSel k="외관" /></div>
              <div><Lbl>치수</Lbl><JudgeSel k="치수" /></div>
              <div><Lbl>색상</Lbl><JudgeSel k="색상" /></div>
              <div><Lbl>검사자</Lbl><input value={item.formData.검사자 ?? ''} onChange={e => onChange('검사자', e.target.value)} placeholder="성명" className={inp} /></div>
              <div><Lbl>검사일</Lbl><input type="date" value={item.formData.검사일 ?? ''} onChange={e => onChange('검사일', e.target.value)} className={inp} /></div>
              <div><Lbl>특이사항</Lbl><input value={item.formData.특이사항 ?? ''} onChange={e => onChange('특이사항', e.target.value)} placeholder="없음" className={inp} /></div>
            </div>
            <div className="border-t border-gray-100 pt-2">
              <p className="text-xs font-bold text-gray-400 mb-1.5">출고 정보</p>
              <div className="grid grid-cols-2 gap-2">
                <div><Lbl>출고일자</Lbl><input type="date" value={item.formData.출고일자 ?? ''} onChange={e => onChange('출고일자', e.target.value)} className={inp} /></div>
                <div><Lbl>출고수량(EA)</Lbl><input type="number" min="1" value={item.formData.출고수량 ?? ''} onChange={e => onChange('출고수량', e.target.value)} placeholder="수량" className={inp} /></div>
              </div>
            </div>
            <div className="flex justify-end"><button onClick={onRegister} className={`px-5 py-2 rounded-xl text-sm font-bold ${tc.btn}`}>{btnLabel}</button></div>
          </div>
        )}

        {tab === '출고완료' && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div><Lbl>출고일자</Lbl><input type="date" value={item.formData.출고일자 ?? ''} onChange={e => onChange('출고일자', e.target.value)} className={inp} /></div>
              <div><Lbl>출고수량(EA)</Lbl><input type="number" min="1" value={item.formData.출고수량 ?? ''} onChange={e => onChange('출고수량', e.target.value)} placeholder="수량" className={inp} /></div>
            </div>
            <div className="flex justify-end"><button onClick={onRegister} className={`px-5 py-2 rounded-xl text-sm font-bold ${tc.btn}`}>{btnLabel}</button></div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── 필터 chips ──────────────────────────────── */
function FilterChips({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  if (options.length <= 1) return null
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs text-gray-400 font-semibold shrink-0">{label}</span>
      <div className="flex gap-1.5 overflow-x-auto">
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold transition-all shrink-0 ${value === o ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── 입고 등록 폼 타입 ──────────────────────────── */
interface AddForm { 품목id: string; 고객id: string; lot_no: string; lot수량: string; 차종: string; 입고일: string; 메모: string }
const EMPTY: AddForm = { 품목id: '', 고객id: '', lot_no: '', lot수량: '', 차종: '', 입고일: new Date().toISOString().slice(0, 10), 메모: '' }

/* ─── 메인 페이지 ─────────────────────────────────── */
export default function BarcodePage() {
  const [list, setList]       = useState<바코드Type[]>([])
  const [items, setItems]     = useState<품목Type[]>([])
  const [clients, setClients] = useState<업체Type[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen]     = useState(false)
  const [saving, setSaving] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>(EMPTY)

  const [activeTab, setActiveTab] = useState<공정상태T>('입고대기')
  const [scanBuffer, setScanBuffer]   = useState<큐항목[]>([])
  const [queue, setQueue]         = useState<큐항목[]>([])
  const [processing, setProcessing] = useState(false)

  // 클로저 스테일 방지 — handleScan이 항상 최신 상태를 읽도록 ref 동기 갱신
  const scanBufferRef = useRef(scanBuffer)
  const queueRef = useRef(queue)
  scanBufferRef.current = scanBuffer
  queueRef.current = queue

  const [scan, setScan]           = useState('')
  const [scanMsg, setScanMsg]     = useState<{ ok: boolean; msg: string } | null>(null)
  const [showScanner, setShowScanner] = useState(false)

  const [clientFilter, setClientFilter]   = useState('전체')
  const [vehicleFilter, setVehicleFilter] = useState('전체')

  const fetchAll = useCallback(async () => {
    const [{ data: b }, { data: m }, { data: c }] = await Promise.all([
      supabase.from('바코드').select('*, 품목:품목id(품명,공정,차종), 업체:고객id(업체명,이니셜)').order('created_at', { ascending: false }),
      supabase.from('품목').select('*').order('품목id'),
      supabase.from('업체').select('*').order('고객id'),
    ])
    if (b) setList(b as unknown as 바코드Type[])
    if (m) setItems(m as unknown as 품목Type[])
    if (c) setClients(c as unknown as 업체Type[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('barcode')
      .on('postgres_changes', { event: '*', schema: 'public', table: '바코드' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchAll])

  useEffect(() => {
    setScanBuffer([]); setQueue([]); setScanMsg(null); setScan(''); setClientFilter('전체'); setVehicleFilter('전체')
  }, [activeTab])

  const handleScan = (code: string) => {
    const clean = code.replace(/\*/g, '').trim()
    if (!clean) return
    if (scanBufferRef.current.some(q => q.barcode === clean) || queueRef.current.some(q => q.barcode === clean)) {
      setScanMsg({ ok: false, msg: '이미 스캔된 바코드입니다.' })
      setTimeout(() => setScanMsg(null), 3000); return
    }
    const entry = list.find(b => b.바코드 === clean)
    if (!entry) {
      setScanMsg({ ok: false, msg: `등록되지 않은 바코드: ${clean}` })
      setTimeout(() => setScanMsg(null), 4000); return
    }
    if (entry.공정상태 !== activeTab) {
      setScanMsg({ ok: false, msg: `공정 불일치 — 현재: ${entry.공정상태} / 이 탭: ${activeTab}` })
      setTimeout(() => setScanMsg(null), 4000); return
    }
    const 품명 = (entry.품목 as { 품명: string } | null)?.품명 ?? entry.품목id ?? '—'
    const 업체 = (entry.업체 as { 업체명: string } | null)?.업체명 ?? entry.고객id ?? '—'
    const 차종 = entry.차종 ?? '—'
    setScanBuffer(q => [...q, { id: entry.id, barcode: clean, 품명, 업체, 차종, formData: getDefaultForm(activeTab) }])
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(80)
    setScanMsg({ ok: true, msg: `인식됨: ${품명}` })
    setScan('')
    setTimeout(() => setScanMsg(null), 3000)
  }

  const commitScans = () => {
    if (scanBuffer.length === 0) return
    setQueue(prev => {
      const existing = new Set(prev.map(p => p.barcode))
      const next = [...prev]
      for (const item of scanBuffer) {
        if (!existing.has(item.barcode)) {
          next.push(item)
          existing.add(item.barcode)
        }
      }
      return next
    })
    setScanBuffer([])
    setScanMsg({ ok: true, msg: '인식 항목이 작업 목록으로 이동되었습니다.' })
    setTimeout(() => setScanMsg(null), 2500)
  }

  // 폼 데이터 업데이트 (특정 큐 항목의 특정 키)
  const updateForm = (barcode: string, key: string, val: string) => {
    setQueue(q => q.map(item => item.barcode === barcode ? { ...item, formData: { ...item.formData, [key]: val } } : item))
  }

  // 개별 항목 등록
  const registerItem = async (item: 큐항목) => {
    const now = new Date().toISOString()
    if (activeTab === '출고완료') {
      const update: Record<string, unknown> = {}
      if (item.formData.출고일자) update['출고일자'] = item.formData.출고일자
      if (item.formData.출고수량) update['출고수량'] = Number(item.formData.출고수량)
      if (Object.keys(update).length > 0) await supabase.from('바코드').update(update).eq('id', item.id)
    } else {
      const next   = 다음상태Map[activeTab]
      const tsCol  = 타임스탬프컬럼[next]
      const dataCol = 데이터컬럼[activeTab]
      const update: Record<string, unknown> = { 공정상태: next }
      if (tsCol) update[tsCol] = now
      if (dataCol && Object.keys(item.formData).length > 0) update[dataCol] = JSON.stringify(item.formData)
      if (activeTab === '출하검사') {
        if (item.formData.출고일자) update['출고일자'] = item.formData.출고일자
        if (item.formData.출고수량) update['출고수량'] = Number(item.formData.출고수량)
      }
      await supabase.from('바코드').update(update).eq('id', item.id)
    }
    setQueue(q => q.filter(qi => qi.id !== item.id))
    fetchAll()
  }

  // 입고대기 탭 전체 일괄 처리
  const handleBatchProcess = async () => {
    if (queue.length === 0 || activeTab !== '입고대기') return
    setProcessing(true)
    const now = new Date().toISOString()
    for (const item of queue) {
      await supabase.from('바코드').update({ 공정상태: '수입검사', 수입검사일시: now }).eq('id', item.id)
    }
    setQueue([]); setProcessing(false); fetchAll()
  }

  // 입고 등록
  const filtered품목 = items.filter(i => !addForm.고객id || i.고객id === addForm.고객id)
  const onSelectItem = (품목id: string) => {
    const item = items.find(i => i.품목id === 품목id)
    setAddForm(f => ({ ...f, 품목id, 고객id: item?.고객id ?? f.고객id, 차종: item?.차종 ?? f.차종 }))
  }
  const previewBarcode = () => {
    if (!addForm.차종 || !addForm.입고일) return ''
    const nextSeq = (list.length > 0 ? Math.max(...list.map(b => b.순번)) : 0) + 1
    return generateBarcode(nextSeq, new Date(addForm.입고일), addForm.차종)
  }
  const handleAdd = async () => {
    if (!addForm.품목id || !addForm.고객id || !addForm.차종 || !addForm.입고일 || !addForm.lot수량) return
    setSaving(true)
    const 다음순번 = (list.length > 0 ? Math.max(...list.map(b => b.순번)) : 0) + 1
    const 바코드값 = generateBarcode(다음순번, new Date(addForm.입고일), addForm.차종)
    await supabase.from('바코드').insert({
      순번: 다음순번, 품목id: addForm.품목id, 고객id: addForm.고객id,
      lot_no: addForm.lot_no || null, lot수량: Number(addForm.lot수량),
      차종: addForm.차종, 입고일: addForm.입고일, 바코드: 바코드값,
      공정상태: '입고대기', 메모: addForm.메모 || null,
    })
    setSaving(false); setOpen(false); setAddForm(EMPTY); fetchAll()
  }

  const tabItems  = list.filter(b => b.공정상태 === activeTab)
  const uniqueClients  = ['전체', ...Array.from(new Set(tabItems.map(b => (b.업체 as { 업체명: string } | null)?.업체명 ?? b.고객id ?? '—')))]
  const uniqueVehicles = ['전체', ...Array.from(new Set(tabItems.filter(b => b.차종).map(b => b.차종!)))]
  const displayedItems = tabItems.filter(b => {
    const 업체명 = (b.업체 as { 업체명: string } | null)?.업체명 ?? b.고객id ?? '—'
    if (clientFilter !== '전체' && 업체명 !== clientFilter) return false
    if (vehicleFilter !== '전체' && b.차종 !== vehicleFilter) return false
    return true
  })

  const counts = Object.fromEntries(공정상태List.map(s => [s, list.filter(b => b.공정상태 === s).length]))
  const tc = 탭강조[activeTab]

  // ── 목록 테이블 컬럼 ──────────────────────────────────────
  const listCols = useMemo(() => [
    chB.accessor('순번', {
      id: '순번', header: '순번',
      cell: ({ getValue }) => <span className="font-mono font-bold text-gray-500 text-sm">{getValue()}</span>,
      meta: { headerClassName: 'w-16' },
    }),
    chB.accessor('바코드', {
      id: '바코드', header: '바코드',
      cell: ({ getValue }) => (
        <div>
          <div className="font-mono text-xs text-gray-700 tracking-widest">{getValue()}</div>
          {getValue() && <QRCodeSVG value={getValue()} size={44} level="M" className="mt-1" />}
        </div>
      ),
    }),
    chB.display({
      id: '품명',
      header: '품명',
      cell: ({ row }) => {
        const 품명 = (row.original.품목 as { 품명: string } | null)?.품명 ?? row.original.품목id ?? '—'
        return (
          <div>
            <div className="text-base font-semibold text-gray-900">{품명}</div>
            {row.original.lot_no && <div className="text-xs text-gray-400">{row.original.lot_no}</div>}
          </div>
        )
      },
    }),
    chB.display({
      id: '업체',
      header: '업체',
      cell: ({ row }) => {
        const 업체명 = (row.original.업체 as { 업체명: string } | null)?.업체명 ?? row.original.고객id ?? '—'
        return <span className="text-sm text-gray-600">{업체명}</span>
      },
    }),
    chB.accessor('차종', {
      id: '차종', header: '차종',
      cell: ({ getValue }) => (
        <span className="text-sm px-2 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{getValue() ?? '—'}</span>
      ),
    }),
    chB.accessor('lot수량', {
      id: '수량', header: '수량',
      cell: ({ getValue }) => <span className="text-sm font-semibold text-gray-900">{getValue().toLocaleString()}</span>,
      meta: { className: 'text-right', headerClassName: 'text-right' },
    }),
    chB.accessor('입고일', {
      id: '입고일', header: '입고일',
      cell: ({ getValue }) => <span className="text-sm text-gray-500">{getValue()}</span>,
    }),
    chB.accessor('공정상태', {
      id: '공정상태', header: '상태',
      cell: ({ getValue }) => (
        <span className={`text-sm px-2.5 py-1 rounded-full font-semibold ${상태색[getValue()] ?? 'bg-gray-100 text-gray-600'}`}>
          {getValue()}
        </span>
      ),
    }),
    chB.display({
      id: '처리일시',
      header: '처리일시',
      cell: ({ row }) => {
        const tsCol = 타임스탬프컬럼[row.original.공정상태]
        const ts = tsCol ? (row.original as unknown as Record<string, string>)[tsCol] : null
        return (
          <span className="text-xs text-gray-400">
            {ts ? new Date(ts).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
          </span>
        )
      },
    }),
  ], [])

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-900">바코드 · 공정관리</h2>
          <p className="text-sm text-gray-400 mt-0.5">{공정상태List.map(s => `${s} ${counts[s] ?? 0}`).join(' · ')}</p>
        </div>
        <button onClick={() => setOpen(true)} className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">+ 입고 등록</button>
      </div>

      {/* 탭 */}
      <div className="flex bg-white border-b border-gray-200 overflow-x-auto flex-shrink-0 scrollbar-none">
        {공정상태List.map(s => {
          const isActive = activeTab === s
          return (
            <button key={s} onClick={() => setActiveTab(s as 공정상태T)}
              className={`relative px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 flex-shrink-0
                ${isActive ? `${탭강조[s].tab} border-current` : 'text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-300'}`}>
              {s}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-current/10' : 'bg-gray-100 text-gray-400'}`}>{counts[s] ?? 0}</span>
            </button>
          )
        })}
      </div>

      {/* 스캔 영역 */}
      <div className={`px-4 md:px-6 py-3 border-b border-gray-200 flex-shrink-0 ${tc.scan}`}>
        <div className="flex gap-2 mb-2">
          <button onClick={() => setShowScanner(true)} className={`px-4 py-2 text-sm font-semibold rounded-xl flex items-center gap-1.5 shrink-0 ${tc.btn}`}>카메라</button>
          <input value={scan} onChange={e => setScan(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleScan(scan) }}
            placeholder="바코드 직접 입력 후 Enter"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white min-w-0" />
          <button onClick={() => handleScan(scan)} className={`px-4 py-2 text-sm font-semibold rounded-xl shrink-0 ${tc.btn}`}>추가</button>
        </div>
        {scanMsg && (
          <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg mb-2 ${scanMsg.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{scanMsg.msg}</div>
        )}

        {scanBuffer.length > 0 && (
          <div className="mb-2 rounded-xl border border-dashed border-green-300 bg-white px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-bold text-green-700">인식 항목 ({scanBuffer.length}건)</p>
              <button onClick={commitScans} className={`px-3 py-1.5 text-xs font-bold rounded-lg ${tc.btn}`}>인식 완료</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {scanBuffer.map(item => (
                <span key={item.barcode} className="text-xs px-2 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 font-semibold inline-flex items-center gap-1">
                  {item.품명}
                  <button onClick={() => setScanBuffer(q => q.filter(x => x.barcode !== item.barcode))} className="font-black leading-none text-green-700 hover:text-red-500">x</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 스캔 큐 — 항목별 카드 */}
        {queue.length > 0 && (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold text-gray-500">스캔 목록 ({queue.length}건)</p>
              {activeTab === '입고대기' && (
                <button onClick={handleBatchProcess} disabled={processing}
                  className={`px-4 py-1.5 text-sm font-bold rounded-lg ${tc.btn} disabled:opacity-50`}>
                  {processing ? '처리 중...' : `전체 입고완료 (${queue.length}건)`}
                </button>
              )}
            </div>
            {queue.map((item, idx) => (
              <QueueCard
                key={item.id}
                tab={activeTab}
                item={item}
                idx={idx}
                onChange={(key, val) => updateForm(item.barcode, key, val)}
                onRegister={() => registerItem(item)}
                onRemove={() => setQueue(q => q.filter(qi => qi.id !== item.id))}
              />
            ))}
          </div>
        )}
      </div>

      {/* 목록 필터 */}
      <div className="flex flex-col gap-1.5 px-4 md:px-6 py-2 bg-white border-b border-gray-100 flex-shrink-0">
        <FilterChips label="고객사" options={uniqueClients} value={clientFilter} onChange={setClientFilter} />
        <FilterChips label="차종" options={uniqueVehicles} value={vehicleFilter} onChange={setVehicleFilter} />
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="w-7 h-7 border-b-2 border-gray-300 rounded-full animate-spin mr-3" />불러오는 중...
          </div>
        ) : (
          <>
            {/* 데스크탑 DataTable */}
            <div className="hidden md:block p-5">
              <DataTable
                data={displayedItems}
                columns={listCols as any}
                defaultSorting={[{ id:'순번', desc:true }]}
                groupByOptions={[
                  { id:'업체', label:'업체' },
                  { id:'차종', label:'차종' },
                  { id:'공정상태', label:'상태' },
                ]}
                emptyMessage={`${activeTab} 항목이 없습니다`}
              />
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden p-3 space-y-2 pb-4">
              {displayedItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <p className="text-sm font-semibold text-gray-500 mb-3">{activeTab} 항목이 없습니다</p>
                </div>
              ) : displayedItems.map(b => {
                const 품명  = (b.품목 as { 품명: string } | null)?.품명 ?? b.품목id ?? '—'
                const 업체명 = (b.업체 as { 업체명: string } | null)?.업체명 ?? b.고객id ?? '—'
                const tsCol = 타임스탬프컬럼[b.공정상태]
                const ts = tsCol ? (b as unknown as Record<string, string>)[tsCol] : null
                return (
                  <div key={b.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-base font-bold text-gray-900 truncate">{품명}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{업체명} · {b.차종 ?? '—'} · {b.lot수량}EA</div>
                        <div className="font-mono text-xs text-gray-500 mt-1 tracking-widest">{b.바코드}</div>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-semibold ${상태색[b.공정상태] ?? 'bg-gray-100 text-gray-600'}`}>{b.공정상태}</span>
                    </div>
                    {ts && <div className="mt-2 text-xs text-gray-400">처리: {new Date(ts).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</div>}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {showScanner && (
        <CameraScanner
          onScan={(code) => { handleScan(code) }}
          onClose={() => { setScanBuffer([]); setShowScanner(false) }}
          recognized={scanBuffer.map(({ barcode, 품명 }) => ({ barcode, 품명 }))}
          onCommitRecognized={() => { commitScans(); setShowScanner(false) }}
          scanFeedback={scanMsg}
        />
      )}

      {/* 입고 등록 모달 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative bg-white w-full md:w-[460px] rounded-t-2xl md:rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 mb-5">입고 등록 (바코드 생성)</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">고객사 *</label>
                  <select value={addForm.고객id} onChange={e => setAddForm(f => ({ ...f, 고객id: e.target.value, 품목id: '' }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="">— 선택 —</option>
                    {clients.filter(c => c.구분.includes('고객')).map(c => (<option key={c.고객id} value={c.고객id}>{c.업체명}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">품목 *</label>
                  <select value={addForm.품목id} onChange={e => onSelectItem(e.target.value)} disabled={!addForm.고객id}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-50">
                    <option value="">— 선택 —</option>
                    {filtered품목.map(i => (<option key={i.품목id} value={i.품목id}>{i.품명} [{i.공정}]</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">차종 *</label>
                  <select value={addForm.차종} onChange={e => setAddForm(f => ({ ...f, 차종: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                    <option value="">— 선택 —</option>
                    {차종목록.map(c => (<option key={c} value={c}>{c} ({차종코드Map[c]})</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">입고일 *</label>
                  <input type="date" value={addForm.입고일} onChange={e => setAddForm(f => ({ ...f, 입고일: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">LOT 수량 *</label>
                  <input type="number" min="1" value={addForm.lot수량} placeholder="수량" onChange={e => setAddForm(f => ({ ...f, lot수량: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">LOT No.</label>
                  <input type="text" value={addForm.lot_no} placeholder="LOT 번호" onChange={e => setAddForm(f => ({ ...f, lot_no: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">메모</label>
                <input type="text" value={addForm.메모} placeholder="특이사항" onChange={e => setAddForm(f => ({ ...f, 메모: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
              {addForm.차종 && addForm.입고일 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-400 mb-1">생성될 바코드</p>
                  <p className="font-mono text-xl font-bold text-gray-900 tracking-widest">{previewBarcode()}</p>
                  <div className="flex justify-center mt-2"><QRCodeSVG value={previewBarcode() || '0'} size={80} level="M" /></div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setOpen(false)} className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50">취소</button>
              <button onClick={handleAdd} disabled={saving || !addForm.품목id || !addForm.고객id || !addForm.차종 || !addForm.입고일 || !addForm.lot수량}
                className="flex-1 bg-green-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-40">
                {saving ? '저장 중...' : '입고 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
