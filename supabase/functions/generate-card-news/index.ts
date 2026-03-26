// Supabase Edge Function: AI 카드뉴스 슬라이드 기획 (Gemini 2.5 Flash)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest } from '../server/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  const corsHeaders = getCorsHeaders(req)

  try {
    const { topic, slideCount, ratio } = await req.json()

    if (!topic?.trim()) {
      return new Response(JSON.stringify({ error: '주제를 입력해주세요' }), {
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

    const count = slideCount || 10
    const ratioLabel = ratio?.label || '인스타 피드'
    const width = ratio?.width || 1080
    const height = ratio?.height || 1080

    const prompt = `당신은 인스타그램 카드뉴스 기획 전문가이자 행동경제학 기반 카피라이터입니다.

주제: "${topic}"

다음 JSON 형식으로 ${count}장짜리 카드뉴스 슬라이드를 기획해주세요:

{
  "title": "카드뉴스 제목",
  "viral_elements": {
    "instinct_combo": "자극하는 본능 조합 (예: 나태+탐욕)",
    "emotion_flow": "감정 흐름 (예: 호기심→불안→놀람→안도)",
    "controversy_point": "댓글에서 찬반이 갈릴 수 있는 의견 갈림 포인트 1개",
    "share_trigger": "공유 동기 (공감/유용함/놀람/유머 중 1개)"
  },
  "slides": [
    {
      "slide_number": 1,
      "type": "cover",
      "headline": "후킹 제목 (15자 이내)",
      "subtext": "부제목 (20자 이내)",
      "image_prompt": "배경 이미지 프롬프트 (영문, no text/letters)",
      "search_keyword": "Unsplash 검색 키워드 (영문 1~3단어, 슬라이드 내용에 맞는 감성적 사진 검색용)",
      "color_scheme": "#hex 메인 컬러"
    },
    {
      "slide_number": 2,
      "type": "content",
      "headline": "핵심 메시지 (15자 이내)",
      "body": "본문 텍스트 (1~2문장, 30~50자, 핵심만 짧게)",
      "image_prompt": "배경 이미지 프롬프트 (영문, no text/letters)",
      "search_keyword": "Unsplash 검색 키워드 (영문 1~3단어)",
      "color_scheme": "#hex"
    }
  ]
}

규칙:
- 1장: cover (강렬한 후킹 제목)
- 2~${count - 1}장: content (핵심 정보, 숫자/통계 활용, 각 장마다 하나의 메시지). body는 반드시 1~2문장(30~50자)으로 핵심 한 줄만. 긴 설명 금지, 수식어 제거, 카드뉴스답게 짧고 임팩트 있게.
- ${count}장: cta (행동 유도). headline은 질문형 한 줄 (15자 이내), subtext는 참여 유도 한 줄 (25자 이내). body 없음. 예시: headline "AI의 미래, 어떻게 생각하세요?" / subtext "댓글로 자유롭게 의견을 남겨주세요!"
- image_prompt: 텍스트 없는 배경 이미지용, 영문으로, "no text, no letters" 포함 필수
- 모든 카피는 한국어, image_prompt만 영문
- color_scheme: 슬라이드별 통일감 있는 컬러 (전체적으로 조화)
- 이미지 비율: ${width}x${height} (${ratioLabel})에 맞는 구도
- search_keyword: 슬라이드마다 서로 다른 고유한 키워드를 사용할 것. 같은 키워드 반복 금지.
- JSON만 반환, 마크다운/설명 없이

★ 이미지 선정 전략 (image_prompt & search_keyword 작성 시 필수 적용):
1. 주제를 관통하는 한 장면: 좋은 이미지는 주제의 핵심을 단 하나의 장면으로 압축한다. 추상적 배경이 아닌, 구체적 상황/장면을 떠올려라.
2. 호기심 유발: 이미지만으로 "이게 뭐지?" "왜 저런 상황이지?"라는 질문이 생기게 하라.
3. 감정 전달: 사람의 표정, 몸짓, 또는 강렬한 색감/대비로 감정을 즉시 전달하라.
4. 구체적 피사체: "business" 같은 추상 키워드 대신 "stressed office worker at desk", "coffee cup on laptop" 처럼 구체적 장면을 묘사하라.
5. cover 이미지: 가장 임팩트 있는 한 장면. 호기심과 감정을 동시에 자극하는 이미지.
6. content 이미지: 해당 슬라이드의 핵심 메시지를 시각적으로 보여주는 이미지. 각 장마다 다른 장면.
7. cta 이미지: 행동을 유도하는 따뜻하거나 긍정적인 분위기의 이미지.

★ AI 티 방지 스타일 가이드 (image_prompt 작성 시 필수):
- 로봇 손, 홀로그램, 네온 회로, 허공에 뜬 아이콘 등 AI 클리셰 장면 금지. 실제 사람/사물/공간 중심으로 묘사.
- 허공에 떠 있는 오브젝트(floating cards, orbs) 대신 바닥/테이블/손 위 등에 안착(grounded)시켜라.
- 과도한 보라+파랑 네온 조합 지양. 채도를 낮추거나(desaturated) 질감(texture)을 추가해 깊이감을 줘라.
- 빛 표현: "glowing" → "ambient lighting" / "soft glow", "magic sparkles" → "cinematic dust" / "backlight"
- 배경 정리: "mystical background" → "depth of field" / "blurred background"
- 3D 느낌 줄이기: "3D illustration" → "clay texture" / "matte finish"
- 전반적으로 editorial photography, natural lighting, film grain 같은 실제 사진 느낌을 지향.

★ 1장(cover) 카피 작성 시 반드시 아래 행동경제학 전략을 적용하세요:

[행동경제학 기반 후킹 전략]
1. 단일 메시지 집중: 장점 나열 대신 지금 행동해야 할 이유 하나만 전달. ❌ "할인+적립+무료배송" → ✅ "지금 가입하면 무조건 1만원"
2. 손실 회피: 잃는 두려움 자극. 예: "놓치면 후회", "이대로 가면 망함"
3. 구체적 숫자: 신뢰도 향상. 예: "3가지 신호", "90% 확률", "5년 안에"
4. 타겟 지목: 내 이야기처럼 느끼게. 예: "30대 직장인이라면", "짝사랑 중인 너"
5. 간편성/행동 경량화: 낮은 진입장벽. 예: "딱 3초면", "지금 당장"
6. FOMO & 비교: 소외 불안 자극. 예: "요즘 잘나가는 또래들은 다 아는"
7. 인정욕구/우월감: 특별해지고 싶은 심리. 예: "상위 1%만 아는"
8. 확실성 효과: 작아도 확실한 보상. 예: "100% 확정", "누구나 받는 무료 진단"

[카피 유형 — 주제에 맞는 유형을 선택]
- 문제점/결핍 후벼파기형: 고객이 외면하던 진짜 문제를 직면시킴
- 비교/경쟁 자극형: 타인과의 차이를 부각해 경쟁심 자극
- 경고/파국 암시형: 방치 시 최악의 상황을 가정해 불안 증폭
- 이익 약속형: 확실하고 구체적인 보상 제시
- 호기심 유발형: 결론을 숨긴 채 궁금증을 최고조로 끌어올림
- 해결책/구원 제시형: 불안에 빠진 유저에게 확실한 솔루션 제공
- 질문/테스트 유도형: '나는 어떨까?' 자기 객관화 욕구 자극
- 행동 촉구형: 더 늦기 전에 당장 확인하라는 강한 지시
- 시의성/신선함 강조형: "방금 나온", "2026 최신", "아직 아무도 모르는"

cover의 headline은 위 전략 중 주제와 가장 잘 맞는 2~3가지를 조합해 작성하세요.

★ 본능 자극 원칙 (7대 본능 중 2개 이상 교차):
콘텐츠는 반드시 아래 본능 중 2개 이상을 동시에 건드려야 한다. cover headline에서 어떤 본능 조합을 자극하는지 의식적으로 설계하라:
- 오만(나는 특별하다) + 시기(나도 저렇게) = "상위 1%만 아는 비밀"
- 나태(시간 아껴줘) + 탐욕(더 벌고 싶다) = "자동으로 돈 버는 법"
- 분노(이건 부당하다) + 나태(쉽게 해결) = "몰라서 손해 보던 것"
- 음욕(매력적으로) + 시기(비교) = "요즘 다들 하는데 나만 모르는"
- 탐식(더 자극적인 것) + 나태(노력 없이) = "이것만 먹으면 끝"

★ 슬라이드 감정 흐름 3단 구조 (CRITICAL):
카드뉴스 전체를 3단계 감정 흐름으로 설계하라:
1단계 - 문제 제시 (cover + 초반 content): 시청자의 불안·공감·호기심을 건드린다
   예: "매일 운동하는데 체중이 그대로?"
2단계 - 반전/인사이트 (중반 content): 예상을 뒤집는 통찰·데이터·비밀을 던진다
   예: "체중 정체의 80%는 수면 부족이었습니다"
3단계 - 해결 + CTA (후반 content + cta): 솔루션을 제시하고 행동을 유도한다
   예: "오늘부터 이것만 바꿔보세요"

★ CTA 작성 원칙 (마지막 슬라이드):
- 20자 이내 — 동사 하나 + 보상 하나
- 동사 경량화: "가입" → "시작하기", "신청" → "확인하기"
- 확실한 보상 명시: "뭔가 좋은 것" (X) → "무료 진단 결과" (O)
- 감정 최고조 직후 배치`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.8,
          },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('[generate-card-news] Gemini error:', errText)
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

    const result = JSON.parse(text)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[generate-card-news] Error:', err)
    return new Response(JSON.stringify({ error: `생성 실패: ${(err as Error).message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
