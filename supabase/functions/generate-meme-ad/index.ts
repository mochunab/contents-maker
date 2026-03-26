// Supabase Edge Function: AI 밈광고 대본 생성 (Gemini 2.5 Flash)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../server/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const { brandInfo, adDuration, hookDuration, revision, videoType } = await req.json() as {
      brandInfo: string;
      adDuration?: number;
      hookDuration?: number;
      revision?: { currentScript: string; request: string };
      videoType?: string;
    }

    if (!brandInfo?.trim()) {
      return new Response(JSON.stringify({ error: '브랜드/제품 정보를 입력해주세요' }), {
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

    const dur = adDuration || 15
    const hookDur = hookDuration || 3

    const totalDuration = hookDur + dur

    const isRevision = revision && revision.currentScript && revision.request

    const prompt = `당신은 밈 광고 영상 대본 전문 작가입니다.
${isRevision ? `
★★★ [수정 모드] ★★★
아래는 기존 대본입니다. 사용자의 수정 요청에 따라 해당 부분만 정확히 수정하고, 나머지는 그대로 유지하세요.
전체 길이(${dur}초)와 씬 수를 반드시 유지하세요.

기존 대본:
${revision.currentScript}

사용자 수정 요청: "${revision.request}"

위 수정 요청을 반영한 수정된 대본을 동일한 JSON 형식으로 반환하세요.
` : ''}
★ 핵심 컨셉:
이 영상은 "밈 후크 + 브랜드 광고" 구조입니다.
- 앞부분 (${hookDur}초): 사용자가 직접 업로드한 재밌는/충격적인 밈 영상 클립
- 뒷부분 (${dur}초): 당신이 작성할 브랜드 광고 대본 ← 이것만 작성

밈 클립이 시선을 잡은 직후 바로 광고가 나오므로, 첫 씬의 자연스러운 연결이 매우 중요합니다.

브랜드/제품 정보: "${brandInfo}"
형식: 세로 9:16 숏폼 바이럴 광고 (릴스/쇼츠/틱톡 공용)
광고 부분 길이: ${dur}초
전체 영상 길이: ${totalDuration}초 (밈 ${hookDur}초 + 광고 ${dur}초)

다음 JSON 형식으로 광고 대본을 작성해주세요:

{
  "title": "영상 제목 (30자 이내)",
  "hook": "밈에서 광고로 넘어가는 연결 멘트 (한 문장)",
  "total_duration": ${dur},
  "ad_duration": ${dur},
  "scenes": [
    {
      "scene_number": 1,
      "duration": 3,
      "type": "intro",
      "narration": "나레이션 텍스트 (duration × 6자 기준. 3초면 약 18자)",
      "subtitle": "화면 자막 (**강조**)",
      "visual": "화면 설명",
      "transition": "fade",
      "motion_style": "zoom_impact",
      "layout": "center",
      "icon": "🔥"${videoType === 'motion' ? `,
      "accent_color": "#FF6B6B",
      "glow_color": "#FF4040"` : ''}
    }
  ],
  "hashtags": ["해시태그1", "해시태그2", "...최대10개"],
  "bgm_mood": "추천 BGM 분위기",
  "thumbnail_text": "썸네일 텍스트 (8자 이내)",
  "viral_elements": {
    "instinct_combo": "자극하는 본능 조합 (예: 나태+탐욕)",
    "emotion_flow": "감정 흐름 (예: 호기심→불안→놀람→안도)",
    "controversy_point": "댓글에서 찬반이 갈릴 수 있는 의견 갈림 포인트 1개",
    "share_trigger": "공유 동기 (공감/유용함/놀람/유머 중 1개)"
  }
}

★ 대본 작성 규칙:
1. 첫 씬(intro): 밈에서 자연스럽게 이어지는 전환. "근데 진짜 이거 아세요?", "그런데 말입니다" 등 밈의 웃음/충격에서 광고로 전환
2. 씬 구성: ${dur <= 5 ? '2~3개' : dur <= 10 ? '3~4개' : '4~5개'} 씬. 각 씬 2~4초
3. ★★★ [최중요] 나레이션 글자수 제한 (TTS 초당 약 6자):
   - 2초 씬: 10~12자 (예: "이거 모르면 큰일납니다")
   - 3초 씬: 15~18자 (예: "아침에 딱 이것만 하면 인생 달라져요")
   - 4초 씬: 20~24자
   - 전체 나레이션 합계: 약 ${dur * 6}자 내외
4. 자막: 핵심 키워드만 (나레이션의 20~30%)
5. 마지막 씬: 강한 CTA (클릭/팔로우/구매 유도)
6. 전체 duration 합이 ${dur}초와 정확히 일치하도록
7. JSON만 반환

★ 씬 타입: intro, benefit, feature, testimonial, offer, cta
★ 모션 스타일 (motion_style):
- keyword_pop: 키워드 팝인 (강조)
- typewriter: 타이핑 (설명)
- slide_stack: 좌우 슬라이드 (목록/비교)
- counter: 숫자 카운트업 (수치)
- split_compare: 좌우 비교 — ★자막에 **A** vs **B** 대비 키워드 2개 필수
- radial_burst: 방사형 (임팩트)
- list_reveal: 순차 등장 (팁)
- zoom_impact: 줌인 (핵심 메시지)
- glitch: 글리치 (경고/충격)
- wave: 웨이브 (감성)
- confetti_burst: 컨페티 폭발 (축하/CTA/성공)
- sparkle_trail: 스파클 궤적 (솔루션/팁/긍정)
- pulse_ring: 펄스 파동 (강조/에너지/각성)
연속 2개 씬에 같은 motion_style 금지!
★ split_compare/counter/progress_bar 사용 시 자막에 반드시 대응하는 볼드 키워드를 넣을 것!${videoType === 'motion' ? `
★ accent_color: 씬 분위기에 맞는 HEX 색상 (예: #FF6B6B) — 씬마다 다르게!
★ glow_color: 글로우/배경 HEX 색상 — accent와 유사 톤` : ''}

★ 광고 전략 (행동경제학):
- 손실 회피: "안 쓰면 손해"
- 구체적 숫자: "3일 만에 효과"
- 사회적 증거: "10만 명이 선택한"
- FOMO: "오늘까지만 이 가격"
- 간편성: "딱 1분이면"

★ 본능 자극 원칙 (7대 본능 중 2개 이상 교차):
광고는 반드시 아래 본능 중 2개 이상을 동시에 건드려야 한다:
- 오만(나는 특별하다) + 시기(나도 저렇게) = "상위 1%만 아는 비밀"
- 나태(시간 아껴줘) + 탐욕(더 벌고 싶다) = "자동으로 돈 버는 법"
- 분노(이건 부당하다) + 나태(쉽게 해결) = "몰라서 손해 보던 것"
- 탐식(더 자극적인 것) + 나태(노력 없이) = "이것만 하면 끝"
제품/서비스에 가장 잘 맞는 본능 조합을 선택해 전체 톤에 반영하라.

★ 감정 흐름 3단 구조 (씬 배치에 필수 반영):
1단계 - 문제 제시 (intro 씬): 밈에서 전환 후 시청자의 불안·공감을 건드린다
2단계 - 반전/인사이트 (benefit/feature 씬): 예상을 뒤집는 통찰·데이터를 던진다
3단계 - 해결 + CTA (offer/cta 씬): 솔루션과 행동 유도

★ CTA 원칙 (마지막 씬):
- 20자 이내 — 동사 하나 + 보상 하나
- 동사 경량화: "가입"→"시작하기", "신청"→"확인하기"
- 확실한 보상 명시: "뭔가 좋은 것" X → "무료 체험 시작" O`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('[generate-meme-ad] Gemini error:', errText)
      return new Response(JSON.stringify({ error: `Gemini API 오류: ${geminiRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiData = await geminiRes.json()
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return new Response(JSON.stringify({ error: 'Gemini 응답이 비어있습니다' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let cleaned = text.trim()
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
    }

    let result
    try {
      result = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('[generate-meme-ad] JSON parse failed:', (parseErr as Error).message, 'raw:', cleaned.slice(0, 200))
      return new Response(JSON.stringify({ error: 'AI 응답 파싱 실패. 다시 시도해주세요.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[generate-meme-ad] Error:', err)
    return new Response(JSON.stringify({ error: `생성 실패: ${(err as Error).message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
