// Supabase Edge Function: Unsplash / Pexels 이미지 검색 프록시
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../server/cors.ts'

const ORIENTATION_MAP: Record<string, string> = {
  landscape: 'landscape',
  portrait: 'portrait',
  squarish: 'square',
}

async function fetchFromPexels(query: string, page: string, orientation: string) {
  const apiKey = Deno.env.get('PEXELS_API_KEY')
  if (!apiKey) return null

  const params = new URLSearchParams({
    query,
    page,
    per_page: '1',
    orientation: ORIENTATION_MAP[orientation] || 'square',
  })

  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: apiKey },
  })

  if (!res.ok) {
    console.error('[pexels] Error:', res.status)
    return null
  }

  const data = await res.json()
  const photo = data.photos?.[0]
  if (!photo) return null

  return {
    id: `pexels-${photo.id}`,
    url: photo.src.large2x,
    thumb: photo.src.small,
    photographer: photo.photographer,
    photographer_url: photo.photographer_url,
    unsplash_url: photo.url,
    color: photo.avg_color,
    source: 'pexels' as const,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const url = new URL(req.url)
    const query = url.searchParams.get('query')
    const page = url.searchParams.get('page') || '1'
    const orientation = url.searchParams.get('orientation') || 'squarish'

    if (!query) {
      return new Response(JSON.stringify({ error: 'query 필수' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1차: Unsplash
    const accessKey = Deno.env.get('UNSPLASH_ACCESS_KEY')
    if (accessKey) {
      const params = new URLSearchParams({
        query,
        page,
        per_page: '1',
        orientation,
      })

      const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
        headers: { Authorization: `Client-ID ${accessKey}` },
      })

      if (res.ok) {
        const data = await res.json()
        const photo = data.results?.[0]

        if (photo) {
          // Unsplash download tracking (required by API terms)
          fetch(`https://api.unsplash.com/photos/${photo.id}/download`, {
            headers: { Authorization: `Client-ID ${accessKey}` },
          }).catch(() => {})

          return new Response(JSON.stringify({
            id: photo.id,
            url: photo.urls.regular,
            thumb: photo.urls.thumb,
            photographer: photo.user.name,
            photographer_url: photo.user.links.html,
            unsplash_url: photo.links.html,
            color: photo.color,
            source: 'unsplash',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } else {
        console.error('[unsplash] Error:', res.status, '→ Pexels fallback')
      }
    }

    // 2차: Pexels fallback
    const pexelsResult = await fetchFromPexels(query, page, orientation)
    if (pexelsResult) {
      return new Response(JSON.stringify(pexelsResult), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: '검색 결과 없음', query }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[search-stock-image] Error:', err)

    // 에러 시에도 Pexels 시도
    try {
      const url = new URL(req.url)
      const query = url.searchParams.get('query') || ''
      const page = url.searchParams.get('page') || '1'
      const orientation = url.searchParams.get('orientation') || 'squarish'
      const pexelsResult = await fetchFromPexels(query, page, orientation)
      if (pexelsResult) {
        return new Response(JSON.stringify(pexelsResult), {
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        })
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: `이미지 검색 실패: ${(err as Error).message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
