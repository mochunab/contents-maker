import { useState, useCallback, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { toPng } from 'html-to-image';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabaseUrl } from '../lib/supabase';
import ArrowLeft from '../components/ArrowLeft';

// ── Types ──

type Slide = {
  slide_number: number;
  type: 'cover' | 'content' | 'cta';
  headline: string;
  subtext?: string;
  body?: string;
  image_prompt: string;
  search_keyword?: string;
  color_scheme: string;
};

type UnsplashPhoto = {
  id: string;
  url: string;
  photographer: string;
  photographer_url: string;
  unsplash_url: string;
  source?: 'unsplash' | 'pexels';
};

type SlideResult = {
  title: string;
  slides: Slide[];
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// ── Constants ──

const ASPECT_RATIOS = [
  { id: 'ig-portrait', label: '인스타 피드 (세로)', ratio: '4:5', width: 1080, height: 1350, platform: 'Instagram' },
  { id: 'ig-square', label: '인스타 피드', ratio: '1:1', width: 1080, height: 1080, platform: 'Instagram' },
  { id: 'ig-story', label: '스토리 / 릴스', ratio: '9:16', width: 1080, height: 1920, platform: 'Instagram' },
  { id: 'x-feed', label: 'X (Twitter)', ratio: '16:9', width: 1200, height: 675, platform: 'X' },
  { id: 'yt-thumb', label: 'YouTube 썸네일', ratio: '16:9', width: 1280, height: 720, platform: 'YouTube' },
  { id: 'naver-blog', label: '네이버 블로그', ratio: '3:4', width: 900, height: 1200, platform: 'Naver' },
  { id: 'linkedin', label: 'LinkedIn', ratio: '1:1', width: 1080, height: 1080, platform: 'LinkedIn' },
] as const;

const SLIDE_COUNTS = [5, 7, 10] as const;

const PLATFORM_COLORS: Record<string, string> = {
  Instagram: '#E4405F',
  X: '#000000',
  YouTube: '#FF0000',
  Naver: '#03C75A',
  LinkedIn: '#0A66C2',
};

type Step = 'input' | 'plan' | 'production';

// ── Design System Tokens ──

const C = {
  primary: '#48b2af',
  primaryDark: '#41a09e',
  primaryPressed: '#389998',
  primaryLight: '#f0f8f8',
  primaryTint: '#E4F7F7',
  surface: '#ffffff',
  surfaceDisabled: '#f8f8f8',
  surfaceSecondary: '#f9f9f9',
  surfaceTertiary: '#f3f3f3',
  surfaceInput: '#f3f3f5',
  borderDefault: '#e7e7e7',
  borderDivider: '#f3f3f3',
  textPrimary: '#151515',
  textBlack: '#000000',
  textSecondary: '#525252',
  textTertiary: '#6d6d6d',
  textCaption: '#848484',
  textDisabled: '#b7b7b7',
  textWhite: '#ffffff',
  destructive: '#d4183d',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

const font = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

// ── Main Page ──

export default function CardNewsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('input');
  const [topic, setTopic] = useState(searchParams.get('topic') || '');
  const [slideCount, setSlideCount] = useState<number>(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<SlideResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Plan revision chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Production step
  const [selectedRatio, setSelectedRatio] = useState<string>('ig-portrait');
  const [images, setImages] = useState<Record<number, string>>({});
  const [imageGenerating, setImageGenerating] = useState<number | null>(null);
  const [imageProgress, setImageProgress] = useState(0);
  const [coverApproved, setCoverApproved] = useState(false);
  const coverBase64Ref = useRef<string | null>(null);
  const [imageMode, setImageMode] = useState<'unsplash' | 'ai'>('unsplash');
  const [unsplashCredits, setUnsplashCredits] = useState<Record<number, UnsplashPhoto>>({});
  const unsplashPageRef = useRef<Record<number, number>>({});
  const slideRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const selectedAspect = ASPECT_RATIOS.find(r => r.id === selectedRatio)!;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── Helper: call edge function ──

  const callEdgeFunction = async (name: string, body: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `${name} 호출 실패`);
    return data;
  };

  const callStockImageSearch = async (params: URLSearchParams) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/search-stock-image?${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '이미지 검색 실패');
    return data as UnsplashPhoto;
  };

  // ── Step 1: Generate plan ──

  const handleGeneratePlan = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setChatMessages([]);

    try {
      const data = await callEdgeFunction('generate-card-news', {
        topic: topic.trim(),
        slideCount,
        ratio: { id: 'ig-portrait', label: '인스타 피드 (세로)', width: 1080, height: 1350 },
      });
      setResult(data);
      setStep('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Step 2: Revise plan via chat ──

  const handleRevise = async () => {
    if (!chatInput.trim() || !result) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsRevising(true);
    setError(null);

    try {
      const currentPlan = JSON.stringify(result, null, 2);
      const data = await callEdgeFunction('generate-card-news', {
        topic: `기존 기획안:\n${currentPlan}\n\n수정 요청: ${userMsg}\n\n위 기획안을 수정 요청에 맞게 수정해줘. 슬라이드 수는 ${result.slides.length}장 유지.`,
        slideCount: result.slides.length,
        ratio: { id: 'ig-portrait', label: '인스타 피드 (세로)', width: 1080, height: 1350 },
      });
      setResult(data);
      setChatMessages(prev => [...prev, { role: 'assistant', content: '기획안을 수정했습니다. 확인해주세요!' }]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '오류';
      setChatMessages(prev => [...prev, { role: 'assistant', content: `수정 실패: ${errMsg}` }]);
      setError(errMsg);
    } finally {
      setIsRevising(false);
    }
  };

  // ── Step 3: Generate cover image ──

  const generateCoverImage = useCallback(async (regenerate = false) => {
    if (!result) return;
    setError(null);
    const cover = result.slides[0];
    setImageGenerating(cover.slide_number);

    const payload: Record<string, unknown> = {
      aspect_ratio: selectedAspect.ratio,
    };

    if (regenerate) {
      payload.slide_context = { headline: cover.headline, body: cover.subtext || '', type: cover.type, topic };
    } else {
      payload.image_prompt = cover.image_prompt;
    }

    try {
      const data = await callEdgeFunction('generate-card-image', payload);
      coverBase64Ref.current = data.image;
      setImages(prev => ({ ...prev, [cover.slide_number]: `data:${data.mimeType};base64,${data.image}` }));
    } catch (err) {
      setError(`커버 이미지 실패: ${err instanceof Error ? err.message : '오류'}`);
    } finally {
      setImageGenerating(null);
    }
  }, [result, selectedAspect, topic]);

  // ── Step 3b: Generate remaining images ──

  const generateRemainingImages = useCallback(async () => {
    if (!result || !coverBase64Ref.current) return;
    setError(null);
    setCoverApproved(true);

    const remaining = result.slides.slice(1);
    const BATCH_SIZE = 3;

    for (let batchStart = 0; batchStart < remaining.length; batchStart += BATCH_SIZE) {
      const batch = remaining.slice(batchStart, batchStart + BATCH_SIZE);
      setImageGenerating(batch[0].slide_number);
      setImageProgress(batchStart);

      const results = await Promise.allSettled(
        batch.map(async (slide) => {
          const data = await callEdgeFunction('generate-card-image', {
            image_prompt: slide.image_prompt,
            aspect_ratio: selectedAspect.ratio,
            reference_image: coverBase64Ref.current,
          });
          return { slideNumber: slide.slide_number, dataUrl: `data:${data.mimeType};base64,${data.image}` };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          setImages(prev => ({ ...prev, [r.value.slideNumber]: r.value.dataUrl }));
        } else {
          setError(`이미지 실패: ${r.reason instanceof Error ? r.reason.message : '오류'}`);
        }
      }

      if (batchStart + BATCH_SIZE < remaining.length) await new Promise(r => setTimeout(r, 5000));
    }

    setImageGenerating(null);
    setImageProgress(remaining.length);
  }, [result, selectedAspect]);

  // ── Unsplash image helpers ──

  const ratioToOrientation = (ratio: string) => {
    if (ratio === '1:1') return 'squarish';
    const [w, h] = ratio.split(':').map(Number);
    return w > h ? 'landscape' : 'portrait';
  };

  const fetchUnsplashImage = useCallback(async (slide: Slide, pageNum = 1) => {
    const keyword = slide.search_keyword || slide.image_prompt.split(',')[0].trim();
    const orientation = ratioToOrientation(selectedAspect.ratio);

    let params = new URLSearchParams({ query: keyword, page: String(pageNum), orientation });
    try { return await callStockImageSearch(params); } catch { /* fallback */ }

    params = new URLSearchParams({ query: keyword, page: String(pageNum) });
    try { return await callStockImageSearch(params); } catch { /* fallback */ }

    const simpleKeyword = keyword.split(' ')[0];
    if (simpleKeyword !== keyword) {
      params = new URLSearchParams({ query: simpleKeyword, page: String(pageNum) });
      return await callStockImageSearch(params);
    }

    throw new Error('이미지 검색 실패');
  }, [selectedAspect]);

  const generateCoverUnsplash = useCallback(async () => {
    if (!result) return;
    setError(null);
    const cover = result.slides[0];
    setImageGenerating(cover.slide_number);
    unsplashPageRef.current[1] = (unsplashPageRef.current[1] || 0) + 1;

    try {
      const photo = await fetchUnsplashImage(cover, unsplashPageRef.current[1]);
      setImages(prev => ({ ...prev, [cover.slide_number]: photo.url }));
      setUnsplashCredits(prev => ({ ...prev, [cover.slide_number]: photo }));
    } catch (err) {
      setError(`커버 이미지 실패: ${err instanceof Error ? err.message : '오류'}`);
    } finally {
      setImageGenerating(null);
    }
  }, [result, fetchUnsplashImage]);

  const generateRemainingUnsplash = useCallback(async () => {
    if (!result) return;
    setError(null);
    setCoverApproved(true);

    const keywordPageMap: Record<string, number> = {};
    const coverKw = result.slides[0].search_keyword || result.slides[0].image_prompt.split(',')[0].trim();
    keywordPageMap[coverKw] = unsplashPageRef.current[1] || 1;

    const remaining = result.slides.slice(1);

    // 키워드 페이지 맵 미리 계산
    for (const slide of remaining) {
      const kw = slide.search_keyword || slide.image_prompt.split(',')[0].trim();
      keywordPageMap[kw] = (keywordPageMap[kw] || 0) + 1;
    }

    // 3개씩 병렬 검색
    const BATCH_SIZE = 3;
    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
      const batch = remaining.slice(i, Math.min(i + BATCH_SIZE, remaining.length));
      setImageGenerating(batch[0].slide_number);
      setImageProgress(i);

      const results = await Promise.allSettled(
        batch.map(async (slide) => {
          const kw = slide.search_keyword || slide.image_prompt.split(',')[0].trim();
          const photo = await fetchUnsplashImage(slide, keywordPageMap[kw]);
          return { slideNumber: slide.slide_number, photo };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { slideNumber, photo } = r.value;
          setImages(prev => ({ ...prev, [slideNumber]: photo.url }));
          setUnsplashCredits(prev => ({ ...prev, [slideNumber]: photo }));
        } else {
          setError(`이미지 검색 실패: ${r.reason instanceof Error ? r.reason.message : '오류'}`);
        }
      }
    }

    setImageGenerating(null);
    setImageProgress(remaining.length);
  }, [result, fetchUnsplashImage]);

  const regenerateSlideImage = useCallback(async (slide: Slide) => {
    if (imageGenerating !== null) return;
    setImageGenerating(slide.slide_number);
    setError(null);

    try {
      if (imageMode === 'unsplash') {
        unsplashPageRef.current[slide.slide_number] = (unsplashPageRef.current[slide.slide_number] || 0) + 1;
        const photo = await fetchUnsplashImage(slide, unsplashPageRef.current[slide.slide_number]);
        setImages(prev => ({ ...prev, [slide.slide_number]: photo.url }));
        setUnsplashCredits(prev => ({ ...prev, [slide.slide_number]: photo }));
      } else {
        const payload: Record<string, unknown> = {
          slide_context: { headline: slide.headline, body: slide.body || slide.subtext || '', type: slide.type, topic },
          aspect_ratio: selectedAspect.ratio,
          ...(slide.slide_number !== 1 && coverBase64Ref.current ? { reference_image: coverBase64Ref.current } : {}),
        };
        const data = await callEdgeFunction('generate-card-image', payload);
        if (slide.slide_number === 1) coverBase64Ref.current = data.image;
        setImages(prev => ({ ...prev, [slide.slide_number]: `data:${data.mimeType};base64,${data.image}` }));
      }
    } catch (err) {
      setError(`${slide.slide_number}장 재생성 실패: ${err instanceof Error ? err.message : '오류'}`);
    } finally {
      setImageGenerating(null);
    }
  }, [imageMode, imageGenerating, fetchUnsplashImage, selectedAspect, topic]);

  const hasCoverImage = images[1] !== undefined;
  const allImagesReady = result ? Object.keys(images).length === result.slides.length : false;

  const handleDownloadAll = useCallback(async () => {
    if (!result) return;
    const zip = new JSZip();
    const title = result.title.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim().slice(0, 30) || 'card-news';

    for (const slide of result.slides) {
      const el = slideRefs.current[slide.slide_number];
      if (!el) continue;
      try {
        const dataUrl = await toPng(el, {
          pixelRatio: 2,
          cacheBust: true,
          style: { border: 'none' },
          filter: (node: HTMLElement) => !(node instanceof HTMLElement && (node.classList.contains('slide-ui-only') || node.classList.contains('slide-regen-btn'))),
        });
        const base64 = dataUrl.split(',')[1];
        zip.file(`${slide.slide_number}.png`, base64, { base64: true });
      } catch {
        const src = images[slide.slide_number];
        if (src) {
          const res = await fetch(src);
          zip.file(`${slide.slide_number}.jpg`, await res.blob());
        }
      }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = `${title}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [result, images]);

  const resetAll = () => {
    setStep('input');
    setTopic('');
    setSlideCount(5);
    setResult(null);
    setError(null);
    setChatMessages([]);
    setChatInput('');
    setImages({});
    setImageGenerating(null);
    setImageProgress(0);
    setCoverApproved(false);
    setImageMode('unsplash');
    setUnsplashCredits({});
    coverBase64Ref.current = null;
    unsplashPageRef.current = {};
  };

  // ── CTA Button helper ──
  const ctaButton = (label: string, onClick: () => void, disabled: boolean, variant: 'primary' | 'secondary' | 'green' = 'primary') => {
    const bg = disabled ? C.surfaceDisabled : variant === 'green' ? C.primary : C.primary;
    const color = disabled ? C.textDisabled : C.textWhite;
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full flex items-center justify-center"
        style={{
          height: '56px', borderRadius: '16px', backgroundColor: bg,
          border: 'none', transition: 'all 0.15s ease', cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onPointerDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.99)'; }}
        onPointerUp={e => { e.currentTarget.style.transform = ''; }}
        onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
      >
        <span style={{
          fontFamily: font, fontSize: '16px', fontWeight: 500,
          lineHeight: '25px', letterSpacing: '-0.32px', color,
        }}>
          {label}
        </span>
      </button>
    );
  };

  // ── Render ──

  return (
    <div className="bg-white relative min-h-screen w-full flex justify-center">
      <div className="w-full max-w-[440px] relative pb-[140px]" style={{ fontFamily: font }}>

        {/* ── NavigationHeader ── */}
        <div className="bg-white h-[52px] shrink-0 w-full z-20 fixed top-0 left-1/2 -translate-x-1/2 max-w-[440px]">
          <div className="flex flex-col justify-center size-full">
            <div className="content-stretch flex items-center justify-between px-[12px] py-[4px] relative size-full">
              <ArrowLeft onClick={() => navigate(-1)} />
              <p style={{
                fontFamily: font, fontSize: '18px', fontWeight: 600,
                lineHeight: '25.5px', letterSpacing: '-0.36px',
                color: C.textBlack, textAlign: 'center',
              }}>
                {step === 'input' ? 'AI 카드뉴스' : step === 'plan' ? '기획안 검토' : coverApproved ? '카드뉴스 제작' : '커버 이미지'}
              </p>
              <div className="w-[44px]" />
            </div>
          </div>
        </div>

        {/* 헤더 높이 여백 */}
        <div className="h-[60px]" />

        {/* ── Main Content ── */}
        <div style={{ padding: '0 20px' }}>

          {/* ════ STEP 1: Input ════ */}
          {step === 'input' && (
            <>
              {/* Title */}
              <div style={{ marginBottom: '28px', marginTop: '8px' }}>
                <h1 style={{
                  fontFamily: font, fontSize: '22px', fontWeight: 600,
                  lineHeight: '32.5px', letterSpacing: '-0.22px',
                  color: C.textPrimary, margin: 0,
                }}>
                  AI 카드뉴스 메이커
                </h1>
                <p style={{
                  fontFamily: font, fontSize: '15px', fontWeight: 400,
                  lineHeight: '20px', letterSpacing: '-0.45px',
                  color: C.textTertiary, marginTop: '8px',
                }}>
                  주제를 입력하면 AI가 카드뉴스를 만들어드려요
                </p>
              </div>

              {/* Topic */}
              <section style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '8px',
                }}>
                  주제
                </label>
                <div
                  className="w-full"
                  style={{
                    backgroundColor: C.surface, border: `1px solid ${C.borderDefault}`,
                    borderRadius: '16px', padding: '12px',
                  }}
                >
                  <textarea
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="예: 2026년 직장인 부업 트렌드 TOP 5"
                    rows={4}
                    className="w-full outline-none bg-transparent resize-none"
                    style={{
                      fontFamily: font, fontSize: '15px', fontWeight: 400,
                      lineHeight: '20px', letterSpacing: '-0.45px',
                      color: C.textPrimary, border: 'none',
                    }}
                  />
                </div>
              </section>

              {/* Slide Count */}
              <section style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  슬라이드 수
                </label>
                <div className="flex" style={{ gap: '10px' }}>
                  {SLIDE_COUNTS.map(count => {
                    const isSelected = slideCount === count;
                    return (
                      <button
                        key={count}
                        onClick={() => setSlideCount(count)}
                        className="flex-1 flex items-center justify-center"
                        style={{
                          height: '48px', borderRadius: '16px',
                          fontFamily: font, fontSize: '15px', fontWeight: isSelected ? 600 : 400,
                          letterSpacing: '-0.3px',
                          color: isSelected ? C.textWhite : C.textTertiary,
                          backgroundColor: isSelected ? C.primary : C.surface,
                          border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                        onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                        onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                        onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                      >
                        {count}장
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Generate Plan CTA */}
              {ctaButton(
                isGenerating ? '기획안 생성 중...' : '기획안 생성하기',
                handleGeneratePlan,
                !topic.trim() || isGenerating,
              )}
            </>
          )}

          {/* ════ STEP 2: Plan Review + Chat ════ */}
          {step === 'plan' && result && (
            <>
              {/* Plan Title Card */}
              <div style={{
                padding: '16px 20px', backgroundColor: C.primaryLight, borderRadius: '16px',
                marginBottom: '20px', marginTop: '8px',
              }}>
                <div style={{
                  fontFamily: font, fontSize: '16px', fontWeight: 600,
                  lineHeight: '25px', letterSpacing: '-0.32px', color: C.primaryDark,
                }}>
                  {result.title}
                </div>
                <div style={{
                  fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', color: C.textCaption, marginTop: '4px',
                }}>
                  {result.slides.length}장 슬라이드
                </div>
              </div>

              {/* Slide List */}
              <div className="flex flex-col" style={{ gap: '8px', marginBottom: '24px' }}>
                {result.slides.map(slide => (
                  <div
                    key={slide.slide_number}
                    className="flex items-start"
                    style={{
                      padding: '14px 16px', backgroundColor: C.surfaceSecondary,
                      borderRadius: '16px', border: `1px solid ${C.borderDivider}`,
                      gap: '12px',
                    }}
                  >
                    <div className="flex items-center justify-center shrink-0" style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      backgroundColor: slide.type === 'cover' ? C.primary : slide.type === 'cta' ? C.primaryDark : C.surfaceTertiary,
                      color: slide.type === 'content' ? C.textTertiary : C.textWhite,
                      fontFamily: font, fontSize: '12px', fontWeight: 700,
                    }}>
                      {slide.slide_number}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center" style={{ gap: '6px', marginBottom: '4px' }}>
                        <span style={{
                          fontFamily: font, fontSize: '10px', fontWeight: 600,
                          textTransform: 'uppercase' as const, padding: '1px 4px', borderRadius: '4px',
                          backgroundColor: slide.type === 'cover' ? C.primaryTint : slide.type === 'cta' ? C.primaryLight : C.surfaceTertiary,
                          color: slide.type === 'cover' ? C.primary : slide.type === 'cta' ? C.primaryDark : C.textCaption,
                        }}>
                          {slide.type}
                        </span>
                      </div>
                      <div style={{
                        fontFamily: font, fontSize: '15px', fontWeight: 500,
                        lineHeight: '20px', letterSpacing: '-0.45px', color: C.textPrimary,
                      }}>
                        {slide.headline}
                      </div>
                      {(slide.subtext || slide.body) && (
                        <div style={{
                          fontFamily: font, fontSize: '13px', fontWeight: 400,
                          lineHeight: '20px', color: C.textCaption, marginTop: '4px',
                        }}>
                          {slide.subtext || slide.body}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat Messages */}
              {chatMessages.length > 0 && (
                <div style={{
                  backgroundColor: C.surfaceTertiary, borderRadius: '16px',
                  padding: '16px', marginBottom: '16px', maxHeight: '200px', overflow: 'auto',
                }}>
                  {chatMessages.map((msg, i) => (
                    <div key={i} className="flex flex-col" style={{
                      marginBottom: i < chatMessages.length - 1 ? '12px' : 0,
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}>
                      <div style={{
                        padding: '8px 12px', borderRadius: '12px',
                        fontFamily: font, fontSize: '13px', fontWeight: 400,
                        lineHeight: '20px', maxWidth: '85%',
                        backgroundColor: msg.role === 'user' ? C.primary : C.surface,
                        color: msg.role === 'user' ? C.textWhite : C.textPrimary,
                        border: msg.role === 'assistant' ? `1px solid ${C.borderDefault}` : 'none',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Revision Input */}
              <div className="flex" style={{ gap: '8px', marginBottom: '20px' }}>
                <div className="flex-1 flex items-center" style={{
                  height: '48px', backgroundColor: C.surface,
                  border: `1px solid ${C.borderDefault}`, borderRadius: '16px', padding: '0 12px',
                }}>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRevise(); } }}
                    placeholder="수정 요청을 입력하세요"
                    disabled={isRevising}
                    className="w-full outline-none bg-transparent"
                    style={{
                      fontFamily: font, fontSize: '15px', fontWeight: 400,
                      lineHeight: '20px', letterSpacing: '-0.45px', color: C.textPrimary,
                    }}
                  />
                </div>
                <button
                  onClick={handleRevise}
                  disabled={!chatInput.trim() || isRevising}
                  className="flex items-center justify-center shrink-0"
                  style={{
                    height: '48px', padding: '0 16px', borderRadius: '16px',
                    fontFamily: font, fontSize: '15px', fontWeight: 500,
                    letterSpacing: '-0.45px',
                    backgroundColor: !chatInput.trim() || isRevising ? C.surfaceDisabled : C.primary,
                    color: !chatInput.trim() || isRevising ? C.textDisabled : C.textWhite,
                    border: 'none', cursor: !chatInput.trim() || isRevising ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onPointerDown={e => { if (chatInput.trim() && !isRevising) e.currentTarget.style.transform = 'scale(0.99)'; }}
                  onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                  onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                >
                  {isRevising ? '수정 중...' : '수정'}
                </button>
              </div>

              {/* Proceed to Production & Back */}
              <div className="flex" style={{ gap: '10px' }}>
                <button
                  onClick={() => { setStep('input'); setResult(null); }}
                  className="shrink-0 flex items-center justify-center"
                  style={{
                    height: '56px', width: '80px', borderRadius: '16px',
                    backgroundColor: C.primaryLight, border: 'none', cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                  onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                  onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                >
                  <span style={{
                    fontFamily: font, fontSize: '13px', fontWeight: 500,
                    color: C.primary,
                  }}>처음으로</span>
                </button>
                <button
                  onClick={() => { setStep('production'); setImages({}); setImageProgress(0); setCoverApproved(false); coverBase64Ref.current = null; setUnsplashCredits({}); unsplashPageRef.current = {}; setImageMode('unsplash'); }}
                  className="flex-1 flex items-center justify-center"
                  style={{
                    height: '56px', borderRadius: '16px',
                    backgroundColor: C.primary, border: 'none', cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                  onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                  onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                >
                  <span style={{
                    fontFamily: font, fontSize: '16px', fontWeight: 500,
                    lineHeight: '25px', letterSpacing: '-0.32px', color: C.textWhite,
                  }}>이 기획안으로 제작하기</span>
                </button>
              </div>
            </>
          )}

          {/* ════ STEP 3: Production ════ */}
          {step === 'production' && result && (
            <>
              {/* Subtitle */}
              <div style={{ marginTop: '8px', marginBottom: '20px' }}>
                <p style={{
                  fontFamily: font, fontSize: '15px', fontWeight: 400,
                  lineHeight: '20px', letterSpacing: '-0.45px', color: C.textTertiary,
                }}>
                  {coverApproved
                    ? '커버 스타일 기반으로 나머지 이미지를 생성합니다'
                    : '화면 비율을 선택하고 커버 이미지를 먼저 확인하세요'}
                </p>
              </div>

              {/* Aspect Ratio */}
              {!coverApproved && (
                <section style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                    lineHeight: '16px', letterSpacing: '-0.24px',
                    color: C.textCaption, marginBottom: '10px',
                  }}>
                    화면 비율
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {ASPECT_RATIOS.map(r => {
                      const isSelected = selectedRatio === r.id;
                      const pc = PLATFORM_COLORS[r.platform];
                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedRatio(r.id)}
                          disabled={hasCoverImage}
                          className="flex flex-col items-center"
                          style={{
                            gap: '6px', padding: '10px 4px',
                            border: isSelected ? `2px solid ${pc}` : `1px solid ${C.borderDefault}`,
                            borderRadius: '12px',
                            backgroundColor: isSelected ? `${pc}08` : C.surface,
                            cursor: hasCoverImage ? 'default' : 'pointer',
                            opacity: hasCoverImage && !isSelected ? 0.4 : 1,
                          }}
                        >
                          <div style={{
                            width: r.width > r.height ? 32 : 32 * (r.width / r.height),
                            height: r.height > r.width ? 32 : 32 * (r.height / r.width),
                            border: `2px solid ${isSelected ? pc : C.borderDefault}`,
                            borderRadius: '3px',
                            backgroundColor: isSelected ? `${pc}15` : C.surfaceTertiary,
                          }} />
                          <div style={{ textAlign: 'center' }}>
                            <div style={{
                              fontFamily: font, fontSize: '11px', fontWeight: 600,
                              color: isSelected ? pc : C.textPrimary,
                            }}>{r.label}</div>
                            <div style={{
                              fontFamily: font, fontSize: '10px', fontWeight: 400,
                              color: C.textCaption, marginTop: '1px',
                            }}>{r.ratio}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Phase 1: Cover Preview ── */}
              {!coverApproved && (
                <>
                  <div className="flex justify-center" style={{ marginBottom: '20px' }}>
                    <div className="w-full transform-gpu" style={{
                      maxWidth: '360px',
                      aspectRatio: `${selectedAspect.width} / ${selectedAspect.height}`,
                      borderRadius: '16px', overflow: 'hidden', position: 'relative',
                      background: images[1]
                        ? undefined
                        : `linear-gradient(135deg, ${result.slides[0].color_scheme}CC, ${result.slides[0].color_scheme}40)`,
                      border: `1px solid ${C.borderDefault}`,
                    }}>
                      {images[1] && (
                        <img src={images[1]} alt="cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      {imageGenerating === 1 && (
                        <div className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }}>
                          <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: '10px', left: '10px' }}>
                        <span style={{
                          fontFamily: font, fontSize: '10px', fontWeight: 600,
                          padding: '3px 8px', borderRadius: '4px',
                          backgroundColor: 'rgba(0,0,0,0.5)', color: C.textWhite,
                          textTransform: 'uppercase',
                        }}>cover</span>
                      </div>
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%', background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.75) 100%)', pointerEvents: 'none' }} />
                      <div style={{ position: 'absolute', bottom: '12%', left: 0, right: 0, padding: '0 20px', color: C.textWhite }}>
                        <div style={{
                          fontFamily: font,
                          fontSize: result.slides[0].headline.length > 12 ? '22px' : '28px',
                          fontWeight: 800, lineHeight: '1.25', letterSpacing: '-0.02em',
                          wordBreak: 'keep-all', textShadow: '0 2px 6px rgba(0,0,0,0.7)',
                        }}>{result.slides[0].headline}</div>
                        {result.slides[0].subtext && (
                          <div style={{
                            fontFamily: font, fontSize: '14px', fontWeight: 500,
                            marginTop: '10px', opacity: 0.85, textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                          }}>{result.slides[0].subtext}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cover action buttons */}
                  {!hasCoverImage ? (
                    <div className="flex flex-col" style={{ gap: '8px' }}>
                      {ctaButton(
                        imageGenerating !== null && imageMode === 'unsplash' ? '이미지 검색 중...' : '커버 이미지 생성',
                        () => { setImageMode('unsplash'); generateCoverUnsplash(); },
                        imageGenerating !== null,
                      )}
                      <button
                        onClick={() => { setImageMode('ai'); generateCoverImage(); }}
                        disabled={imageGenerating !== null}
                        className="w-full flex items-center justify-center"
                        style={{
                          height: '40px', background: 'none', border: 'none',
                          fontFamily: font, fontSize: '13px', fontWeight: 400,
                          color: C.textCaption, cursor: imageGenerating !== null ? 'not-allowed' : 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {imageGenerating !== null && imageMode === 'ai' ? 'AI 이미지 생성 중...' : '또는 AI로 이미지 생성'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col" style={{ gap: '8px' }}>
                      {imageMode === 'unsplash' && unsplashCredits[1] && (
                        <div style={{
                          fontFamily: font, fontSize: '11px', fontWeight: 400,
                          color: C.textCaption, textAlign: 'center',
                        }}>
                          Photo by{' '}
                          <a href={`${unsplashCredits[1].photographer_url}?utm_source=nadaunse&utm_medium=referral`} target="_blank" rel="noopener noreferrer" style={{ color: C.textTertiary }}>{unsplashCredits[1].photographer}</a>
                          {' '}on{' '}
                          <a href={unsplashCredits[1].source === 'pexels' ? 'https://www.pexels.com' : 'https://unsplash.com/?utm_source=nadaunse&utm_medium=referral'} target="_blank" rel="noopener noreferrer" style={{ color: C.textTertiary }}>
                            {unsplashCredits[1].source === 'pexels' ? 'Pexels' : 'Unsplash'}
                          </a>
                        </div>
                      )}
                      <div className="flex" style={{ gap: '10px' }}>
                        <button
                          onClick={() => {
                            if (imageMode === 'unsplash') { generateCoverUnsplash(); }
                            else { coverBase64Ref.current = null; generateCoverImage(true); }
                          }}
                          disabled={imageGenerating !== null}
                          className="shrink-0 flex items-center justify-center"
                          style={{
                            height: '56px', width: '100px', borderRadius: '16px', gap: '4px',
                            backgroundColor: C.primaryLight, border: 'none',
                            cursor: imageGenerating !== null ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onPointerDown={e => { if (imageGenerating === null) e.currentTarget.style.transform = 'scale(0.99)'; }}
                          onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                          onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 105.64-11.36L3 10" />
                          </svg>
                          <span style={{
                            fontFamily: font, fontSize: '13px', fontWeight: 500, color: C.primary,
                          }}>
                            {imageGenerating !== null ? '생성 중' : '다시 생성'}
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            if (imageMode === 'unsplash') generateRemainingUnsplash();
                            else generateRemainingImages();
                          }}
                          disabled={imageGenerating !== null}
                          className="flex-1 flex items-center justify-center"
                          style={{
                            height: '56px', borderRadius: '16px',
                            backgroundColor: imageGenerating !== null ? C.surfaceDisabled : C.primary,
                            color: imageGenerating !== null ? C.textDisabled : C.textWhite,
                            border: 'none', cursor: imageGenerating !== null ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                          onPointerDown={e => { if (imageGenerating === null) e.currentTarget.style.transform = 'scale(0.99)'; }}
                          onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                          onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                        >
                          <span style={{
                            fontFamily: font, fontSize: '16px', fontWeight: 500,
                            lineHeight: '25px', letterSpacing: '-0.32px',
                          }}>이 스타일로 전체 제작</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Phase 2: Full production ── */}
              {coverApproved && (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, minmax(${selectedAspect.width >= selectedAspect.height ? 180 : 140}px, 1fr))`,
                    gap: '8px', marginBottom: '20px',
                  }}>
                    {result.slides.map(slide => {
                      const imgSrc = images[slide.slide_number];
                      const isThisGen = imageGenerating === slide.slide_number;
                      return (
                        <div
                          key={slide.slide_number}
                          ref={el => { slideRefs.current[slide.slide_number] = el; }}
                          className="slide-card transform-gpu"
                          style={{
                            width: '100%', aspectRatio: `${selectedAspect.width} / ${selectedAspect.height}`,
                            borderRadius: '12px', overflow: 'hidden', position: 'relative',
                            background: imgSrc ? undefined : `linear-gradient(135deg, ${slide.color_scheme}CC, ${slide.color_scheme}40)`,
                            border: `1px solid ${C.borderDivider}`,
                          }}
                        >
                          {imgSrc && (
                            <img src={imgSrc} alt={`slide ${slide.slide_number}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                          )}
                          {isThisGen && (
                            <div className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }}>
                              <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.3)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            </div>
                          )}
                          <div className="slide-ui-only flex items-center justify-center" style={{
                            position: 'absolute', top: '6px', left: '6px', width: '22px', height: '22px',
                            borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.5)', color: C.textWhite,
                            fontFamily: font, fontSize: '10px', fontWeight: 700,
                          }}>
                            {slide.slide_number}
                          </div>
                          {imgSrc && !isThisGen && (
                            <button
                              className="slide-regen-btn flex items-center justify-center"
                              onClick={() => regenerateSlideImage(slide)}
                              disabled={imageGenerating !== null}
                              title="이미지 재생성"
                              style={{
                                position: 'absolute', top: '6px', right: '6px', width: '28px', height: '28px',
                                borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.55)', border: 'none',
                                cursor: imageGenerating !== null ? 'not-allowed' : 'pointer',
                                opacity: 0, transition: 'opacity 0.2s',
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 105.64-11.36L3 10" />
                              </svg>
                            </button>
                          )}

                          {/* Cover overlay */}
                          {slide.type === 'cover' && (
                            <>
                              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%', background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.75) 100%)', pointerEvents: 'none' }} />
                              <div style={{ position: 'absolute', bottom: '12%', left: 0, right: 0, padding: '0 12px', color: C.textWhite }}>
                                <div style={{ fontFamily: font, fontSize: slide.headline.length > 12 ? '13px' : '15px', fontWeight: 800, lineHeight: '1.2', letterSpacing: '-0.02em', wordBreak: 'keep-all', textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}>{slide.headline}</div>
                                {slide.subtext && (
                                  <div style={{ fontFamily: font, fontSize: '9px', fontWeight: 500, marginTop: '4px', opacity: 0.85, textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>{slide.subtext}</div>
                                )}
                              </div>
                            </>
                          )}

                          {/* Content overlay */}
                          {slide.type === 'content' && (
                            <div className="flex flex-col" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                              <div style={{ flex: '1 1 65%' }} />
                              <div className="flex flex-col justify-center" style={{ flex: '0 0 35%', backgroundColor: 'rgba(0,0,0,0.65)', padding: '8px 12px' }}>
                                <div style={{ fontFamily: font, fontSize: slide.headline.length > 12 ? '9px' : '10px', fontWeight: 700, lineHeight: '1.3', color: C.textWhite, marginBottom: '4px', wordBreak: 'keep-all' }}>
                                  {slide.headline}
                                </div>
                                {slide.body && (
                                  <div style={{ fontFamily: font, fontSize: slide.body.length > 100 ? '6.5px' : '7px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.6' }}>
                                    {slide.body}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* CTA overlay */}
                          {slide.type === 'cta' && (
                            <div className="flex flex-col items-center justify-center" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: '16px', textAlign: 'center', pointerEvents: 'none' }}>
                              <div style={{ fontFamily: font, fontSize: slide.headline.length > 12 ? '14px' : '16px', fontWeight: 800, color: C.textWhite, lineHeight: '1.3', letterSpacing: '-0.01em', wordBreak: 'keep-all' }}>
                                {slide.headline}
                              </div>
                              {slide.subtext && (
                                <div style={{ fontFamily: font, fontSize: '10px', fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginTop: '8px' }}>
                                  {slide.subtext}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Progress / Download */}
                  {!allImagesReady ? (
                    <div className="w-full flex items-center justify-center" style={{
                      height: '56px', borderRadius: '16px',
                      backgroundColor: C.surfaceDisabled,
                    }}>
                      <span style={{
                        fontFamily: font, fontSize: '16px', fontWeight: 500,
                        lineHeight: '25px', letterSpacing: '-0.32px', color: C.textDisabled,
                      }}>
                        {imageGenerating !== null
                          ? `이미지 생성 중... (${imageProgress + 2}/${result.slides.length})`
                          : `생성 완료 ${Object.keys(images).length}/${result.slides.length}`
                        }
                      </span>
                    </div>
                  ) : (
                    ctaButton(
                      `전체 다운로드 (${result.slides.length}장)`,
                      handleDownloadAll,
                      false,
                    )
                  )}

                  {allImagesReady && (
                    <button
                      onClick={resetAll}
                      className="w-full flex items-center justify-center"
                      style={{
                        height: '56px', marginTop: '10px', borderRadius: '16px',
                        backgroundColor: C.primaryLight, border: 'none', cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.99)'; }}
                      onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                      onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                    >
                      <span style={{
                        fontFamily: font, fontSize: '16px', fontWeight: 500, color: C.primary,
                      }}>새 카드뉴스 만들기</span>
                    </button>
                  )}

                  {/* Progress Bar */}
                  {imageGenerating !== null && (
                    <div style={{ marginTop: '10px', height: '4px', backgroundColor: C.surfaceTertiary, borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', backgroundColor: C.primary, width: `${((imageProgress + 2) / result.slides.length) * 100}%`, transition: 'width 0.5s ease' }} />
                    </div>
                  )}

                  {/* Unsplash credits */}
                  {imageMode === 'unsplash' && Object.keys(unsplashCredits).length > 0 && allImagesReady && (() => {
                    const credits = Object.values(unsplashCredits);
                    const unsplashPhotos = credits.filter(c => c.source !== 'pexels');
                    const pexelsPhotos = credits.filter(c => c.source === 'pexels');
                    return (
                      <div style={{
                        marginTop: '16px', padding: '12px 16px', backgroundColor: C.surfaceSecondary,
                        borderRadius: '12px', fontFamily: font, fontSize: '11px', fontWeight: 400,
                        color: C.textCaption, lineHeight: '1.8',
                      }}>
                        {unsplashPhotos.length > 0 && (<>
                          Photos by{' '}
                          {unsplashPhotos.map((c, i, arr) => (
                            <span key={c.id}>
                              <a href={`${c.photographer_url}?utm_source=nadaunse&utm_medium=referral`} target="_blank" rel="noopener noreferrer" style={{ color: C.textTertiary }}>{c.photographer}</a>
                              {i < arr.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                          {' '}on <a href="https://unsplash.com/?utm_source=nadaunse&utm_medium=referral" target="_blank" rel="noopener noreferrer" style={{ color: C.textTertiary }}>Unsplash</a>
                        </>)}
                        {unsplashPhotos.length > 0 && pexelsPhotos.length > 0 && ' · '}
                        {pexelsPhotos.length > 0 && (<>
                          Photos by{' '}
                          {pexelsPhotos.map((c, i, arr) => (
                            <span key={c.id}>
                              <a href={c.photographer_url} target="_blank" rel="noopener noreferrer" style={{ color: C.textTertiary }}>{c.photographer}</a>
                              {i < arr.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                          {' '}on <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" style={{ color: C.textTertiary }}>Pexels</a>
                        </>)}
                      </div>
                    );
                  })()}
                </>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: '16px', padding: '14px 18px',
              backgroundColor: '#FEF2F2', border: `1px solid #FECACA`,
              borderRadius: '16px',
              fontFamily: font, fontSize: '14px', fontWeight: 400,
              color: C.destructive,
            }}>
              {error}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .slide-card:hover .slide-regen-btn {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
