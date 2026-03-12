// EF MES Service Worker
const CACHE_VERSION = 'v1'
const STATIC_CACHE = `ef-mes-static-${CACHE_VERSION}`
const DYNAMIC_CACHE = `ef-mes-dynamic-${CACHE_VERSION}`
const ALL_CACHES = [STATIC_CACHE, DYNAMIC_CACHE]

// Next.js 정적 에셋 경로 패턴 (버전 해시 포함, 변경 불변)
const STATIC_PATTERNS = [
  /\/_next\/static\//,
  /\/icons\//,
  /\/logo/,
  /\.png$/,
  /\.ico$/,
]

// 절대 캐시하면 안 되는 패턴 (Supabase 실시간, API 호출)
const NO_CACHE_PATTERNS = [
  /supabase\.co/,
  /realtime/,
  /\/api\//,
]

// 앱 페이지 목록 (설치 시 사전 캐싱)
const PRECACHE_PAGES = [
  '/',
  '/plan',
  '/workorder',
  '/barcode',
  '/inventory',
  '/master',
  '/gantt',
  '/manifest.json',
]

// ── Install ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        // 오류가 있어도 설치 계속 진행
        return Promise.allSettled(
          PRECACHE_PAGES.map(url =>
            fetch(url, { credentials: 'same-origin' })
              .then(res => res.ok ? cache.put(url, res) : null)
              .catch(() => null)
          )
        )
      })
      .then(() => self.skipWaiting())
  )
})

// ── Activate ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !ALL_CACHES.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // GET 요청만 처리
  if (request.method !== 'GET') return

  // 캐시 제외 패턴 (Supabase 등 외부 API)
  if (NO_CACHE_PATTERNS.some(p => p.test(request.url))) return

  // /_next/static/ → cache-first (불변 에셋, 해시 포함)
  if (STATIC_PATTERNS.some(p => p.test(url.pathname))) {
    event.respondWith(cacheFirst(request))
    return
  }

  // 페이지 네비게이션 → network-first (최신 내용 우선, 오프라인 시 캐시 제공)
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithCache(request))
    return
  }
})

// ── 전략 함수 ─────────────────────────────────────────

// Cache-First: 캐시에 있으면 캐시 반환, 없으면 네트워크 후 캐시 저장
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (e) {
    return new Response('오프라인 상태입니다.', { status: 503 })
  }
}

// Network-First: 네트워크 시도 → 실패 시 캐시 제공
async function networkFirstWithCache(request) {
  const cache = await caches.open(DYNAMIC_CACHE)

  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (e) {
    // 오프라인: 캐시된 페이지 반환
    const cached = await caches.match(request)
    if (cached) return cached

    // 캐시도 없으면 루트 캐시 시도
    const root = await caches.match('/')
    if (root) return root

    // 최후 수단: 간단한 오프라인 안내
    return new Response(
      `<!DOCTYPE html><html lang="ko"><head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>EF MES - 오프라인</title>
        <style>
          body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
                 justify-content: center; min-height: 100svh; margin: 0; background: #f9fafb; }
          .card { text-align: center; padding: 2rem; }
          h1 { font-size: 1.25rem; font-weight: 700; color: #111; margin-bottom: 0.5rem; }
          p { color: #6b7280; font-size: 0.875rem; }
          button { margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #16a34a;
                   color: white; border: none; border-radius: 0.75rem; font-size: 0.875rem;
                   font-weight: 600; cursor: pointer; }
        </style>
      </head><body>
        <div class="card">
          <div style="font-size:3rem;margin-bottom:1rem">📡</div>
          <h1>인터넷 연결이 필요합니다</h1>
          <p>EF MES는 실시간 데이터를 사용합니다.<br>네트워크 연결 후 다시 시도해 주세요.</p>
          <button onclick="location.reload()">다시 시도</button>
        </div>
      </body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
}
