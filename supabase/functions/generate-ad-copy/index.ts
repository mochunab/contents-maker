// Supabase Edge Function: AI 광고 카피 생성 (Gemini 2.5 Flash)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../server/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const { product, target, goalAction, ctaLocation, copyCount, revision } = await req.json()

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

    const count = copyCount || 5
    const location = ctaLocation || '버튼'

    const prompt = `당신은 전환율을 극대화하는 세계 제일의 UX 라이팅 전문가이자 광고 카피라이터입니다.

아래 정보를 바탕으로 Call to Action 광고 카피를 ${count}개 작성해주세요.

## 입력 정보
- **제품/서비스**: ${product}
- **타겟 고객**: ${target || '일반 대중'}
- **목표 행동**: ${goalAction || '클릭'}
- **CTA 위치**: ${location}

## PAS 글쓰기 프레임워크 (모든 카피에 필수 적용)

각 카피는 반드시 아래 PAS 구조를 따라야 합니다:

1. **Problem (문제)**: 고객이 현재 겪는 문제를 정확히 짚어준다. headline에서 문제를 건드린다.
2. **Agitate (자극)**: 그 문제를 방치하면 어떻게 되는지 강력하게 자극한다. subtext에서 불안/긴급함을 높인다.
3. **Solution (해결책)**: 우리 제품/서비스가 그 문제의 해결책임을 제시한다. cta_button에서 행동을 유도한다.

예시:
- P: "매달 광고비만 태우고 있나요?" → A: "경쟁사는 벌써 전환율 3배 올렸습니다" → S: "무료로 진단받기"
- P: "오늘 운세가 궁금한데" → A: "혼자 고민만 늘어가죠" → S: "AI 타로 바로 보기"

## 활용할 광고 전략 (PAS 구조 위에 1~2개 조합)

### 행동경제학 기반 전략
1. **손실 회피 (Loss Aversion)**: 잃는 두려움을 자극. "놓치면 후회", "이대로 가면 망함"
2. **구체적 숫자 (Specific Numbers)**: 신뢰도 향상. "3가지 신호", "90% 확률", "단 2분이면"
3. **타겟 지목 (Cocktail Party Effect)**: 특정 대상을 콕 찍어 내 이야기처럼. "30대 직장인이라면"
4. **간편성/즉각성 (Simplicity)**: 낮은 진입장벽. "딱 3초면", "지금 당장", "클릭 한 번으로"

### 카피 유형별 전략
5. **문제점 자극형**: 현재 겪는 문제/결핍을 건드림. "아직도 야근하세요?"
6. **이익 약속형**: 구체적 이익/가치 약속. "업무 시간 50% 단축"
7. **호기심 유발형**: 질문/비밀스러운 암시로 궁금증 자극. "1%만 아는 비밀"
8. **해결책 제시형**: 명확한 해결책/방법 제시. "이렇게 하면 됩니다"
9. **질문 유도형**: 특정 질문을 유도. "궁금한 게 있으신가요?"
10. **행동 촉구형**: 다음 행동을 직접적으로 유도. "지금 바로 시작하기"

## 출력 JSON 형식

{
  "product_summary": "제품/서비스 한 줄 요약",
  "viral_elements": {
    "instinct_combo": "자극하는 본능 조합 (예: 나태+탐욕)",
    "controversy_point": "댓글에서 찬반이 갈릴 수 있는 의견 갈림 포인트 1개",
    "share_trigger": "공유 동기 (공감/유용함/놀람/유머 중 1개)"
  },
  "copies": [
    {
      "id": 1,
      "headline": "메인 카피 — Problem: 고객 문제를 짚는다 (20자 이내, 강렬하게)",
      "subtext": "보조 문구 — Agitate: 문제를 자극/증폭한다 (30자 이내)",
      "cta_button": "버튼 — Solution: 해결책 행동 유도 (10자 이내)",
      "strategies": ["전략번호. 전략명"],
      "explanation": "왜 이 전략을 선택했는지 한 줄 설명",
      "tone": "자극적 | 따뜻한 | 유머러스 | 긴급한 | 신뢰감 중 택 1"
    }
  ]
}

## 본능 자극 원칙 (7대 본능 중 2개 이상 교차)
각 카피는 반드시 아래 본능 중 2개 이상을 동시에 건드려야 한다:
- 오만(나는 특별하다) + 시기(나도 저렇게) = "상위 1%만 아는 비밀"
- 나태(시간 아껴줘) + 탐욕(더 벌고 싶다) = "자동으로 돈 버는 법"
- 분노(이건 부당하다) + 나태(쉽게 해결) = "몰라서 손해 보던 것"
- 음욕(매력적으로) + 시기(비교) = "요즘 다들 하는데 나만 모르는"
- 탐식(더 자극적인 것) + 나태(노력 없이) = "이것만 하면 끝"
제품에 가장 잘 맞는 본능 조합을 선택해 headline과 subtext에 반영하라.

## 작성 규칙
- **PAS 구조 필수**: headline=Problem(문제 짚기), subtext=Agitate(자극/증폭), cta_button=Solution(해결책 행동)
- 타겟 고객에게 직접 말하는 듯한 톤
- 메인 카피는 20자 이내로 간결하게
- **CTA 버튼 원칙**: 10자 이내. 동사 경량화("가입"→"시작하기", "신청"→"확인하기"). 확실한 보상 명시("뭔가 좋은 것" X → "무료 진단 받기" O)
- 구체적인 행동을 유도할 것
- 감정을 건드리되 과장하지 않을 것
- 각 카피는 서로 다른 전략 조합 사용
- AI 클리셰 표현 금지: "혁명적인", "게임체인저", "패러다임", "지금 바로" 남발 등
- 한국어 자연스러운 구어체 사용

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
      console.error('Gemini API error:', errText)
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
    console.error('generate-ad-copy error:', err)
    return new Response(JSON.stringify({ error: '카피 생성 중 오류가 발생했습니다' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
