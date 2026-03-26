// Supabase Edge Function: 트렌드 검색 (Apify REST API + Gemini 주제 분석)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getCorsHeaders, handleCorsPreflightRequest, jsonResponse, errorResponse } from '../server/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req)
  }

  try {
    const { mode, country, topic } = await req.json()

    // ── X 트렌딩 모드 (Apify scrape.badger WOEID 기반) ──
    if (mode === 'x-trending') {
      const apiToken = Deno.env.get('APIFY_API_TOKEN')
      if (!apiToken) {
        return errorResponse(req, 'APIFY_API_TOKEN not configured', 500)
      }

      // scrape.badger/twitter-trends-scraper — WOEID 방식, 한국=23424868
      const actorId = 'scrape.badger~twitter-trends-scraper'
      const woeid = country === 'Worldwide' ? '1' : '23424868' // 기본값: 한국
      const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}&timeout=60`

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'Get Place Trends',
          woeid,
          max_results: 50,
        }),
      })

      if (!response.ok) {
        console.error('Apify API error:', response.status, await response.text())
        return errorResponse(req, '트렌드 검색에 실패했습니다. 잠시 후 다시 시도해주세요.', 502)
      }

      const rawData = await response.json()
      // 응답 구조: [{ woeid, name, trends: [{ name, url, query }] }]
      const trendsArray = Array.isArray(rawData) && rawData[0]?.trends
        ? rawData[0].trends
        : []

      const items = trendsArray.map((item: Record<string, unknown>, i: number) => ({
        rank: i + 1,
        keyword: (item.name as string) || '',
        category: null,
        volume: null,
        url: (item.url as string) || null,
      }))

      return jsonResponse(req, { success: true, mode, count: items.length, items })
    }

    // ── 주제별 트렌드 분석 모드 (Gemini + Google Search 그라운딩) ──
    if (mode === 'topic-analysis') {
      if (!topic?.trim()) {
        return errorResponse(req, '분석할 주제를 입력해주세요', 400)
      }

      const apiKey = Deno.env.get('GOOGLE_API_KEY')
      if (!apiKey) {
        return errorResponse(req, 'GOOGLE_API_KEY not configured', 500)
      }

      const prompt = `당신은 SNS 트렌드 분석 전문가입니다.

아래 주제에 대해 현재 실시간으로 뜨고 있는 트렌드, 바이럴 키워드, 관련 이슈를 분석해주세요.

## 분석 주제: ${topic.trim()}

## 출력 형식 (JSON)
{
  "topic": "분석 주제",
  "summary": "현재 이 주제의 트렌드 흐름 요약 (2~3문장)",
  "keywords": [
    {
      "keyword": "트렌딩 키워드/해시태그",
      "description": "왜 뜨고 있는지 한 줄 설명",
      "platform": "주로 뜨는 플랫폼 (X/인스타/틱톡/유튜브/스레드/뉴스 등)",
      "heat": "hot | warm | rising"
    }
  ],
  "insights": [
    {
      "text": "크로스 플랫폼 인사이트 (현상 + 왜 뜨는지 본능 분석)",
      "instinct": "자극하는 본능 조합 (예: 탐식+분노)"
    }
  ],
  "content_ideas": [
    {
      "idea": "콘텐츠 아이디어 제목",
      "differentiation": "차별화 소재 — 익숙한 A + 예상 밖 B 조합 (예: AI 캐릭터 + 제철 먹방)",
      "controversy": "찬반이 갈릴 수 있는 논란 포인트 1개",
      "meme_potential": "시청자가 따라하거나 갖고 놀 수 있는 요소",
      "hook_strategy": "후킹 전략 — 본능 조합 + 감정 + 구체적 후킹 멘트 예시"
    }
  ]
}

## 규칙
- keywords는 5~10개, 실제로 SNS에서 화제가 되는 것 위주
- heat: hot(현재 폭발적), warm(꾸준히 관심), rising(떠오르는 중)
- 한국 시장 기준으로 분석
- 반드시 최신 정보를 검색해서 답변하세요

## 인사이트 작성 원칙
- 단순 현상 설명이 아니라 **왜 뜨는지** 본능 분석을 포함하라
- 7대 본능: 오만(특별함), 시기(비교), 분노(부당함), 나태(편의), 탐욕(이득), 탐식(자극), 음욕(매력)
- 예: "도파민 디톡스가 뜨는 이유: 탐식(자극 과잉)의 반작용 + 나태(쉬운 실천법 욕구)"

## 콘텐츠 아이디어 작성 원칙 (바이럴 삼각형 필수 적용)
1. **차별화 소재**: [익숙한 장르 A] + [예상 밖 요소 B] = "이런 건 처음이다" 반응
2. **논란 포인트**: 찬반이 갈리되 "불편한 진실~윤리적 경계선" 범위 내
3. **밈 생산성**: 시청자가 따라하거나 갖고 놀 수 있는 요소
4. **후킹 전략**: 본능 2개 이상 조합 + 구체적 후킹 멘트 예시

- JSON만 출력, 마크다운 코드블록 없이`

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

      // Google Search 그라운딩 + JSON 모드는 호환 안 될 수 있으므로 분리 시도
      // 1차: Google Search 그라운딩 + 텍스트 모드
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.7,
          },
        }),
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error('Gemini API error:', response.status, errText)

        // Google Search 그라운딩 실패 시 일반 모드로 폴백
        const fallbackResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.7,
            },
          }),
        })

        if (!fallbackResponse.ok) {
          console.error('Gemini fallback error:', fallbackResponse.status, await fallbackResponse.text())
          return errorResponse(req, 'AI 분석에 실패했습니다. 잠시 후 다시 시도해주세요.', 502)
        }

        const fallbackData = await fallbackResponse.json()
        const fallbackText = fallbackData?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!fallbackText) return errorResponse(req, 'AI 응답을 받지 못했습니다', 502)

        try {
          return jsonResponse(req, { success: true, mode, analysis: JSON.parse(fallbackText) })
        } catch {
          return jsonResponse(req, { success: true, mode, raw: fallbackText })
        }
      }

      const geminiData = await response.json()
      // Google Search 그라운딩 응답에서 텍스트 파트 추출
      const parts = geminiData?.candidates?.[0]?.content?.parts || []
      const textPart = parts.find((p: Record<string, unknown>) => p.text)?.text

      if (!textPart) {
        return errorResponse(req, 'AI 응답을 받지 못했습니다', 502)
      }

      // 그라운딩 출처 추출
      const metadata = geminiData?.candidates?.[0]?.groundingMetadata
      const sources = (metadata?.groundingChunks || []).map((chunk: Record<string, Record<string, string>>) => ({
        title: chunk.web?.title || '',
        url: chunk.web?.uri || '',
      })).filter((s: { title: string; url: string }) => s.url)

      // JSON 추출 (마크다운 코드블록 안에 있을 수 있음)
      const jsonMatch = textPart.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, textPart]
      const cleanJson = (jsonMatch[1] || textPart).trim()

      try {
        const analysis = JSON.parse(cleanJson)
        return jsonResponse(req, { success: true, mode, analysis, sources })
      } catch {
        return jsonResponse(req, { success: true, mode, raw: textPart, sources })
      }
    }

    // ── X 트렌딩 종합 인사이트 모드 (Gemini) ──
    if (mode === 'trending-insights') {
      const keywords = topic // topic 필드에 키워드 배열 문자열을 넘김
      if (!keywords?.trim()) {
        return errorResponse(req, '키워드 목록이 필요합니다', 400)
      }

      const apiKey = Deno.env.get('GOOGLE_API_KEY')
      if (!apiKey) {
        return errorResponse(req, 'GOOGLE_API_KEY not configured', 500)
      }

      const prompt = `당신은 SNS 트렌드 분석 전문가입니다.

아래는 현재 X(트위터) 한국 실시간 트렌딩 키워드 목록입니다. 이 키워드들을 종합 분석해주세요.

## 트렌딩 키워드 목록
${keywords}

## 출력 형식 (JSON)
{
  "categories": [
    {
      "name": "카테고리명 (예: K-POP, 정치, 게임, 사회이슈 등)",
      "keywords": ["해당 카테고리 키워드들"],
      "summary": "이 카테고리 트렌드 한 줄 요약"
    }
  ],
  "top_insights": [
    {
      "text": "종합 인사이트 (현상 + 왜 뜨는지 본능 분석)",
      "instinct": "자극하는 본능 조합 (예: 시기+오만)"
    }
  ],
  "mood": "현재 X 한국의 전반적인 분위기 한 줄 (예: K-POP 생일 축하와 정치 이슈가 공존하는 하루)",
  "content_tips": [
    {
      "tip": "콘텐츠 제작 팁 (구체적 실행 가이드)",
      "emotion": "건드릴 감정 (공감/유용함/놀람/유머/불안·호기심/위로 중 택1)",
      "hook_example": "후킹 멘트 예시 (3초 안에 멈추게 하는 한 문장)",
      "cta_example": "CTA 예시 (20자 이내, 동사+보상)"
    }
  ]
}

## 규칙
- categories는 3~6개로 묶기
- top_insights는 3~5개, 핵심 흐름 위주
- content_tips는 2~3개, 실용적인 콘텐츠 제작 팁

## 인사이트 작성 원칙
- 단순 현상 나열이 아니라 **왜 뜨는지** 본능 분석을 포함하라
- 7대 본능: 오만(특별함), 시기(비교), 분노(부당함), 나태(편의), 탐욕(이득), 탐식(자극), 음욕(매력)

## 콘텐츠 팁 작성 원칙
- 감정 먼저 정하라: 어떤 감정을 건드릴 것인가 (공감/유용함/놀람/유머/불안·호기심/위로)
- 후킹 멘트 예시: 본능 2개 이상 조합 + 행동경제학 전략 (손실회피/구체적숫자/FOMO/타겟지목)
- CTA 예시: 20자 이내, 동사 경량화("가입"→"시작하기"), 확실한 보상 명시

- 한국어로 작성
- JSON만 출력, 마크다운 코드블록 없이`

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
          },
        }),
      })

      if (!response.ok) {
        console.error('Gemini trending-insights error:', response.status, await response.text())
        return errorResponse(req, 'AI 분석에 실패했습니다', 502)
      }

      const geminiData = await response.json()
      const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) return errorResponse(req, 'AI 응답을 받지 못했습니다', 502)

      try {
        return jsonResponse(req, { success: true, mode, insights: JSON.parse(text) })
      } catch {
        return jsonResponse(req, { success: true, mode, raw: text })
      }
    }

    return errorResponse(req, '지원하지 않는 모드입니다', 400)
  } catch (err) {
    console.error('search-trends error:', err)
    return errorResponse(req, '트렌드 검색 중 오류가 발생했습니다', 500)
  }
})
