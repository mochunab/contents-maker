// Supabase Edge Function: 범용 썸네일 이미지 생성 (Gemini Image Generation)
// 레퍼런스 이미지 + 명령어 → 썸네일 이미지 (base64 PNG)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../server/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const { prompt, reference_image, reference_mode, aspect_ratio } = await req.json()

    if (!prompt?.trim()) {
      return new Response(JSON.stringify({ error: 'prompt 필수' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GOOGLE_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const parts: Array<Record<string, unknown>> = []

    if (reference_image) {
      // 레퍼런스 이미지 첨부
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: reference_image,
        },
      })

      // reference_mode에 따라 프롬프트 분기
      const imageRules = `[MANDATORY OUTPUT RULES — VIOLATION = FAILURE]
• OUTPUT EXACTLY ONE SINGLE PHOTO. The entire canvas is ONE continuous photograph of ONE scene with ONE subject/person.
• ABSOLUTELY FORBIDDEN: collage, grid, triptych, diptych, split-screen, side-by-side, multi-panel, montage, photo strip, before/after, multiple poses of the same person, or any form of image subdivision.
• ABSOLUTELY FORBIDDEN: any text, letters, words, numbers, titles, labels, watermarks, captions, or typography.
• If the instruction mentions multiple outfits/styles/variations, pick ONLY ONE and show it as a single full photo.

`

      if (reference_mode === 'style_and_character') {
        parts.push({
          text: `${imageRules}Use the attached image as a CHARACTER reference. Keep the SAME person's face, facial features, hairstyle, and identity — they must be clearly recognizable as the same person. However, freely change their clothing, outfit, pose, background, setting, and environment to match the instruction. The person's face is the ONLY thing that must stay consistent. Generate a NEW single image based on this instruction: ${prompt}`,
        })
      } else {
        // style_only (기본값)
        parts.push({
          text: `${imageRules}Use the attached image as a STYLE reference only. Copy the visual style (colors, lighting, composition, typography style, art style) but create completely new content. Do NOT copy specific characters or people. Generate a NEW single thumbnail image based on this instruction: ${prompt}`,
        })
      }
    } else {
      const imageRules = `[MANDATORY OUTPUT RULES — VIOLATION = FAILURE]
• OUTPUT EXACTLY ONE SINGLE PHOTO. The entire canvas is ONE continuous photograph of ONE scene with ONE subject/person.
• ABSOLUTELY FORBIDDEN: collage, grid, triptych, diptych, split-screen, side-by-side, multi-panel, montage, photo strip, before/after, multiple poses of the same person, or any form of image subdivision.
• ABSOLUTELY FORBIDDEN: any text, letters, words, numbers, titles, labels, watermarks, captions, or typography.
• If the instruction mentions multiple outfits/styles/variations, pick ONLY ONE and show it as a single full photo.

`
      parts.push({
        text: `${imageRules}Generate a professional thumbnail image. ${prompt}`,
      })
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    }

    const requestBody = JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: aspect_ratio || '16:9',
        },
      },
    })

    let geminiRes: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      geminiRes = await fetch(url, { method: 'POST', headers, body: requestBody })
      if (geminiRes.status !== 429) break
      const wait = (attempt + 1) * 10
      console.log(`[generate-thumbnail-image] 429 retry ${attempt + 1}/3, waiting ${wait}s...`)
      await new Promise(r => setTimeout(r, wait * 1000))
    }

    if (!geminiRes || !geminiRes.ok) {
      const errText = geminiRes ? await geminiRes.text() : 'No response'
      console.error('[generate-thumbnail-image] Gemini error:', geminiRes?.status, errText.slice(0, 300))
      return new Response(JSON.stringify({ error: `이미지 생성 실패: ${geminiRes?.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let data = await geminiRes.json()
    let responseParts = data?.candidates?.[0]?.content?.parts

    // 안전 필터 차단 시 1회 재시도 (프롬프트 완화)
    if (!responseParts) {
      const blockReason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'unknown'
      console.warn(`[generate-thumbnail-image] Empty response, blockReason: ${blockReason}. Retrying...`)

      // 재시도: 프롬프트 간소화
      const retryParts: Array<Record<string, unknown>> = []
      if (reference_image) {
        retryParts.push({ inlineData: { mimeType: 'image/png', data: reference_image } })
      }
      retryParts.push({ text: prompt })

      const retryBody = JSON.stringify({
        contents: [{ parts: retryParts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: aspect_ratio || '16:9' },
        },
      })

      const retryRes = await fetch(url, { method: 'POST', headers, body: retryBody })
      if (retryRes.ok) {
        data = await retryRes.json()
        responseParts = data?.candidates?.[0]?.content?.parts
      }
    }

    if (!responseParts) {
      const blockReason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || 'unknown'
      console.error(`[generate-thumbnail-image] Final empty response. blockReason: ${blockReason}`)
      return new Response(JSON.stringify({ error: `이미지 생성 실패: ${blockReason}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let imageBase64 = null
    let mimeType = 'image/png'

    for (const part of responseParts) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data
        mimeType = part.inlineData.mimeType || 'image/png'
        break
      }
    }

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: '이미지 데이터가 없습니다' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ image: imageBase64, mimeType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[generate-thumbnail-image] Error:', err)
    return new Response(JSON.stringify({ error: `이미지 생성 실패: ${(err as Error).message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
