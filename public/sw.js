// EF MES Service Worker
const CACHE_VERSION = 'v2'
const STATIC_CACHE = `ef-mes-static-${CACHE_VERSION}`
const ALL_CACHES = [STATIC_CACHE]

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

// 최소한의 정적 리소스만 선캐시한다.
const PRECACHE_URLS = ['/manifest.json']

// ── Install ───────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
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

  // HTML 페이지는 캐시하지 않는다. 배포 후 오래된 앱 셸이 남으면 무한 로딩으로 보일 수 있다.
  if (request.mode === 'navigate') return

  // /_next/static/ → cache-first (불변 에셋, 해시 포함)
  if (STATIC_PATTERNS.some(p => p.test(url.pathname))) {
    event.respondWith(cacheFirst(request))
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
