import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabaseUrl } from '../lib/supabase';
import ArrowLeft from '../components/ArrowLeft';

// ── Types ──

type DesignSpec = {
  background: string;
  main_visual: string;
  decorative: string;
  typography: string;
  colors: { main: string; sub: string; point: string };
};

type CreativeOption = {
  id: string;
  strategy_name: string;
  strategy_description: string;
  headline: string;
  subtext: string;
  cta_text: string;
  design: DesignSpec;
  image_prompt: string;
};

type CreativeResult = {
  options: CreativeOption[];
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type Step = 'input' | 'plan' | 'production';

// ── Constants ──

const GOAL_ACTIONS = ['클릭', '프로필 방문', '링크 클릭', 'DM 문의', '앱 설치', '구매'] as const;

type AdChannel = {
  id: string;
  label: string;
  color: string;
  ratios: AdRatio[];
};

type AdRatio = {
  id: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
};

const AD_CHANNELS: AdChannel[] = [
  {
    id: 'instagram',
    label: '인스타그램',
    color: '#E4405F',
    ratios: [
      { id: 'ig-feed', label: '피드 (세로)', ratio: '4:5', width: 1080, height: 1350 },
      { id: 'ig-square', label: '피드 (정사각)', ratio: '1:1', width: 1080, height: 1080 },
      { id: 'ig-story', label: '스토리 / 릴스', ratio: '9:16', width: 1080, height: 1920 },
    ],
  },
  {
    id: 'meta',
    label: '메타 (페이스북)',
    color: '#1877F2',
    ratios: [
      { id: 'meta-feed', label: '피드 (가로)', ratio: '1.91:1', width: 1200, height: 628 },
      { id: 'meta-square', label: '피드 (정사각)', ratio: '1:1', width: 1080, height: 1080 },
      { id: 'meta-story', label: '스토리', ratio: '9:16', width: 1080, height: 1920 },
    ],
  },
  {
    id: 'gdn',
    label: 'GDN (구글)',
    color: '#4285F4',
    ratios: [
      { id: 'gdn-landscape', label: '반응형 (가로)', ratio: '1.91:1', width: 1200, height: 628 },
      { id: 'gdn-square', label: '반응형 (정사각)', ratio: '1:1', width: 1200, height: 1200 },
      { id: 'gdn-portrait', label: '반응형 (세로)', ratio: '4:5', width: 960, height: 1200 },
    ],
  },
  {
    id: 'kakao',
    label: '카카오모먼트',
    color: '#FEE500',
    ratios: [
      { id: 'kakao-landscape', label: '배너 (가로)', ratio: '1.91:1', width: 1200, height: 628 },
      { id: 'kakao-square', label: '배너 (정사각)', ratio: '1:1', width: 1080, height: 1080 },
    ],
  },
  {
    id: 'naver',
    label: '네이버 GFA',
    color: '#03C75A',
    ratios: [
      { id: 'naver-landscape', label: '배너 (가로)', ratio: '1.91:1', width: 1200, height: 628 },
      { id: 'naver-square', label: '배너 (정사각)', ratio: '1:1', width: 1080, height: 1080 },
    ],
  },
  {
    id: 'youtube',
    label: '유튜브',
    color: '#FF0000',
    ratios: [
      { id: 'yt-thumb', label: '썸네일', ratio: '16:9', width: 1280, height: 720 },
      { id: 'yt-bumper', label: '범퍼 광고', ratio: '16:9', width: 1920, height: 1080 },
    ],
  },
  {
    id: 'tiktok',
    label: '틱톡',
    color: '#000000',
    ratios: [
      { id: 'tt-feed', label: '피드 (세로)', ratio: '9:16', width: 1080, height: 1920 },
    ],
  },
];

// ── Design System ──

const C = {
  primary: '#48b2af',
  primaryDark: '#41a09e',
  primaryLight: '#f0f8f8',
  surface: '#ffffff',
  surfaceDisabled: '#f8f8f8',
  surfaceSecondary: '#f9f9f9',
  borderDefault: '#e7e7e7',
  borderDivider: '#f3f3f3',
  textPrimary: '#151515',
  textBlack: '#000000',
  textSecondary: '#525252',
  textTertiary: '#6d6d6d',
  textCaption: '#848484',
  textDisabled: '#b7b7b7',
  textWhite: '#ffffff',
};

const font = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

// ── Main Page ──

export default function AdCreativePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('input');

  // Input
  const [product, setProduct] = useState('');
  const [target, setTarget] = useState('');
  const [goalAction, setGoalAction] = useState<string>('클릭');
  const [channelId, setChannelId] = useState<string>('instagram');
  const [ratioId, setRatioId] = useState<string>('ig-feed');

  const selectedChannel = AD_CHANNELS.find(c => c.id === channelId)!;
  const selectedRatio = selectedChannel.ratios.find(r => r.id === ratioId) || selectedChannel.ratios[0];

  // Plan
  const [result, setResult] = useState<CreativeResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Production
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});
  const [imageGenerating, setImageGenerating] = useState<Set<string>>(new Set());

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── API Calls ──

  const callPlanFunction = async (body: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-ad-creative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '기획안 생성 실패');
    return data as CreativeResult;
  };

  const callImageFunction = async (imagePrompt: string, aspectRatio: string) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-ad-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_prompt: imagePrompt, aspect_ratio: aspectRatio }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '이미지 생성 실패');
    return data as { image: string; mimeType: string };
  };

  // ── Step 1: Generate plan ──

  const handleGeneratePlan = async () => {
    if (!product.trim()) return;
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setChatMessages([]);
    setImages({});
    setSelectedOption(null);

    try {
      const data = await callPlanFunction({
        product: product.trim(),
        target: target.trim() || undefined,
        goalAction,
        channel: selectedChannel.label,
        ratio: { id: selectedRatio.id, label: selectedRatio.label, ratio: selectedRatio.ratio, width: selectedRatio.width, height: selectedRatio.height },
      });
      setResult(data);
      setStep('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Step 2: Chat revision ──

  const handleRevise = async () => {
    if (!chatInput.trim() || !result) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsRevising(true);
    setError(null);

    try {
      const currentResult = JSON.stringify(result, null, 2);
      const data = await callPlanFunction({
        product: product.trim(),
        target: target.trim() || undefined,
        goalAction,
        channel: selectedChannel.label,
        ratio: { id: selectedRatio.id, label: selectedRatio.label, ratio: selectedRatio.ratio, width: selectedRatio.width, height: selectedRatio.height },
        revision: `기존 기획안:\n${currentResult}\n\n수정 요청: ${userMsg}\n\n위 기획안을 수정 요청에 맞게 수정해줘. 3개 옵션 유지.`,
      });
      setResult(data);
      setChatMessages(prev => [...prev, { role: 'assistant', content: '기획안을 수정했습니다!' }]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '오류';
      setChatMessages(prev => [...prev, { role: 'assistant', content: `수정 실패: ${errMsg}` }]);
    } finally {
      setIsRevising(false);
    }
  };

  // ── Step 3: Generate image ──

  const handleGenerateImage = useCallback(async (option: CreativeOption) => {
    setImageGenerating(prev => new Set(prev).add(option.id));
    setError(null);

    try {
      const data = await callImageFunction(option.image_prompt, selectedRatio.ratio);
      setImages(prev => ({ ...prev, [option.id]: `data:${data.mimeType};base64,${data.image}` }));
    } catch (err) {
      setError(`이미지 생성 실패: ${err instanceof Error ? err.message : '오류'}`);
    } finally {
      setImageGenerating(prev => {
        const next = new Set(prev);
        next.delete(option.id);
        return next;
      });
    }
  }, [selectedRatio.ratio]);

  const handleGenerateSelected = () => {
    if (!result || !selectedOption) return;
    const option = result.options.find(o => o.id === selectedOption);
    if (option) {
      setStep('production');
      handleGenerateImage(option);
    }
  };

  const handleGenerateAll = async () => {
    if (!result) return;
    setStep('production');
    const pending = result.options.filter(o => !images[o.id]);
    await Promise.allSettled(pending.map(option => handleGenerateImage(option)));
  };

  // ── Download image ──

  const handleDownload = (optionId: string) => {
    const src = images[optionId];
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `ad-creative-${optionId}.png`;
    a.click();
  };

  const resetAll = () => {
    setStep('input');
    setProduct('');
    setTarget('');
    setGoalAction('클릭');
    setChannelId('instagram');
    setRatioId('ig-feed');
    setResult(null);
    setError(null);
    setChatMessages([]);
    setChatInput('');
    setImages({});
    setSelectedOption(null);
    setImageGenerating(null);
  };

  // ── Helpers ──

  const ctaButton = (label: string, onClick: () => void, disabled: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center"
      style={{
        height: '56px', borderRadius: '16px',
        backgroundColor: disabled ? C.surfaceDisabled : C.primary,
        border: 'none', transition: 'all 0.15s ease',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onPointerDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.99)'; }}
      onPointerUp={e => { e.currentTarget.style.transform = ''; }}
      onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
    >
      <span style={{
        fontFamily: font, fontSize: '16px', fontWeight: 500,
        lineHeight: '25px', letterSpacing: '-0.32px',
        color: disabled ? C.textDisabled : C.textWhite,
      }}>
        {label}
      </span>
    </button>
  );

  const headerTitle = step === 'input' ? 'AI 광고 소재' : step === 'plan' ? '기획안 검토' : '이미지 생성';

  // ── Render ──

  return (
    <div className="bg-white relative min-h-screen w-full flex justify-center">
      <div className="w-full max-w-[440px] relative pb-[140px]" style={{ fontFamily: font }}>

        {/* ── NavigationHeader ── */}
        <div className="bg-white h-[52px] shrink-0 w-full z-20 fixed top-0 left-1/2 -translate-x-1/2 max-w-[440px]">
          <div className="flex flex-col justify-center size-full">
            <div className="content-stretch flex items-center justify-between px-[12px] py-[4px] relative size-full">
              <ArrowLeft onClick={() => {
                if (step === 'production') setStep('plan');
                else if (step === 'plan') setStep('input');
                else navigate(-1);
              }} />
              <p style={{
                fontFamily: font, fontSize: '18px', fontWeight: 600,
                lineHeight: '25.5px', letterSpacing: '-0.36px',
                color: C.textBlack, textAlign: 'center',
              }}>
                {headerTitle}
              </p>
              <div className="w-[44px]" />
            </div>
          </div>
        </div>

        <div className="h-[60px]" />

        <div style={{ padding: '0 20px' }}>

          {/* ════ STEP 1: Input ════ */}
          {step === 'input' && (
            <>
              <div style={{ marginBottom: '28px', marginTop: '8px' }}>
                <h1 style={{
                  fontFamily: font, fontSize: '22px', fontWeight: 600,
                  lineHeight: '32.5px', letterSpacing: '-0.22px',
                  color: C.textPrimary, margin: 0,
                }}>
                  AI 광고 소재 메이커
                </h1>
                <p style={{
                  fontFamily: font, fontSize: '15px', fontWeight: 400,
                  lineHeight: '20px', letterSpacing: '-0.45px',
                  color: C.textTertiary, marginTop: '8px',
                }}>
                  제품 정보를 입력하면 AI가 광고 포스터를 만들어드려요
                </p>
              </div>

              {/* Product */}
              <section style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '8px',
                }}>
                  제품/서비스 *
                </label>
                <div className="w-full" style={{
                  backgroundColor: C.surface, border: `1px solid ${C.borderDefault}`,
                  borderRadius: '16px', padding: '12px',
                }}>
                  <textarea
                    value={product}
                    onChange={e => setProduct(e.target.value)}
                    placeholder="예: 나다운세 - AI 신년운세 종합운. 만세력·월별운까지 한눈에 확인"
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

              {/* Target */}
              <section style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '8px',
                }}>
                  타겟 고객
                </label>
                <div className="w-full" style={{
                  backgroundColor: C.surface, border: `1px solid ${C.borderDefault}`,
                  borderRadius: '16px', padding: '12px',
                }}>
                  <input
                    type="text"
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    placeholder="예: 미래가 불안한 20~30대 한국 여성"
                    className="w-full outline-none bg-transparent"
                    style={{
                      fontFamily: font, fontSize: '15px', fontWeight: 400,
                      lineHeight: '20px', letterSpacing: '-0.45px',
                      color: C.textPrimary, border: 'none',
                    }}
                  />
                </div>
              </section>

              {/* Ad Channel */}
              <section style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  광고 채널
                </label>
                <div className="flex flex-wrap" style={{ gap: '8px' }}>
                  {AD_CHANNELS.map(ch => {
                    const isSelected = channelId === ch.id;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => {
                          setChannelId(ch.id);
                          setRatioId(ch.ratios[0].id);
                        }}
                        style={{
                          height: '40px', padding: '0 14px', borderRadius: '12px',
                          fontFamily: font, fontSize: '13px', fontWeight: isSelected ? 600 : 400,
                          letterSpacing: '-0.26px',
                          color: isSelected ? C.textWhite : C.textTertiary,
                          backgroundColor: isSelected ? ch.color : C.surface,
                          border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ch.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Ratio */}
              <section style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  이미지 비율
                </label>
                <div className="flex flex-wrap" style={{ gap: '8px' }}>
                  {selectedChannel.ratios.map(r => {
                    const isSelected = ratioId === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setRatioId(r.id)}
                        className="flex items-center"
                        style={{
                          height: '40px', padding: '0 14px', borderRadius: '12px',
                          fontFamily: font, fontSize: '13px', fontWeight: isSelected ? 600 : 400,
                          letterSpacing: '-0.26px',
                          color: isSelected ? C.textWhite : C.textTertiary,
                          backgroundColor: isSelected ? C.primary : C.surface,
                          border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                          whiteSpace: 'nowrap', gap: '6px',
                        }}
                      >
                        {/* Ratio preview icon */}
                        {(() => {
                          const [w, h] = r.ratio.split(':').map(Number);
                          const maxDim = 14;
                          const scale = maxDim / Math.max(w, h);
                          const pw = Math.round(w * scale);
                          const ph = Math.round(h * scale);
                          return (
                            <div style={{
                              width: `${pw}px`, height: `${ph}px`,
                              borderRadius: '2px',
                              border: `1.5px solid ${isSelected ? 'rgba(255,255,255,0.7)' : C.textDisabled}`,
                            }} />
                          );
                        })()}
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Goal Action */}
              <section style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  목표 행동
                </label>
                <div className="flex flex-wrap" style={{ gap: '8px' }}>
                  {GOAL_ACTIONS.map(action => {
                    const isSelected = goalAction === action;
                    return (
                      <button
                        key={action}
                        onClick={() => setGoalAction(action)}
                        style={{
                          height: '40px', padding: '0 16px', borderRadius: '12px',
                          fontFamily: font, fontSize: '14px', fontWeight: isSelected ? 600 : 400,
                          letterSpacing: '-0.28px',
                          color: isSelected ? C.textWhite : C.textTertiary,
                          backgroundColor: isSelected ? C.primary : C.surface,
                          border: isSelected ? 'none' : `1px solid ${C.borderDefault}`,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {action}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Spec info */}
              <div style={{
                padding: '12px 16px', backgroundColor: C.surfaceSecondary, borderRadius: '12px',
                marginBottom: '20px',
              }}>
                <div className="flex items-center justify-between">
                  <p style={{
                    fontFamily: font, fontSize: '13px', fontWeight: 400,
                    color: C.textCaption, margin: 0,
                  }}>
                    {selectedChannel.label} · {selectedRatio.label}
                  </p>
                  <p style={{
                    fontFamily: font, fontSize: '13px', fontWeight: 500,
                    color: C.textTertiary, margin: 0,
                  }}>
                    {selectedRatio.width}×{selectedRatio.height}px ({selectedRatio.ratio})
                  </p>
                </div>
              </div>

              {ctaButton(
                isGenerating ? '기획안 생성 중...' : '기획안 생성하기',
                handleGeneratePlan,
                !product.trim() || isGenerating,
              )}
            </>
          )}

          {/* ════ STEP 2: Plan Review ════ */}
          {step === 'plan' && result && (
            <>
              {/* Options */}
              <div className="flex flex-col" style={{ gap: '16px', marginTop: '8px', marginBottom: '20px' }}>
                {result.options.map(option => {
                  const isSelected = selectedOption === option.id;
                  const hasImage = !!images[option.id];

                  return (
                    <button
                      key={option.id}
                      onClick={() => setSelectedOption(isSelected ? null : option.id)}
                      style={{
                        padding: '20px', borderRadius: '16px',
                        border: `2px solid ${isSelected ? C.primary : C.borderDefault}`,
                        backgroundColor: isSelected ? C.primaryLight : C.surface,
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.15s ease',
                        width: '100%',
                      }}
                    >
                      {/* Option header */}
                      <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
                        <div className="flex items-center" style={{ gap: '8px' }}>
                          <span style={{
                            fontFamily: font, fontSize: '14px', fontWeight: 700,
                            color: C.textWhite, backgroundColor: option.design.colors.main,
                            width: '28px', height: '28px', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {option.id}
                          </span>
                          <span style={{
                            fontFamily: font, fontSize: '15px', fontWeight: 600,
                            color: C.textPrimary,
                          }}>
                            {option.strategy_name}
                          </span>
                        </div>
                        {hasImage && (
                          <span style={{
                            fontFamily: font, fontSize: '11px', fontWeight: 600,
                            padding: '2px 8px', borderRadius: '6px',
                            backgroundColor: '#E8F5E9', color: '#4CAF50',
                          }}>
                            생성 완료
                          </span>
                        )}
                      </div>

                      {/* Strategy description */}
                      <p style={{
                        fontFamily: font, fontSize: '13px', fontWeight: 400,
                        lineHeight: '18px', color: C.textCaption, margin: '0 0 12px 0',
                      }}>
                        {option.strategy_description}
                      </p>

                      {/* Copy preview */}
                      <div style={{
                        padding: '14px', borderRadius: '12px',
                        backgroundColor: isSelected ? C.surface : C.surfaceSecondary,
                        marginBottom: '12px',
                      }}>
                        <p style={{
                          fontFamily: font, fontSize: '16px', fontWeight: 700,
                          lineHeight: '24px', color: C.textPrimary, margin: '0 0 4px 0',
                        }}>
                          {option.headline}
                        </p>
                        {option.subtext && (
                          <p style={{
                            fontFamily: font, fontSize: '13px', fontWeight: 400,
                            lineHeight: '18px', color: C.textSecondary, margin: '0 0 8px 0',
                          }}>
                            {option.subtext}
                          </p>
                        )}
                        <div style={{
                          display: 'inline-flex', padding: '6px 14px', borderRadius: '8px',
                          backgroundColor: option.design.colors.main,
                        }}>
                          <span style={{
                            fontFamily: font, fontSize: '12px', fontWeight: 600,
                            color: C.textWhite,
                          }}>
                            {option.cta_text}
                          </span>
                        </div>
                      </div>

                      {/* Design info */}
                      <div className="flex flex-wrap" style={{ gap: '4px' }}>
                        {[option.design.background, option.design.main_visual, option.design.typography].map((tag, i) => (
                          <span
                            key={i}
                            style={{
                              fontFamily: font, fontSize: '11px', fontWeight: 500,
                              padding: '2px 8px', borderRadius: '6px',
                              backgroundColor: '#F5F5F5', color: C.textTertiary,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Color palette */}
                      <div className="flex items-center" style={{ gap: '6px', marginTop: '8px' }}>
                        {Object.entries(option.design.colors).map(([key, color]) => (
                          <div key={key} className="flex items-center" style={{ gap: '4px' }}>
                            <div style={{
                              width: '16px', height: '16px', borderRadius: '4px',
                              backgroundColor: color, border: '1px solid rgba(0,0,0,0.1)',
                            }} />
                            <span style={{
                              fontFamily: font, fontSize: '10px', color: C.textCaption,
                            }}>
                              {color}
                            </span>
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ── Chat Revision ── */}
              <div style={{
                borderTop: `1px solid ${C.borderDivider}`,
                paddingTop: '20px', marginBottom: '16px',
              }}>
                <p style={{
                  fontFamily: font, fontSize: '14px', fontWeight: 600,
                  lineHeight: '20px', color: C.textPrimary, marginBottom: '12px',
                }}>
                  수정 요청
                </p>

                {chatMessages.length > 0 && (
                  <div className="flex flex-col" style={{ gap: '8px', marginBottom: '12px' }}>
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className="flex"
                        style={{ justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
                      >
                        <div style={{
                          maxWidth: '80%', padding: '10px 14px', borderRadius: '14px',
                          backgroundColor: msg.role === 'user' ? C.primary : '#F3F3F5',
                          color: msg.role === 'user' ? C.textWhite : C.textPrimary,
                          fontFamily: font, fontSize: '14px', fontWeight: 400,
                          lineHeight: '20px',
                        }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                )}

                <div className="flex items-center" style={{ gap: '8px' }}>
                  <div className="flex-1" style={{
                    backgroundColor: C.surface, border: `1px solid ${C.borderDefault}`,
                    borderRadius: '14px', padding: '10px 14px',
                  }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleRevise(); }}
                      placeholder="예: B옵션 카피를 더 자극적으로"
                      disabled={isRevising}
                      className="w-full outline-none bg-transparent"
                      style={{
                        fontFamily: font, fontSize: '14px', fontWeight: 400,
                        color: C.textPrimary, border: 'none',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleRevise}
                    disabled={!chatInput.trim() || isRevising}
                    style={{
                      width: '44px', height: '44px', borderRadius: '14px',
                      backgroundColor: !chatInput.trim() || isRevising ? C.surfaceDisabled : C.primary,
                      border: 'none', cursor: !chatInput.trim() || isRevising ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                      stroke={!chatInput.trim() || isRevising ? C.textDisabled : C.textWhite}
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Bottom buttons */}
              <div className="flex flex-col" style={{ gap: '10px' }}>
                {ctaButton(
                  selectedOption
                    ? `Option ${selectedOption} 이미지 생성하기`
                    : '옵션을 선택해주세요',
                  handleGenerateSelected,
                  !selectedOption || isGenerating,
                )}
                <button
                  onClick={handleGenerateAll}
                  disabled={isGenerating}
                  className="w-full flex items-center justify-center"
                  style={{
                    height: '48px', borderRadius: '16px',
                    backgroundColor: C.surface,
                    border: `1px solid ${C.borderDefault}`,
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span style={{
                    fontFamily: font, fontSize: '14px', fontWeight: 500,
                    color: C.textTertiary,
                  }}>
                    전체 이미지 생성하기
                  </span>
                </button>
              </div>
            </>
          )}

          {/* ════ STEP 3: Production ════ */}
          {step === 'production' && result && (
            <>
              <div className="flex flex-col" style={{ gap: '20px', marginTop: '8px', marginBottom: '24px' }}>
                {result.options.map(option => {
                  const imgSrc = images[option.id];
                  const isLoading = imageGenerating.has(option.id);

                  return (
                    <div key={option.id}>
                      {/* Option label */}
                      <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
                        <div className="flex items-center" style={{ gap: '8px' }}>
                          <span style={{
                            fontFamily: font, fontSize: '14px', fontWeight: 700,
                            color: C.textWhite, backgroundColor: option.design.colors.main,
                            width: '28px', height: '28px', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {option.id}
                          </span>
                          <span style={{
                            fontFamily: font, fontSize: '15px', fontWeight: 600,
                            color: C.textPrimary,
                          }}>
                            {option.strategy_name}
                          </span>
                        </div>
                        {imgSrc && (
                          <div className="flex" style={{ gap: '6px' }}>
                            <button
                              onClick={() => handleGenerateImage(option)}
                              disabled={imageGenerating.size > 0}
                              style={{
                                padding: '4px 12px', borderRadius: '8px',
                                backgroundColor: C.primaryLight, border: 'none',
                                cursor: imageGenerating.size > 0 ? 'not-allowed' : 'pointer',
                                fontFamily: font, fontSize: '12px', fontWeight: 500,
                                color: C.primaryDark,
                              }}
                            >
                              재생성
                            </button>
                            <button
                              onClick={() => handleDownload(option.id)}
                              style={{
                                padding: '4px 12px', borderRadius: '8px',
                                backgroundColor: C.primary, border: 'none',
                                cursor: 'pointer',
                                fontFamily: font, fontSize: '12px', fontWeight: 500,
                                color: C.textWhite,
                              }}
                            >
                              다운로드
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Image container */}
                      <div style={{
                        width: '100%', aspectRatio: `${selectedRatio.width}/${selectedRatio.height}`, borderRadius: '12px',
                        backgroundColor: C.surfaceSecondary, overflow: 'hidden',
                        border: `1px solid ${C.borderDefault}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                        className="transform-gpu"
                      >
                        {isLoading ? (
                          <div className="flex flex-col items-center" style={{ gap: '12px' }}>
                            <div style={{
                              width: '40px', height: '40px', borderRadius: '50%',
                              border: `3px solid ${C.borderDefault}`,
                              borderTopColor: C.primary,
                              animation: 'spin 1s linear infinite',
                            }} />
                            <p style={{
                              fontFamily: font, fontSize: '14px', fontWeight: 400,
                              color: C.textCaption,
                            }}>
                              이미지 생성 중...
                            </p>
                          </div>
                        ) : imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={`Option ${option.id}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <button
                            onClick={() => handleGenerateImage(option)}
                            disabled={imageGenerating.size > 0}
                            className="flex flex-col items-center"
                            style={{
                              gap: '8px', border: 'none', backgroundColor: 'transparent',
                              cursor: imageGenerating.size > 0 ? 'not-allowed' : 'pointer',
                              padding: '20px',
                            }}
                          >
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                              stroke={C.textDisabled} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                            <span style={{
                              fontFamily: font, fontSize: '14px', fontWeight: 400,
                              color: C.textDisabled,
                            }}>
                              클릭하여 생성
                            </span>
                          </button>
                        )}
                      </div>

                      {/* Copy info below image */}
                      <div style={{ marginTop: '8px', padding: '0 4px' }}>
                        <p style={{
                          fontFamily: font, fontSize: '14px', fontWeight: 600,
                          color: C.textPrimary, margin: '0 0 2px 0',
                        }}>
                          {option.headline}
                        </p>
                        {option.subtext && (
                          <p style={{
                            fontFamily: font, fontSize: '12px', fontWeight: 400,
                            color: C.textCaption, margin: 0,
                          }}>
                            {option.subtext}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom buttons */}
              <div className="flex" style={{ gap: '10px' }}>
                <button
                  onClick={resetAll}
                  className="flex-1 flex items-center justify-center"
                  style={{
                    height: '56px', borderRadius: '16px',
                    backgroundColor: C.surface,
                    border: `1px solid ${C.borderDefault}`,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    fontFamily: font, fontSize: '16px', fontWeight: 500,
                    color: C.textTertiary,
                  }}>
                    처음으로
                  </span>
                </button>
                <button
                  onClick={() => setStep('plan')}
                  className="flex-1 flex items-center justify-center"
                  style={{
                    height: '56px', borderRadius: '16px',
                    backgroundColor: C.primary,
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  <span style={{
                    fontFamily: font, fontSize: '16px', fontWeight: 500,
                    color: C.textWhite,
                  }}>
                    기획안 수정
                  </span>
                </button>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: '16px', padding: '12px 16px', borderRadius: '12px',
              backgroundColor: '#FFF0F0', border: '1px solid #FFCDD2',
            }}>
              <p style={{
                fontFamily: font, fontSize: '13px', fontWeight: 400,
                color: '#D4183D', margin: 0,
              }}>
                {error}
              </p>
            </div>
          )}
        </div>

        {/* Spinner animation */}
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
