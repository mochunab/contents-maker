// Supabase Edge Function: AI 광고 소재 기획안 생성 (Gemini 2.5 Flash)
// 제품 정보 → 3개 옵션(A/B/C) 전략·카피·디자인·이미지 프롬프트 JSON
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../server/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const { product, target, goalAction, channel, ratio, revision } = await req.json()

    if (!product?.trim()) {
      return new Response(JSON.stringify({ error: '제품/서비스를 입력해주세요' }), {
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

    const prompt = `당신은 세계 제일의 퍼포먼스 마케팅 크리에이티브 디렉터이자 이미지 생성 AI 프롬프트 엔지니어입니다.
아래 정보를 바탕으로 ${channel || '인스타그램'} 광고 포스터(${ratio?.width || 1080}×${ratio?.height || 1350}px, ${ratio?.ratio || '4:5'} 비율) 기획안 3개(Option A, B, C)를 제안하세요.

## 입력 정보
- **제품/서비스**: ${product}
- **타겟 고객**: ${target || '일반 대중'}
- **목표 행동**: ${goalAction || '클릭'}
- **광고 채널**: ${channel || '인스타그램'}
- **소재 규격**: ${ratio?.width || 1080}×${ratio?.height || 1350}px (${ratio?.ratio || '4:5'} 비율, ${ratio?.label || '피드 세로형'})

## 활용할 광고 전략 (각 옵션마다 서로 다른 전략 사용)

### 행동경제학 기반 전략
1. 손실 회피: 잃는 두려움 자극 - "놓치면 후회"
2. 구체적 숫자: 신뢰도 향상 - "3가지 신호", "90% 확률"
3. 타겟 지목: 내 이야기처럼 - "30대 직장인이라면"
4. 간편성/즉각성: 낮은 진입장벽 - "딱 3초면"
5. 비교 및 소외 불안: 조바심 유발 - "요즘 또래들은 다 아는"
6. 인정욕구 및 우월감: 특별해지고 싶은 심리 - "상위 1%만 타고난"

### 카피 유형
- 문제점/결핍 후벼파기형 | 비교/경쟁 자극형 | 경고/파국 암시형
- 이익 약속형 | 호기심 유발형 | 해결책/구원 제시형
- 질문/테스트 유도형 | 행동 촉구형

## 디자인 선택지

### 배경 스타일
A. Bold Solid Color (비비드 단색) - vivid solid color background, clean flat
B. Soft Gradient (부드러운 그라데이션) - soft gradient from color1 to color2, warm tones
C. Minimal Texture (미니멀 텍스처) - solid color with subtle geometric pattern

### 메인 비주얼 스타일
A. Hand + Phone Mockup - realistic hand holding smartphone
B. Hand + Product - realistic hand holding product
C. Illustration Character - minimal illustration of stylish korean person
D. Product Arrangement - multiple product cutouts, floating arrangement
E. Photo Style Person - realistic photo of korean person, natural expression
F. 3D Object Illustration - clean 3D illustration, matte finish, simple geometric

### 장식 요소
A. Cute Minimal 3D - simple 3D shapes, matte finish, 2-3 pieces
B. Subtle Sparkles - small star icons, minimal quantity
C. Graphic Shapes - wave dividers, blob shapes, flat design
D. Minimal Icons - simple line icons
E. None - clean design, no decorative elements

### 텍스트 스타일
A. Bold Direct - extra bold sans-serif, large size, high contrast
B. Label Box Style - text inside rounded rectangle, pill-shaped box
C. Mixed Hierarchy - main headline bold large, sub copy smaller
D. 3D Typography - 3D text signage style, dimensional typography

## 출력 JSON 형식

{
  "viral_elements": {
    "instinct_combo": "자극하는 본능 조합 (예: 나태+탐욕)",
    "controversy_point": "댓글에서 찬반이 갈릴 수 있는 의견 갈림 포인트 1개",
    "share_trigger": "공유 동기 (공감/유용함/놀람/유머 중 1개)"
  },
  "options": [
    {
      "id": "A",
      "strategy_name": "전략 이름 (한글만, 영어 금지. 예: 손실 회피, 호기심 유발)",
      "strategy_description": "선택한 전략이 타겟의 클릭을 어떻게 유도하는지 한 줄 설명",
      "headline": "메인 카피 (15자 이내, 한글)",
      "subtext": "서브 카피 (선택사항, 한글)",
      "cta_text": "CTA 버튼 텍스트 (한글)",
      "design": {
        "background": "선택한 배경 스타일명",
        "main_visual": "선택한 비주얼 스타일명",
        "decorative": "선택한 장식 스타일명",
        "typography": "선택한 텍스트 스타일명",
        "colors": {
          "main": "#HEX",
          "sub": "#HEX",
          "point": "#HEX"
        }
      },
      "image_prompt": "Narrative-style 영문 프롬프트 (아래 규칙 준수, 한 문단으로 작성)"
    }
  ]
}

## image_prompt 작성 규칙 (CRITICAL)

반드시 하나의 긴 영문 문단(Paragraph)으로 작성. 리스트나 불렛 포인트 금지.

순서:
1. "An ${channel || 'Instagram'} advertisement poster (${ratio?.width || 1080}x${ratio?.height || 1350}px) featuring [Style]..."
2. 메인 비주얼과 배경을 전치사로 통합 묘사
3. 텍스트 배치: "At the top, a bold headline '[한글 헤드라인]' is placed in [Color]..."
4. CTA 버튼: "At the bottom center, a pill-shaped CTA button with [Color] background displays '[한글 CTA]' in White."
5. 분위기: "The overall mood is [tone], with [quality details]."

## 본능 자극 원칙 (7대 본능 중 2개 이상 교차)
각 옵션의 headline은 반드시 아래 본능 중 2개 이상을 동시에 건드려야 한다:
- 오만(나는 특별하다) + 시기(나도 저렇게) = "상위 1%만 아는 비밀"
- 나태(시간 아껴줘) + 탐욕(더 벌고 싶다) = "자동으로 돈 버는 법"
- 분노(이건 부당하다) + 나태(쉽게 해결) = "몰라서 손해 보던 것"
- 음욕(매력적으로) + 시기(비교) = "요즘 다들 하는데 나만 모르는"
제품에 가장 잘 맞는 본능 조합을 선택하라.

## CTA 작성 원칙
- 20자 이내 — 동사 하나 + 보상 하나
- 동사 경량화: "가입"→"시작하기", "신청"→"확인하기"
- 확실한 보상 명시: "뭔가 좋은 것" X → "무료 체험 시작" O

## AI 티 방지 (CRITICAL)
- "Glowing" → "Ambient lighting", "Soft glow"
- "Magic sparkles" → "Cinematic dust", "Backlight"
- "Mystical background" → "Depth of field", "Blurred background"
- "3D illustration" → "Clay texture", "Matte finish"
- NO: neon, holographic, floating elements, robot hands, cosmic, ethereal
- YES: grounded objects, natural textures, desaturated tones, film grain

## 3개 옵션 각각 서로 다른 전략·디자인 스타일 조합 사용할 것

${revision || ''}

반드시 위 JSON 형식으로만 응답해주세요.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.9,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('[generate-ad-creative] Gemini error:', errText.slice(0, 300))
      return new Response(JSON.stringify({ error: 'AI 생성 실패. 잠시 후 다시 시도해주세요.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const geminiData = await geminiRes.json()
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return new Response(JSON.stringify({ error: 'AI 응답이 비어있습니다' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = JSON.parse(text)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[generate-ad-creative] Error:', err)
    return new Response(JSON.stringify({ error: '기획안 생성 중 오류가 발생했습니다' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
