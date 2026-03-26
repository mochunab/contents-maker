// Supabase Edge Function: Replicate Image-to-Video (씬별 AI 영상 생성)
// submit → prediction id 반환, poll → 상태/결과 반환
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../server/cors.ts'

// Replicate 모델별 설정
const MODELS: Record<string, { owner: string; name: string; imageField: string; extraInput?: Record<string, unknown> }> = {
  kling: {
    owner: 'kwaivgi',
    name: 'kling-v2.1',
    imageField: 'start_image_url',
    extraInput: { duration: 5, aspect_ratio: '9:16' },
  },
  hailuo: {
    owner: 'minimax',
    name: 'hailuo-2.3-fast',
    imageField: 'image_url',
    extraInput: { duration: 6 },
  },
  wan: {
    owner: 'wan-video',
    name: 'wan-2.5-i2v',
    imageField: 'image',
    extraInput: { aspect_ratio: '9:16', max_area: '720p' },
  },
}

const REPLICATE_API = 'https://api.replicate.com/v1'

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest(req)

  const corsHeaders = getCorsHeaders(req)
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const body = await req.json()
    const { action, model } = body

    const apiToken = Deno.env.get('REPLICATE_API_TOKEN')
    if (!apiToken) {
      return new Response(JSON.stringify({ error: 'REPLICATE_API_TOKEN not configured' }), {
        status: 500, headers: jsonHeaders,
      })
    }

    const authHeaders = {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    }

    const modelConfig = MODELS[model || 'wan'] || MODELS.wan

    // ── Submit: 이미지 → Replicate prediction 생성 ──
    if (action === 'submit') {
      const { image_data_url, motion_style } = body

      if (!image_data_url) {
        return new Response(JSON.stringify({ error: 'image_data_url 필수' }), {
          status: 400, headers: jsonHeaders,
        })
      }

      // 카메라 모션만 지시 — 새로운 객체/텍스트/사람 생성 금지
      const cameraOnly: Record<string, string> = {
        zoom_impact: 'Slow cinematic zoom-in toward center',
        wave: 'Gentle horizontal pan from left to right',
        radial_burst: 'Slow zoom-out from center',
        glitch: 'Subtle camera shake',
        spotlight: 'Slow push-in with slight focus shift',
        parallax_layers: 'Gentle parallax drift with depth separation',
        counter: 'Steady slow push-in',
        split_compare: 'Slow horizontal pan',
        confetti_burst: 'Gentle upward tilt',
        sparkle_trail: 'Slow arc camera sweep',
        pulse_ring: 'Subtle breathing zoom pulse',
      }

      const cameraMotion = cameraOnly[motion_style || ''] || 'Slow gentle zoom-in with subtle camera drift'
      const finalPrompt = `${cameraMotion}. Camera movement only. Keep the original image exactly as-is. Do NOT add any new objects, people, hands, fingers, text, letters, words, icons, UI elements, watermarks, or any visual elements that are not already in the image. Only apply smooth cinematic camera motion to the existing scene.`

      const input: Record<string, unknown> = {
        prompt: finalPrompt,
        [modelConfig.imageField]: image_data_url,
        ...modelConfig.extraInput,
      }

      console.log(`[generate-scene-video] Submitting to ${modelConfig.owner}/${modelConfig.name}`)

      // 429 재시도 (최대 3회, retry_after 대기)
      let res: Response | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${REPLICATE_API}/models/${modelConfig.owner}/${modelConfig.name}/predictions`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ input }),
        })

        if (res.status === 429) {
          const errBody = await res.text()
          const retryMatch = errBody.match(/"retry_after":\s*(\d+)/)
          const waitSec = retryMatch ? parseInt(retryMatch[1], 10) : 12
          console.warn(`[generate-scene-video] 429 rate limited, retrying in ${waitSec}s (attempt ${attempt + 1}/3)`)
          await new Promise(r => setTimeout(r, waitSec * 1000))
          continue
        }
        break
      }

      if (!res!.ok) {
        const errText = await res!.text()
        console.error(`[generate-scene-video] Submit error: ${res!.status}`, errText.slice(0, 300))
        const isAuthError = res!.status === 401 || res!.status === 403
        const isRateLimit = res!.status === 429
        return new Response(JSON.stringify({
          error: isAuthError
            ? 'Replicate API 인증 실패 (토큰 만료 또는 무효)'
            : isRateLimit
            ? 'Replicate 요청 한도 초과. 잠시 후 다시 시도해주세요.'
            : `Replicate 제출 실패: ${res!.status}`,
          code: isAuthError ? 'AUTH_ERROR' : isRateLimit ? 'RATE_LIMIT' : 'API_ERROR',
        }), {
          status: isAuthError ? 401 : isRateLimit ? 429 : 502, headers: jsonHeaders,
        })
      }

      const data = await res.json()
      console.log(`[generate-scene-video] Submitted: id=${data.id}, status=${data.status}`)

      return new Response(JSON.stringify({
        request_id: data.id,
      }), { headers: jsonHeaders })
    }

    // ── Poll: 상태 확인, succeeded 시 video_url 반환 ──
    if (action === 'poll') {
      const { request_id } = body

      if (!request_id) {
        return new Response(JSON.stringify({ error: 'request_id 필수' }), {
          status: 400, headers: jsonHeaders,
        })
      }

      const res = await fetch(`${REPLICATE_API}/predictions/${request_id}`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`[generate-scene-video] Poll error: ${res.status}`, errText.slice(0, 200))
        return new Response(JSON.stringify({ error: `상태 확인 실패: ${res.status}` }), {
          status: 502, headers: jsonHeaders,
        })
      }

      const data = await res.json()

      if (data.status === 'succeeded') {
        // Replicate 출력: output이 URL string 또는 { video: url } 등 모델마다 다름
        let videoUrl: string | null = null
        if (typeof data.output === 'string') {
          videoUrl = data.output
        } else if (Array.isArray(data.output) && data.output.length > 0) {
          videoUrl = data.output[0]
        } else if (data.output?.video) {
          videoUrl = data.output.video
        }

        console.log(`[generate-scene-video] Succeeded: ${request_id}, video_url=${videoUrl ? 'yes' : 'no'}`)

        return new Response(JSON.stringify({
          status: 'COMPLETED',
          video_url: videoUrl,
        }), { headers: jsonHeaders })
      }

      if (data.status === 'failed' || data.status === 'canceled') {
        console.error(`[generate-scene-video] Failed: ${request_id}`, data.error)
        return new Response(JSON.stringify({
          status: 'FAILED',
          error: data.error || '영상 생성 실패',
        }), { headers: jsonHeaders })
      }

      // starting or processing
      return new Response(JSON.stringify({
        status: data.status === 'starting' ? 'IN_QUEUE' : 'IN_PROGRESS',
      }), { headers: jsonHeaders })
    }

    return new Response(JSON.stringify({ error: 'action은 "submit" 또는 "poll"이어야 합니다' }), {
      status: 400, headers: jsonHeaders,
    })

  } catch (err) {
    console.error('[generate-scene-video] Error:', err)
    return new Response(JSON.stringify({ error: `영상 생성 오류: ${(err as Error).message}` }), {
      status: 500, headers: jsonHeaders,
    })
  }
})
