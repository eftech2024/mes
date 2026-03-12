'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import jsQR from 'jsqr'

// Audio: iOS PWA compatible — singleton AudioContext
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

export function playBeep(ok: boolean) {
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

export interface RecognizedItem {
  barcode: string
  label: string
}

export interface CameraScannerProps {
  onScan: (code: string) => void
  onClose: () => void
  recognized: RecognizedItem[]
  onCommitRecognized: () => void
  scanFeedback: { ok: boolean; msg: string } | null
}

export function CameraScanner({
  onScan,
  onClose,
  recognized,
  onCommitRecognized,
  scanFeedback,
}: CameraScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const fileRef     = useRef<HTMLInputElement>(null)
  const scannedRef  = useRef<Set<string>>(new Set())
  const detectTmr   = useRef<number>(0)
  const fbRef       = useRef(scanFeedback)
  const onScanRef   = useRef(onScan)

  const [mode, setMode]     = useState<'loading' | 'active' | 'error'>('loading')
  const [errMsg, setErrMsg] = useState('')

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
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.closePath()
        const [r, g, b] = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)]
        ctx.fillStyle = `rgba(${r},${g},${b},0.12)`
        ctx.fill()
        ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke()
        for (const p of pts) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
        }
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

  useEffect(() => {
    let cancelled = false
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

        const track = stream.getVideoTracks()[0]
        try {
          const caps = track.getCapabilities?.() as Record<string, unknown>
          if (Array.isArray(caps?.focusMode) && (caps.focusMode as string[]).includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet] })
          }
        } catch {}

        const v = videoRef.current!
        v.srcObject = stream
        await new Promise<void>(resolve => {
          const h = () => { v.removeEventListener('loadeddata', h); resolve() }
          v.addEventListener('loadeddata', h)
          v.play().catch(() => resolve())
        })
        if (cancelled) return
        setMode('active')

        type NativeDetector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string; cornerPoints?: { x: number; y: number }[] }[]> }
        let nativeDet: NativeDetector | null = null
        const BD = (window as unknown as Record<string, unknown>).BarcodeDetector as (new (o: { formats: string[] }) => NativeDetector) | undefined
        if (BD) { try { nativeDet = new BD({ formats: ['qr_code'] }) } catch {} }

        const detect = async () => {
          if (cancelled) return
          const vid = videoRef.current
          if (!vid || vid.readyState < 2) { detectTmr.current = window.setTimeout(detect, 200); return }

          let results: ScanResult[] = []

          if (nativeDet) {
            try {
              const codes = await nativeDet.detect(vid)
              results = codes.filter(c => c.rawValue).map(c => ({
                text: c.rawValue.replace(/\*/g, '').trim(),
                corners: (c.cornerPoints || []).map(p => ({ x: p.x, y: p.y })),
              }))
            } catch {}
          }

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

          drawAR(results)

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
      <video ref={videoRef} playsInline muted autoPlay
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      <canvas ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10000, display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
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

        {/* Center */}
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

        {/* Bottom panel */}
        <div style={{ pointerEvents: 'auto', background: 'linear-gradient(to top,rgba(0,0,0,0.85),rgba(0,0,0,0.4),transparent)', padding: '20px 16px 34px' }}>
          {scanFeedback && (
            <div style={{ margin: '0 0 12px', padding: '11px 16px', borderRadius: '14px', fontSize: '15px', fontWeight: 700, textAlign: 'center', background: scanFeedback.ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)', color: scanFeedback.ok ? '#86efac' : '#fca5a5', border: `1px solid ${scanFeedback.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` }}>
              {scanFeedback.msg}
            </div>
          )}
          {recognized.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', borderRadius: '16px', padding: '14px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.15)' }}>
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
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#86efac', marginLeft: '8px' }}>{r.label}</span>
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
