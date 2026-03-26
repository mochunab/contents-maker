import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabaseUrl } from '../lib/supabase';
import ArrowLeft from '../components/ArrowLeft';

// ── Types ──

type AdCopy = {
  id: number;
  headline: string;
  subtext: string;
  cta_button: string;
  strategies: string[];
  explanation: string;
  tone: string;
};

type AdCopyResult = {
  product_summary: string;
  copies: AdCopy[];
};

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type Step = 'input' | 'result';

// ── Constants ──

const GOAL_ACTIONS = ['클릭', '가입', '구매', '문의', '다운로드', '예약'] as const;
const CTA_LOCATIONS = ['버튼', '배너', '팝업', '인앱 메시지', 'SNS 광고', '이메일'] as const;
const COPY_COUNTS = [3, 5, 8] as const;

const TONE_COLORS: Record<string, { bg: string; text: string }> = {
  '자극적': { bg: '#FFF0F0', text: '#D4183D' },
  '따뜻한': { bg: '#FFF8F0', text: '#E67E22' },
  '유머러스': { bg: '#FFFFF0', text: '#B8860B' },
  '긴급한': { bg: '#FFF0F5', text: '#C71585' },
  '신뢰감': { bg: '#F0F0FF', text: '#4A4ADE' },
};

// ── Design System Tokens ──

const C = {
  primary: '#48b2af',
  primaryDark: '#41a09e',
  primaryLight: '#f0f8f8',
  surface: '#ffffff',
  surfaceDisabled: '#f8f8f8',
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

export default function AdCopyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('input');

  // Input
  const [product, setProduct] = useState(searchParams.get('product') || '');
  const [target, setTarget] = useState('');
  const [goalAction, setGoalAction] = useState<string>('클릭');
  const [ctaLocation, setCtaLocation] = useState<string>('버튼');
  const [copyCount, setCopyCount] = useState<number>(5);

  // Result
  const [result, setResult] = useState<AdCopyResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Chat revision
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // ── API Call ──

  const callEdgeFunction = async (body: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/generate-ad-copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '카피 생성 실패');
    return data as AdCopyResult;
  };

  // ── Step 1: Generate copies ──

  const handleGenerate = async () => {
    if (!product.trim()) return;
    setIsGenerating(true);
    setError(null);
    setResult(null);
    setChatMessages([]);

    try {
      const data = await callEdgeFunction({
        product: product.trim(),
        target: target.trim() || undefined,
        goalAction,
        ctaLocation,
        copyCount,
      });
      setResult(data);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Chat revision ──

  const handleRevise = async () => {
    if (!chatInput.trim() || !result) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsRevising(true);
    setError(null);

    try {
      const currentResult = JSON.stringify(result, null, 2);
      const data = await callEdgeFunction({
        product: product.trim(),
        target: target.trim() || undefined,
        goalAction,
        ctaLocation,
        copyCount: result.copies.length,
        revision: `기존 결과:\n${currentResult}\n\n수정 요청: ${userMsg}\n\n위 카피들을 수정 요청에 맞게 수정해줘. 카피 개수는 ${result.copies.length}개 유지.`,
      });
      setResult(data);
      setChatMessages(prev => [...prev, { role: 'assistant', content: '카피를 수정했습니다!' }]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '오류';
      setChatMessages(prev => [...prev, { role: 'assistant', content: `수정 실패: ${errMsg}` }]);
      setError(errMsg);
    } finally {
      setIsRevising(false);
    }
  };

  // ── Copy to clipboard ──

  const handleCopyToClipboard = async (copy: AdCopy) => {
    const text = `${copy.headline}${copy.subtext ? `\n${copy.subtext}` : ''}\n\n[${copy.cta_button}]`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(copy.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(copy.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // ── Copy all ──

  const handleCopyAll = async () => {
    if (!result) return;
    const allText = result.copies.map((c, i) =>
      `${i + 1}. ${c.headline}${c.subtext ? `\n   ${c.subtext}` : ''}\n   [${c.cta_button}]\n   전략: ${c.strategies.join(', ')}\n   톤: ${c.tone}`
    ).join('\n\n');

    try {
      await navigator.clipboard.writeText(allText);
      setCopiedId(-1);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = allText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(-1);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const resetAll = () => {
    setStep('input');
    setProduct('');
    setTarget('');
    setGoalAction('클릭');
    setCtaLocation('버튼');
    setCopyCount(5);
    setResult(null);
    setError(null);
    setChatMessages([]);
    setChatInput('');
    setCopiedId(null);
  };

  // ── CTA Button helper ──
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

  // ── Chip selector helper ──
  const chipSelector = <T extends string | number>(
    options: readonly T[],
    selected: T,
    onSelect: (v: T) => void,
    formatLabel?: (v: T) => string,
  ) => (
    <div className="flex flex-wrap" style={{ gap: '8px' }}>
      {options.map(opt => {
        const isSelected = selected === opt;
        const label = formatLabel ? formatLabel(opt) : String(opt);
        return (
          <button
            key={String(opt)}
            onClick={() => onSelect(opt)}
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
            {label}
          </button>
        );
      })}
    </div>
  );

  // ── Render ──

  return (
    <div className="bg-white relative min-h-screen w-full flex justify-center">
      <div className="w-full max-w-[440px] relative pb-[140px]" style={{ fontFamily: font }}>

        {/* ── NavigationHeader ── */}
        <div className="bg-white h-[52px] shrink-0 w-full z-20 fixed top-0 left-1/2 -translate-x-1/2 max-w-[440px]">
          <div className="flex flex-col justify-center size-full">
            <div className="content-stretch flex items-center justify-between px-[12px] py-[4px] relative size-full">
              <ArrowLeft onClick={() => step === 'input' ? navigate(-1) : resetAll()} />
              <p style={{
                fontFamily: font, fontSize: '18px', fontWeight: 600,
                lineHeight: '25.5px', letterSpacing: '-0.36px',
                color: C.textBlack, textAlign: 'center',
              }}>
                {step === 'input' ? 'AI 광고 카피' : '카피 결과'}
              </p>
              <div className="w-[44px]" />
            </div>
          </div>
        </div>

        {/* 헤더 여백 */}
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
                  AI 광고 카피 메이커
                </h1>
                <p style={{
                  fontFamily: font, fontSize: '15px', fontWeight: 400,
                  lineHeight: '20px', letterSpacing: '-0.45px',
                  color: C.textTertiary, marginTop: '8px',
                }}>
                  제품 정보를 입력하면 AI가 전환율 높은 카피를 만들어드려요
                </p>
              </div>

              {/* Product/Service */}
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
                    placeholder="예: MyApp - AI 기반 콘텐츠 제작 서비스"
                    rows={3}
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
                    placeholder="예: 20~30대 여성, 연애/진로 고민이 많은"
                    className="w-full outline-none bg-transparent"
                    style={{
                      fontFamily: font, fontSize: '15px', fontWeight: 400,
                      lineHeight: '20px', letterSpacing: '-0.45px',
                      color: C.textPrimary, border: 'none',
                    }}
                  />
                </div>
              </section>

              {/* Goal Action */}
              <section style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  목표 행동
                </label>
                {chipSelector(GOAL_ACTIONS, goalAction, setGoalAction)}
              </section>

              {/* CTA Location */}
              <section style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  CTA 위치
                </label>
                {chipSelector(CTA_LOCATIONS, ctaLocation, setCtaLocation)}
              </section>

              {/* Copy Count */}
              <section style={{ marginBottom: '32px' }}>
                <label style={{
                  display: 'block', fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', letterSpacing: '-0.24px',
                  color: C.textCaption, marginBottom: '10px',
                }}>
                  카피 개수
                </label>
                <div className="flex" style={{ gap: '10px' }}>
                  {COPY_COUNTS.map(count => {
                    const isSelected = copyCount === count;
                    return (
                      <button
                        key={count}
                        onClick={() => setCopyCount(count)}
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
                      >
                        {count}개
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Generate CTA */}
              {ctaButton(
                isGenerating ? '카피 생성 중...' : '카피 생성하기',
                handleGenerate,
                !product.trim() || isGenerating,
              )}
            </>
          )}

          {/* ════ STEP 2: Result ════ */}
          {step === 'result' && result && (
            <>
              {/* Product Summary */}
              <div style={{
                padding: '16px 20px', backgroundColor: C.primaryLight, borderRadius: '16px',
                marginBottom: '20px', marginTop: '8px',
              }}>
                <div style={{
                  fontFamily: font, fontSize: '14px', fontWeight: 600,
                  lineHeight: '20px', letterSpacing: '-0.28px', color: C.primaryDark,
                }}>
                  {result.product_summary}
                </div>
                <div style={{
                  fontFamily: font, fontSize: '12px', fontWeight: 400,
                  lineHeight: '16px', color: C.textCaption, marginTop: '4px',
                }}>
                  {target && `타겟: ${target} · `}{goalAction} · {ctaLocation}
                </div>
              </div>

              {/* Copy All Button */}
              <button
                onClick={handleCopyAll}
                className="w-full flex items-center justify-center"
                style={{
                  height: '44px', borderRadius: '12px', marginBottom: '16px',
                  backgroundColor: copiedId === -1 ? '#E8F5E9' : C.surface,
                  border: `1px solid ${copiedId === -1 ? '#4CAF50' : C.borderDefault}`,
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                <span style={{
                  fontFamily: font, fontSize: '14px', fontWeight: 500,
                  color: copiedId === -1 ? '#4CAF50' : C.textSecondary,
                }}>
                  {copiedId === -1 ? '복사 완료!' : '전체 카피 복사하기'}
                </span>
              </button>

              {/* Copy Cards */}
              <div className="flex flex-col" style={{ gap: '12px', marginBottom: '24px' }}>
                {result.copies.map(copy => {
                  const toneStyle = TONE_COLORS[copy.tone] || { bg: '#F0F0F0', text: '#666' };
                  const isCopied = copiedId === copy.id;

                  return (
                    <div
                      key={copy.id}
                      style={{
                        padding: '20px', borderRadius: '16px',
                        border: `1px solid ${C.borderDefault}`,
                        backgroundColor: C.surface,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Tone badge + number */}
                      <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
                        <div className="flex items-center" style={{ gap: '8px' }}>
                          <span style={{
                            fontFamily: font, fontSize: '12px', fontWeight: 600,
                            color: C.textCaption,
                          }}>
                            #{copy.id}
                          </span>
                          <span style={{
                            fontFamily: font, fontSize: '11px', fontWeight: 600,
                            padding: '2px 8px', borderRadius: '6px',
                            backgroundColor: toneStyle.bg, color: toneStyle.text,
                          }}>
                            {copy.tone}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopyToClipboard(copy)}
                          style={{
                            padding: '4px 12px', borderRadius: '8px',
                            backgroundColor: isCopied ? '#E8F5E9' : C.primaryLight,
                            border: 'none', cursor: 'pointer',
                            fontFamily: font, fontSize: '12px', fontWeight: 500,
                            color: isCopied ? '#4CAF50' : C.primaryDark,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isCopied ? '복사됨' : '복사'}
                        </button>
                      </div>

                      {/* Headline */}
                      <p style={{
                        fontFamily: font, fontSize: '18px', fontWeight: 700,
                        lineHeight: '26px', letterSpacing: '-0.36px',
                        color: C.textPrimary, margin: '0 0 6px 0',
                      }}>
                        {copy.headline}
                      </p>

                      {/* Subtext */}
                      {copy.subtext && (
                        <p style={{
                          fontFamily: font, fontSize: '14px', fontWeight: 400,
                          lineHeight: '20px', letterSpacing: '-0.28px',
                          color: C.textSecondary, margin: '0 0 12px 0',
                        }}>
                          {copy.subtext}
                        </p>
                      )}

                      {/* CTA Button preview */}
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '8px 20px', borderRadius: '10px',
                        backgroundColor: C.primary, marginBottom: '14px',
                      }}>
                        <span style={{
                          fontFamily: font, fontSize: '13px', fontWeight: 600,
                          color: C.textWhite,
                        }}>
                          {copy.cta_button}
                        </span>
                      </div>

                      {/* Divider */}
                      <div style={{
                        height: '1px', backgroundColor: C.borderDivider,
                        margin: '0 0 10px 0',
                      }} />

                      {/* Strategies */}
                      <div className="flex flex-wrap" style={{ gap: '4px', marginBottom: '6px' }}>
                        {copy.strategies.map((s, i) => (
                          <span
                            key={i}
                            style={{
                              fontFamily: font, fontSize: '11px', fontWeight: 500,
                              padding: '2px 8px', borderRadius: '6px',
                              backgroundColor: '#F5F5F5', color: C.textTertiary,
                            }}
                          >
                            {s}
                          </span>
                        ))}
                      </div>

                      {/* Explanation */}
                      <p style={{
                        fontFamily: font, fontSize: '12px', fontWeight: 400,
                        lineHeight: '18px', color: C.textCaption, margin: 0,
                      }}>
                        {copy.explanation}
                      </p>
                    </div>
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

                {/* Chat messages */}
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
                          lineHeight: '20px', letterSpacing: '-0.28px',
                        }}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                )}

                {/* Chat input */}
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
                      placeholder="예: 더 긴급한 톤으로 바꿔줘"
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
                      flexShrink: 0, transition: 'all 0.15s ease',
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
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-1 flex items-center justify-center"
                  style={{
                    height: '56px', borderRadius: '16px',
                    backgroundColor: isGenerating ? C.surfaceDisabled : C.primary,
                    border: 'none', cursor: isGenerating ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{
                    fontFamily: font, fontSize: '16px', fontWeight: 500,
                    color: isGenerating ? C.textDisabled : C.textWhite,
                  }}>
                    {isGenerating ? '재생성 중...' : '다시 생성하기'}
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
      </div>
    </div>
  );
}
