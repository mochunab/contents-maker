import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflightRequest } from '../server/cors.ts';

// Jamendo API 무드 → 태그 매핑
const MOOD_TAG_MAP: Record<string, string[]> = {
  '밝고 경쾌한': ['happy', 'upbeat', 'energetic'],
  '차분하고 편안한': ['calm', 'relaxing', 'peaceful'],
  '긴장감 있는': ['dramatic', 'tense', 'suspense'],
  '감성적인': ['emotional', 'melancholic', 'sad'],
  '힙한/트렌디': ['hiphop', 'trap', 'urban'],
  '신나는': ['dance', 'electronic', 'party'],
  '동기부여': ['motivational', 'inspiring', 'uplifting'],
  '미스터리': ['dark', 'mystery', 'ambient'],
};

// 영상 길이에 맞는 Jamendo duration 필터
function getDurationFilter(targetSeconds: number): string {
  // Jamendo duration filter: between 범위
  const min = Math.max(targetSeconds - 15, 10);
  const max = targetSeconds + 60;
  return `between ${min} ${max}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const { mood, duration = 30 } = await req.json();

    if (!mood) {
      return new Response(
        JSON.stringify({ error: 'mood 파라미터가 필요합니다' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const JAMENDO_CLIENT_ID = Deno.env.get('JAMENDO_CLIENT_ID');
    if (!JAMENDO_CLIENT_ID) {
      return new Response(
        JSON.stringify({ error: 'JAMENDO_CLIENT_ID가 설정되지 않았습니다' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 무드에 맞는 태그 선택
    const tags = MOOD_TAG_MAP[mood] || ['pop', 'instrumental'];
    const tagQuery = tags.join('+');
    const durationFilter = getDurationFilter(duration);

    // Jamendo API v3.0 트랙 검색
    const searchUrl = new URL('https://api.jamendo.com/v3.0/tracks/');
    searchUrl.searchParams.set('client_id', JAMENDO_CLIENT_ID);
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('limit', '10');
    searchUrl.searchParams.set('tags', tagQuery);
    searchUrl.searchParams.set('duration', durationFilter);
    searchUrl.searchParams.set('include', 'musicinfo');
    searchUrl.searchParams.set('order', 'popularity_total');
    searchUrl.searchParams.set('audioformat', 'mp32');
    // instrumental 우선 (보컬 없는 BGM)
    searchUrl.searchParams.set('vocalinstrumental', 'instrumental');

    console.log(`[generate-bgm] Searching Jamendo: mood=${mood}, tags=${tagQuery}, duration=${durationFilter}`);

    const searchRes = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();

    if (!searchData.results || searchData.results.length === 0) {
      // 태그 없이 재검색 (폴백)
      const fallbackUrl = new URL('https://api.jamendo.com/v3.0/tracks/');
      fallbackUrl.searchParams.set('client_id', JAMENDO_CLIENT_ID);
      fallbackUrl.searchParams.set('format', 'json');
      fallbackUrl.searchParams.set('limit', '10');
      fallbackUrl.searchParams.set('search', tags[0]);
      fallbackUrl.searchParams.set('duration', durationFilter);
      fallbackUrl.searchParams.set('order', 'popularity_total');
      fallbackUrl.searchParams.set('audioformat', 'mp32');
      fallbackUrl.searchParams.set('vocalinstrumental', 'instrumental');

      console.log(`[generate-bgm] Fallback search: ${tags[0]}`);
      const fallbackRes = await fetch(fallbackUrl.toString());
      const fallbackData = await fallbackRes.json();

      if (!fallbackData.results || fallbackData.results.length === 0) {
        return new Response(
          JSON.stringify({ error: '적합한 BGM을 찾지 못했습니다', tracks: [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      searchData.results = fallbackData.results;
    }

    // 랜덤으로 1곡 선택 (상위 결과 중)
    const topTracks = searchData.results.slice(0, 5);
    const selected = topTracks[Math.floor(Math.random() * topTracks.length)];

    // Jamendo mp3 streaming URL을 직접 반환 (base64 변환 시 메모리 초과 방지)
    const audioUrl = selected.audio; // Jamendo mp3 streaming URL
    console.log(`[generate-bgm] Selected: "${selected.name}" by ${selected.artist_name} (${selected.duration}s)`);

    const result = {
      audioUrl,
      track: {
        id: selected.id,
        name: selected.name,
        artist: selected.artist_name,
        duration: selected.duration,
        license: selected.license_ccurl,
        url: selected.shareurl,
      },
    };

    console.log(`[generate-bgm] Success: ${selected.name}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[generate-bgm] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'BGM 생성 실패' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
