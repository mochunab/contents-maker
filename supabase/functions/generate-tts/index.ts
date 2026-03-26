// Supabase Edge Function: ElevenLabs TTS 음성 생성 (OpenAI 폴백)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../server/cors.ts'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'

// ElevenLabs 한국어 추천 음성 (Voice Library에서 선별)
const ELEVENLABS_VOICES: Record<string, string> = {
  aria: '9BWtsMINqrJLrRacOk9x',    // Aria — 차분하고 자연스러운 여성
  roger: 'CwhRBWXzGAHq8TQ4Fs17',   // Roger — 신뢰감 있는 남성
  sarah: 'EXAVITQu4vr4xnSDxMaL',   // Sarah — 부드럽고 따뜻한 여성
  charlie: 'IKne3meq5aSn9XLyUdCD',  // Charlie — 또렷한 남성
  laura: 'FGY2WhTYpPnrIDTdsKH5',   // Laura — 밝고 명랑한 여성
}
const DEFAULT_VOICE_ID = ELEVENLABS_VOICES.aria

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  const corsHeaders = getCorsHeaders(req)
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  try {
    const { text, voice, speed } = await req.json()

    if (!text?.trim()) {
      return new Response(JSON.stringify({ error: '텍스트를 입력해주세요' }), {
        status: 400, headers: jsonHeaders,
      })
    }

    // 문장 간 자연스러운 쉼(pause) 삽입 — 줄바꿈이 ElevenLabs에서 가장 긴 쉼을 만듦
    const processedText = text.trim()
      .replace(/\. /g, '.\n\n')      // 마침표 → 긴 쉼 (줄바꿈)
      .replace(/\? /g, '?\n\n')      // 물음표 → 긴 쉼
      .replace(/! /g, '!\n\n')       // 느낌표 → 긴 쉼
      .replace(/, /g, ',... ')

    // ElevenLabs 우선, 실패 시 OpenAI 폴백
    const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY')

    if (elevenLabsKey) {
      try {
        const voiceId = ELEVENLABS_VOICES[voice || ''] || DEFAULT_VOICE_ID
        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': elevenLabsKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: processedText,
              model_id: 'eleven_turbo_v2_5',
              voice_settings: {
                stability: 0.65,
                similarity_boost: 0.75,
                style: 0.2,
                use_speaker_boost: true,
              },
            }),
          }
        )

        if (ttsRes.ok) {
          const audioBuffer = await ttsRes.arrayBuffer()
          const audioBase64 = base64Encode(new Uint8Array(audioBuffer))
          console.log(`[generate-tts] ElevenLabs OK: voice=${voice || 'aria'}, ${audioBuffer.byteLength} bytes`)

          return new Response(JSON.stringify({
            audio: `data:audio/mp3;base64,${audioBase64}`,
          }), { headers: jsonHeaders })
        }

        // ElevenLabs 실패 시 폴백
        const errText = await ttsRes.text()
        console.warn(`[generate-tts] ElevenLabs failed (${ttsRes.status}), falling back to OpenAI:`, errText.slice(0, 200))
      } catch (elErr) {
        console.warn('[generate-tts] ElevenLabs error, falling back to OpenAI:', (elErr as Error).message)
      }
    }

    // OpenAI 폴백
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: 'TTS API 키가 설정되지 않았습니다' }), {
        status: 500, headers: jsonHeaders,
      })
    }

    const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: processedText,
        voice: 'nova',
        response_format: 'mp3',
        speed: speed || 1.0,
      }),
    })

    if (!ttsRes.ok) {
      const errText = await ttsRes.text()
      console.error('[generate-tts] OpenAI TTS error:', errText)
      return new Response(JSON.stringify({ error: `TTS API 오류: ${ttsRes.status}` }), {
        status: 502, headers: jsonHeaders,
      })
    }

    const audioBuffer = await ttsRes.arrayBuffer()
    const audioBase64 = base64Encode(new Uint8Array(audioBuffer))
    console.log(`[generate-tts] OpenAI fallback OK: ${audioBuffer.byteLength} bytes`)

    return new Response(JSON.stringify({
      audio: `data:audio/mp3;base64,${audioBase64}`,
    }), { headers: jsonHeaders })
  } catch (err) {
    console.error('[generate-tts] Error:', err)
    return new Response(JSON.stringify({ error: `TTS 생성 실패: ${(err as Error).message}` }), {
      status: 500, headers: jsonHeaders,
    })
  }
})
