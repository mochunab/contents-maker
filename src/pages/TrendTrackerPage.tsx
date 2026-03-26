import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ArrowLeft from '../components/ArrowLeft';
import { supabaseUrl } from '../lib/supabase';

const font = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif";

const C = {
  primary: '#48b2af',
  primaryLight: '#f0f8f8',
  primaryDark: '#41a09e',
  surface: '#ffffff',
  surfaceSecondary: '#f9f9f9',
  borderDefault: '#e7e7e7',
  textPrimary: '#151515',
  textBlack: '#000000',
  textSecondary: '#3d3d3d',
  textTertiary: '#6d6d6d',
  textCaption: '#848484',
  textDisabled: '#b7b7b7',
};

type TrendItem = {
  rank: number;
  keyword: string;
  category: string | null;
  volume: string | number | null;
  url: string | null;
  description: string | null;
};

type TopicKeyword = {
  keyword: string;
  description: string;
  platform: string;
  heat: 'hot' | 'warm' | 'rising';
};

type TopicSource = {
  title: string;
  url: string;
};

type InsightItem = string | { text: string; instinct?: string };
type ContentIdeaItem = string | {
  idea: string;
  differentiation?: string;
  controversy?: string;
  meme_potential?: string;
  hook_strategy?: string;
};
type ContentTipItem = string | {
  tip: string;
  emotion?: string;
  hook_example?: string;
  cta_example?: string;
};

type TopicAnalysis = {
  topic: string;
  summary: string;
  keywords: TopicKeyword[];
  insights: InsightItem[];
  content_ideas: ContentIdeaItem[];
};

type TrendingInsights = {
  categories: { name: string; keywords: string[]; summary: string }[];
  top_insights: InsightItem[];
  mood: string;
  content_tips: ContentTipItem[];
};

function getHeatStyle(heat: string): { bg: string; text: string; label: string } {
  if (heat === 'hot') return { bg: '#fef3f2', text: '#b42318', label: 'HOT' };
  if (heat === 'rising') return { bg: '#eff8ff', text: '#175cd3', label: 'RISING' };
  return { bg: '#ecfdf3', text: '#027a48', label: 'WARM' };
}

// 카테고리별 배지 색상
function getCategoryColor(category: string | null): { bg: string; text: string } {
  if (!category) return { bg: '#f3f3f3', text: C.textCaption };
  const lower = category.toLowerCase();
  if (lower.includes('k-pop') || lower.includes('music')) return { bg: '#fef3f2', text: '#b42318' };
  if (lower.includes('politic')) return { bg: '#eff8ff', text: '#175cd3' };
  if (lower.includes('business') || lower.includes('finance')) return { bg: '#ecfdf3', text: '#027a48' };
  if (lower.includes('entertainment')) return { bg: '#fdf2fa', text: '#c11574' };
  if (lower.includes('only on x')) return { bg: '#f0f8f8', text: C.primaryDark };
  return { bg: '#f3f3f3', text: C.textTertiary };
}

// **bold** 마커를 <strong>으로 변환
function renderBoldText(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} style={{ fontWeight: 600 }}>{part}</strong> : part
  );
}

export default function TrendTrackerPage() {
  const navigate = useNavigate();
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<TrendItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'result' | 'topic-result'>('input');
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  // X 트렌딩 종합 인사이트
  const [trendingInsights, setTrendingInsights] = useState<TrendingInsights | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [resultTab, setResultTab] = useState<'trend' | 'analysis'>('trend');

  // 주제별 검색
  const [topicInput, setTopicInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [topicAnalysis, setTopicAnalysis] = useState<TopicAnalysis | null>(null);
  const [expandedTopicItem, setExpandedTopicItem] = useState<number | null>(null);
  const [topicSources, setTopicSources] = useState<TopicSource[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const callSearchTrends = async (body: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/search-trends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || '검색 실패');
    return data;
  };

  const handleSearch = async () => {
    setIsSearching(true);
    setError(null);
    setTrendingInsights(null);
    try {
      const data = await callSearchTrends({ mode: 'x-trending', country: 'SouthKorea' });
      const items: TrendItem[] = data.items || [];
      setResults(items);
      setStep('result');

      // 인사이트 비동기 로딩 (리스트는 먼저 보여줌)
      if (items.length > 0) {
        setIsLoadingInsights(true);
        const keywordList = items.map(it => `${it.rank}. ${it.keyword} (${it.category || 'Trending'})`).join('\n');
        callSearchTrends({ mode: 'trending-insights', topic: keywordList })
          .then(insightData => {
            if (insightData.insights) setTrendingInsights(insightData.insights);
          })
          .catch(() => { /* 인사이트 실패해도 리스트는 유지 */ })
          .finally(() => setIsLoadingInsights(false));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '트렌드 검색에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleTopicAnalysis = async () => {
    if (!topicInput.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const data = await callSearchTrends({ mode: 'topic-analysis', topic: topicInput.trim() });
      if (data.analysis) {
        setTopicAnalysis(data.analysis);
      } else if (data.raw) {
        setTopicAnalysis({ topic: topicInput, summary: data.raw, keywords: [], insights: [], content_ideas: [] });
      }
      setTopicSources(data.sources || []);
      setSourcesOpen(false);
      setStep('topic-result');
    } catch (err) {
      setError(err instanceof Error ? err.message : '트렌드 분석에 실패했어요. 다시 시도해주세요.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleContentCreate = (keyword: string, type: 'card-news' | 'short-form' | 'ad-copy') => {
    const param = type === 'ad-copy' ? 'product' : 'topic';
    navigate(`/${type}?${param}=${encodeURIComponent(keyword)}`);
  };

  return (
    <div className="bg-white relative min-h-screen w-full flex justify-center">
      <div className="w-full max-w-[440px] relative" style={{ fontFamily: font }}>

        {/* NavigationHeader */}
        <div className="bg-white h-[52px] shrink-0 w-full z-20 fixed top-0 left-1/2 -translate-x-1/2 max-w-[440px]">
          <div className="flex flex-col justify-center size-full">
            <div className="content-stretch flex items-center justify-between px-[12px] py-[4px] relative size-full">
              <ArrowLeft onClick={() => step !== 'input' ? setStep('input') : navigate(-1)} />
              <p style={{
                fontFamily: font, fontSize: '18px', fontWeight: 600,
                lineHeight: '25.5px', letterSpacing: '-0.36px',
                color: C.textBlack, textAlign: 'center',
              }}>
                트렌드 추적기
              </p>
              <div className="w-[44px]" />
            </div>
          </div>
        </div>

        {/* 헤더 여백 */}
        <div className="h-[60px]" />

        {step === 'input' && (
          <div style={{ padding: '0 20px' }}>
            {/* Hero */}
            <div style={{ marginTop: '8px', marginBottom: '32px' }}>
              <h1 style={{
                fontFamily: font, fontSize: '22px', fontWeight: 600,
                lineHeight: '32.5px', letterSpacing: '-0.22px',
                color: C.textPrimary, margin: 0,
              }}>
                실시간 트렌드
              </h1>
              <p style={{
                fontFamily: font, fontSize: '15px', fontWeight: 400,
                lineHeight: '22px', letterSpacing: '-0.45px',
                color: C.textTertiary, marginTop: '8px',
              }}>
                X(트위터) 한국 실시간 트렌딩 키워드를 확인하고{'\n'}바로 콘텐츠를 만들어보세요
              </p>
            </div>

            {/* X 트렌딩 카드 */}
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="w-full flex items-center"
              style={{
                padding: '20px', borderRadius: '16px',
                backgroundColor: isSearching ? C.surfaceSecondary : C.surface,
                border: `1px solid ${C.borderDefault}`,
                cursor: isSearching ? 'wait' : 'pointer',
                gap: '16px', textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onPointerDown={e => { if (!isSearching) e.currentTarget.style.transform = 'scale(0.99)'; }}
              onPointerUp={e => { e.currentTarget.style.transform = ''; }}
              onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
            >
              <div className="flex items-center justify-center shrink-0" style={{
                width: '48px', height: '48px', borderRadius: '16px',
                backgroundColor: C.primaryLight, fontSize: '24px',
              }}>
                🔥
              </div>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <span style={{
                  fontFamily: font, fontSize: '16px', fontWeight: 600,
                  lineHeight: '25px', letterSpacing: '-0.32px',
                  color: C.textPrimary,
                }}>
                  {isSearching ? '트렌드 가져오는 중...' : 'X 실시간 트렌딩'}
                </span>
                <p style={{
                  fontFamily: font, fontSize: '13px', fontWeight: 400,
                  lineHeight: '20px', letterSpacing: '-0.3px',
                  color: C.textCaption, marginTop: '4px',
                }}>
                  한국 실시간 인기 키워드 50개
                </p>
              </div>
              {isSearching ? (
                <div className="shrink-0" style={{
                  width: '20px', height: '20px', border: `2px solid ${C.borderDefault}`,
                  borderTop: `2px solid ${C.primary}`, borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
              ) : (
                <div className="flex items-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textDisabled} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              )}
            </button>

            {/* 비용 안내 */}
            <p style={{
              fontFamily: font, fontSize: '12px', fontWeight: 400,
              color: C.textCaption, marginTop: '16px', textAlign: 'center',
            }}>
              Apify API 사용 · 1회 약 $0.01
            </p>

            {/* 구분선 */}
            <div style={{ margin: '28px 0 24px', borderTop: `1px solid ${C.borderDefault}` }} />

            {/* 주제별 트렌드 검색 */}
            <div style={{ marginBottom: '16px' }}>
              <h2 style={{
                fontFamily: font, fontSize: '18px', fontWeight: 600,
                lineHeight: '26px', letterSpacing: '-0.18px',
                color: C.textPrimary, margin: 0,
              }}>
                주제별 트렌드 분석
              </h2>
              <p style={{
                fontFamily: font, fontSize: '14px', fontWeight: 400,
                lineHeight: '20px', letterSpacing: '-0.42px',
                color: C.textTertiary, marginTop: '6px',
              }}>
                궁금한 주제를 입력하면 AI가 실시간 트렌드를 분석해요
              </p>
            </div>

            <div className="flex" style={{ gap: '8px' }}>
              <input
                type="text"
                value={topicInput}
                onChange={e => setTopicInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && topicInput.trim() && !isAnalyzing) handleTopicAnalysis(); }}
                placeholder="예: 운세, AI, 다이어트, 포켓몬 콜라보"
                disabled={isAnalyzing}
                style={{
                  flex: 1, padding: '14px 16px', borderRadius: '12px',
                  backgroundColor: C.surfaceSecondary,
                  border: `1px solid ${C.borderDefault}`,
                  fontFamily: font, fontSize: '15px', fontWeight: 400,
                  color: C.textPrimary, outline: 'none',
                  lineHeight: '22px', letterSpacing: '-0.3px',
                }}
              />
              <button
                onClick={handleTopicAnalysis}
                disabled={!topicInput.trim() || isAnalyzing}
                style={{
                  padding: '14px 18px', borderRadius: '12px',
                  backgroundColor: (!topicInput.trim() || isAnalyzing) ? C.borderDefault : C.primary,
                  border: 'none', cursor: (!topicInput.trim() || isAnalyzing) ? 'default' : 'pointer',
                  fontFamily: font, fontSize: '15px', fontWeight: 600,
                  color: '#ffffff', whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {isAnalyzing ? '분석 중...' : '분석'}
              </button>
            </div>

            <p style={{
              fontFamily: font, fontSize: '12px', fontWeight: 400,
              color: C.textCaption, marginTop: '12px', textAlign: 'center',
            }}>
              Gemini AI + Google Search 기반 실시간 분석
            </p>

            {/* 에러 */}
            {error && (
              <div style={{
                marginTop: '16px', padding: '14px 16px', borderRadius: '12px',
                backgroundColor: '#fef3f2', border: '1px solid #fecdca',
              }}>
                <p style={{
                  fontFamily: font, fontSize: '14px', fontWeight: 500,
                  color: '#b42318', lineHeight: '20px',
                }}>
                  {error}
                </p>
              </div>
            )}
          </div>
        )}

        {step === 'result' && (
          <div style={{ padding: '0 20px', paddingBottom: '40px' }}>
            {/* 결과 헤더 */}
            <div className="flex items-center justify-between" style={{ marginTop: '8px', marginBottom: '12px' }}>
              <div>
                <h2 style={{
                  fontFamily: font, fontSize: '18px', fontWeight: 600,
                  lineHeight: '26px', letterSpacing: '-0.18px',
                  color: C.textPrimary, margin: 0,
                }}>
                  X 트렌딩 한국
                </h2>
                <p style={{
                  fontFamily: font, fontSize: '13px', fontWeight: 400,
                  color: C.textCaption, marginTop: '4px',
                }}>
                  {results.length}개 키워드 · {new Date().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button
                onClick={() => { setStep('input'); setExpandedItem(null); setResultTab('trend'); }}
                style={{
                  fontFamily: font, fontSize: '13px', fontWeight: 500,
                  color: C.primary, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '8px',
                }}
              >
                다시 검색
              </button>
            </div>

            {/* 탭 */}
            <div className="flex" style={{
              marginBottom: '16px', borderBottom: `1px solid ${C.borderDefault}`,
            }}>
              {([
                { key: 'trend' as const, label: '트렌드' },
                { key: 'analysis' as const, label: 'AI 분석' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setResultTab(tab.key)}
                  style={{
                    flex: 1, padding: '10px 0',
                    fontFamily: font, fontSize: '14px', fontWeight: resultTab === tab.key ? 600 : 400,
                    color: resultTab === tab.key ? C.primary : C.textCaption,
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: resultTab === tab.key ? `2px solid ${C.primary}` : '2px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                  {tab.key === 'analysis' && isLoadingInsights && ' ···'}
                </button>
              ))}
            </div>

            {/* 트렌드 탭 */}
            {resultTab === 'trend' && <div className="flex flex-col" style={{ gap: '0px' }}>
              {results.map((item) => {
                const catColor = getCategoryColor(item.category);
                const isExpanded = expandedItem === item.rank;

                return (
                  <div key={item.rank} style={{
                    borderBottom: isExpanded ? 'none' : `1px solid ${C.borderDefault}`,
                  }}>
                    <button
                      onClick={() => setExpandedItem(isExpanded ? null : item.rank)}
                      className="w-full flex items-center"
                      style={{
                        padding: '12px 8px',
                        borderRadius: isExpanded ? '10px 10px 0 0' : '0',
                        backgroundColor: isExpanded ? C.primaryLight : 'transparent',
                        border: isExpanded ? `1px solid ${C.primary}` : 'none',
                        borderBottom: isExpanded ? 'none' : undefined,
                        cursor: 'pointer', gap: '10px', textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* 순위 */}
                      <span style={{
                        fontFamily: font, fontSize: '14px', fontWeight: 700,
                        color: item.rank <= 3 ? C.primary : C.textCaption,
                        width: '24px', textAlign: 'center', flexShrink: 0,
                      }}>
                        {item.rank}
                      </span>

                      {/* 키워드 */}
                      <span className="flex-1" style={{
                        fontFamily: font, fontSize: '15px', fontWeight: 500,
                        lineHeight: '22px', letterSpacing: '-0.3px',
                        color: C.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {item.keyword}
                      </span>

                      {/* 카테고리 배지 */}
                      {item.category && (
                        <span style={{
                          fontFamily: font, fontSize: '11px', fontWeight: 500,
                          padding: '2px 8px', borderRadius: '4px', flexShrink: 0,
                          backgroundColor: catColor.bg, color: catColor.text,
                          whiteSpace: 'nowrap',
                        }}>
                          {item.category.replace('· Trending', '').replace('Trending', '').trim() || 'Trending'}
                        </span>
                      )}
                    </button>

                    {/* 확장: 콘텐츠 만들기 버튼들 */}
                    {isExpanded && (
                      <div style={{
                        padding: '12px 16px', borderRadius: '0 0 10px 10px',
                        backgroundColor: C.primaryLight,
                        border: `1px solid ${C.primary}`, borderTop: 'none',
                        marginBottom: '4px',
                      }}>
                        {item.description && (
                          <p style={{
                            fontFamily: font, fontSize: '13px', fontWeight: 400,
                            lineHeight: '20px', letterSpacing: '-0.2px',
                            color: C.textSecondary, marginBottom: '10px',
                          }}>
                            {item.description}
                          </p>
                        )}
                        <p style={{
                          fontFamily: font, fontSize: '12px', fontWeight: 500,
                          color: C.textTertiary, marginBottom: '10px',
                        }}>
                          이 키워드로 콘텐츠 만들기
                        </p>
                        <div className="flex" style={{ gap: '8px' }}>
                          {([
                            { label: '카드뉴스', type: 'card-news' as const, icon: '🗞️' },
                            { label: '숏폼', type: 'short-form' as const, icon: '🎬' },
                            { label: '광고 카피', type: 'ad-copy' as const, icon: '✍️' },
                          ]).map(btn => (
                            <button
                              key={btn.type}
                              onClick={() => handleContentCreate(item.keyword, btn.type)}
                              className="flex-1 flex items-center justify-center"
                              style={{
                                padding: '10px 4px', borderRadius: '10px',
                                backgroundColor: C.surface,
                                border: `1px solid ${C.borderDefault}`,
                                cursor: 'pointer', gap: '4px',
                                transition: 'all 0.15s ease',
                              }}
                              onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                              onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                              onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                            >
                              <span style={{ fontSize: '14px' }}>{btn.icon}</span>
                              <span style={{
                                fontFamily: font, fontSize: '12px', fontWeight: 600,
                                color: C.textSecondary,
                              }}>
                                {btn.label}
                              </span>
                            </button>
                          ))}
                        </div>

                        {/* X 출처 링크 */}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center"
                            style={{
                              marginTop: '10px', paddingTop: '10px',
                              borderTop: `1px solid ${C.borderDefault}`,
                              textDecoration: 'none', gap: '6px',
                            }}
                          >
                            <span style={{ fontSize: '12px', flexShrink: 0 }}>🔗</span>
                            <span style={{
                              fontFamily: font, fontSize: '12px', fontWeight: 500,
                              color: C.primary,
                            }}>
                              X에서 보기
                            </span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>}

            {/* AI 분석 탭 */}
            {resultTab === 'analysis' && <div>
              {isLoadingInsights && (
                <div className="flex items-center justify-center" style={{ gap: '10px', padding: '24px 0' }}>
                  <div style={{
                    width: '18px', height: '18px', border: `2px solid ${C.borderDefault}`,
                    borderTop: `2px solid ${C.primary}`, borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <span style={{
                    fontFamily: font, fontSize: '14px', fontWeight: 500,
                    color: C.textTertiary,
                  }}>
                    AI가 트렌드를 분석하고 있어요...
                  </span>
                </div>
              )}

              {trendingInsights && (
                <>
                  {/* 분위기 요약 */}
                  <div style={{
                    padding: '16px', borderRadius: '12px',
                    backgroundColor: C.primaryLight, marginBottom: '20px',
                  }}>
                    <p style={{
                      fontFamily: font, fontSize: '11px', fontWeight: 600,
                      color: C.primary, marginBottom: '6px', letterSpacing: '0.5px',
                    }}>
                      오늘의 X 분위기
                    </p>
                    <p style={{
                      fontFamily: font, fontSize: '15px', fontWeight: 500,
                      lineHeight: '23px', letterSpacing: '-0.3px',
                      color: C.textPrimary, margin: 0,
                    }}>
                      {renderBoldText(trendingInsights.mood)}
                    </p>
                  </div>

                  {/* 카테고리 분류 */}
                  <h3 style={{
                    fontFamily: font, fontSize: '15px', fontWeight: 600,
                    color: C.textPrimary, marginBottom: '12px',
                  }}>
                    카테고리 분류
                  </h3>
                  <div className="flex flex-col" style={{ gap: '8px', marginBottom: '24px' }}>
                    {trendingInsights.categories.map((cat, i) => (
                      <div key={i} style={{
                        padding: '14px', borderRadius: '10px',
                        backgroundColor: C.surfaceSecondary,
                      }}>
                        <div className="flex items-center" style={{ gap: '8px', marginBottom: '6px' }}>
                          <span style={{
                            fontFamily: font, fontSize: '14px', fontWeight: 600,
                            color: C.textPrimary,
                          }}>
                            {cat.name}
                          </span>
                          <span style={{
                            fontFamily: font, fontSize: '11px', fontWeight: 500,
                            color: C.textCaption,
                          }}>
                            {cat.keywords.length}개
                          </span>
                        </div>
                        <p style={{
                          fontFamily: font, fontSize: '13px', fontWeight: 400,
                          lineHeight: '20px', color: C.textTertiary,
                          margin: 0, marginBottom: '6px',
                        }}>
                          {cat.summary}
                        </p>
                        <div className="flex flex-wrap" style={{ gap: '4px' }}>
                          {cat.keywords.slice(0, 5).map((kw, j) => (
                            <span key={j} style={{
                              fontFamily: font, fontSize: '11px', fontWeight: 500,
                              padding: '2px 8px', borderRadius: '4px',
                              backgroundColor: '#ffffff', color: C.textSecondary,
                              border: `1px solid ${C.borderDefault}`,
                            }}>
                              {kw}
                            </span>
                          ))}
                          {cat.keywords.length > 5 && (
                            <span style={{
                              fontFamily: font, fontSize: '11px', fontWeight: 500,
                              padding: '2px 8px', color: C.textCaption,
                            }}>
                              +{cat.keywords.length - 5}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 핵심 인사이트 */}
                  <h3 style={{
                    fontFamily: font, fontSize: '15px', fontWeight: 600,
                    color: C.textPrimary, marginBottom: '12px',
                  }}>
                    핵심 인사이트
                  </h3>
                  <div className="flex flex-col" style={{ gap: '8px', marginBottom: '24px' }}>
                    {trendingInsights.top_insights.map((insight, i) => {
                      const text = typeof insight === 'string' ? insight : insight.text;
                      const instinct = typeof insight === 'object' ? insight.instinct : null;
                      return (
                        <div key={i} style={{
                          padding: '12px 14px', borderRadius: '10px',
                          backgroundColor: C.surfaceSecondary,
                        }}>
                          <div className="flex" style={{ gap: '10px' }}>
                            <span style={{ fontSize: '14px', flexShrink: 0 }}>💡</span>
                            <p style={{
                              fontFamily: font, fontSize: '14px', fontWeight: 400,
                              lineHeight: '21px', letterSpacing: '-0.28px',
                              color: C.textSecondary, margin: 0,
                            }}>
                              {renderBoldText(text)}
                            </p>
                          </div>
                          {instinct && (
                            <div style={{
                              marginTop: '6px', marginLeft: '24px',
                              fontFamily: font, fontSize: '12px', fontWeight: 500,
                              color: '#F57F17', lineHeight: '18px',
                            }}>
                              본능: {instinct}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 콘텐츠 팁 */}
                  {trendingInsights.content_tips.length > 0 && (
                    <>
                      <h3 style={{
                        fontFamily: font, fontSize: '15px', fontWeight: 600,
                        color: C.textPrimary, marginBottom: '12px',
                      }}>
                        콘텐츠 제작 팁
                      </h3>
                      <div className="flex flex-col" style={{ gap: '8px' }}>
                        {trendingInsights.content_tips.map((tip, i) => {
                          const tipText = typeof tip === 'string' ? tip : tip.tip;
                          const tipObj = typeof tip === 'object' ? tip : null;
                          return (
                            <div key={i} style={{
                              padding: '12px 14px', borderRadius: '10px',
                              backgroundColor: C.surfaceSecondary,
                            }}>
                              <div className="flex" style={{ gap: '10px' }}>
                                <span style={{ fontSize: '14px', flexShrink: 0 }}>✨</span>
                                <p style={{
                                  fontFamily: font, fontSize: '14px', fontWeight: 400,
                                  lineHeight: '21px', letterSpacing: '-0.28px',
                                  color: C.textSecondary, margin: 0,
                                }}>
                                  {renderBoldText(tipText)}
                                </p>
                              </div>
                              {tipObj && (tipObj.emotion || tipObj.hook_example || tipObj.cta_example) && (
                                <div style={{ marginTop: '8px', marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {tipObj.emotion && (
                                    <span style={{ fontFamily: font, fontSize: '12px', fontWeight: 500, color: C.primary, lineHeight: '18px' }}>
                                      감정: {tipObj.emotion}
                                    </span>
                                  )}
                                  {tipObj.hook_example && (
                                    <span style={{ fontFamily: font, fontSize: '12px', fontWeight: 500, color: '#E65100', lineHeight: '18px' }}>
                                      후킹: "{tipObj.hook_example}"
                                    </span>
                                  )}
                                  {tipObj.cta_example && (
                                    <span style={{ fontFamily: font, fontSize: '12px', fontWeight: 500, color: C.textCaption, lineHeight: '18px' }}>
                                      CTA: {tipObj.cta_example}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>}
          </div>
        )}

        {step === 'topic-result' && topicAnalysis && (
          <div style={{ padding: '0 20px', paddingBottom: '40px' }}>
            {/* 헤더 */}
            <div className="flex items-center justify-between" style={{ marginTop: '8px', marginBottom: '16px' }}>
              <div>
                <h2 style={{
                  fontFamily: font, fontSize: '18px', fontWeight: 600,
                  lineHeight: '26px', letterSpacing: '-0.18px',
                  color: C.textPrimary, margin: 0,
                }}>
                  "{topicAnalysis.topic}" 트렌드
                </h2>
                <p style={{
                  fontFamily: font, fontSize: '13px', fontWeight: 400,
                  color: C.textCaption, marginTop: '4px',
                }}>
                  {new Date().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button
                onClick={() => { setStep('input'); setExpandedTopicItem(null); }}
                style={{
                  fontFamily: font, fontSize: '13px', fontWeight: 500,
                  color: C.primary, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '8px',
                }}
              >
                다시 검색
              </button>
            </div>

            {/* 요약 */}
            <div style={{
              padding: '16px', borderRadius: '12px',
              backgroundColor: C.primaryLight, marginBottom: '20px',
            }}>
              <p style={{
                fontFamily: font, fontSize: '14px', fontWeight: 400,
                lineHeight: '22px', letterSpacing: '-0.28px',
                color: C.textSecondary,
              }}>
                {renderBoldText(topicAnalysis.summary)}
              </p>
            </div>

            {/* 키워드 리스트 */}
            {topicAnalysis.keywords.length > 0 && (
              <>
                <h3 style={{
                  fontFamily: font, fontSize: '15px', fontWeight: 600,
                  color: C.textPrimary, marginBottom: '12px',
                }}>
                  트렌딩 키워드
                </h3>
                <div className="flex flex-col" style={{ gap: '0px', marginBottom: '24px' }}>
                  {topicAnalysis.keywords.map((kw, i) => {
                    const heat = getHeatStyle(kw.heat);
                    const isExpanded = expandedTopicItem === i;

                    return (
                      <div key={i} style={{
                        borderBottom: isExpanded ? 'none' : `1px solid ${C.borderDefault}`,
                      }}>
                        <button
                          onClick={() => setExpandedTopicItem(isExpanded ? null : i)}
                          className="w-full flex items-center"
                          style={{
                            padding: '12px 8px',
                            borderRadius: isExpanded ? '10px 10px 0 0' : '0',
                            backgroundColor: isExpanded ? C.primaryLight : 'transparent',
                            border: isExpanded ? `1px solid ${C.primary}` : 'none',
                            borderBottom: isExpanded ? 'none' : undefined,
                            cursor: 'pointer', gap: '10px', textAlign: 'left',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div className="w-full" style={{ minWidth: 0 }}>
                            {/* 1행: Heat 배지 + 키워드 + 플랫폼 */}
                            <div className="flex items-center" style={{ gap: '8px' }}>
                              <span style={{
                                fontFamily: font, fontSize: '10px', fontWeight: 700,
                                padding: '2px 6px', borderRadius: '4px', flexShrink: 0,
                                backgroundColor: heat.bg, color: heat.text,
                              }}>
                                {heat.label}
                              </span>
                              <span className="flex-1" style={{
                                fontFamily: font, fontSize: '15px', fontWeight: 500,
                                lineHeight: '22px', color: C.textPrimary,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                                {kw.keyword}
                              </span>
                              <span style={{
                                fontFamily: font, fontSize: '11px', fontWeight: 500,
                                padding: '2px 8px', borderRadius: '4px', flexShrink: 0,
                                backgroundColor: '#f3f3f3', color: C.textTertiary,
                                whiteSpace: 'nowrap',
                              }}>
                                {kw.platform}
                              </span>
                            </div>
                            {/* 2행: 설명 */}
                            <p style={{
                              fontFamily: font, fontSize: '12px', fontWeight: 400,
                              lineHeight: '18px', color: C.textCaption,
                              marginTop: '4px',
                            }}>
                              {kw.description}
                            </p>

                          </div>
                        </button>

                        {/* 확장: 콘텐츠 만들기 */}
                        {isExpanded && (
                          <div style={{
                            padding: '12px 16px', borderRadius: '0 0 10px 10px',
                            backgroundColor: C.primaryLight,
                            border: `1px solid ${C.primary}`, borderTop: 'none',
                            marginBottom: '4px',
                          }}>
                            <p style={{
                              fontFamily: font, fontSize: '12px', fontWeight: 500,
                              color: C.textTertiary, marginBottom: '10px',
                            }}>
                              이 키워드로 콘텐츠 만들기
                            </p>
                            <div className="flex" style={{ gap: '8px' }}>
                              {([
                                { label: '카드뉴스', type: 'card-news' as const, icon: '🗞️' },
                                { label: '숏폼', type: 'short-form' as const, icon: '🎬' },
                                { label: '광고 카피', type: 'ad-copy' as const, icon: '✍️' },
                              ]).map(btn => (
                                <button
                                  key={btn.type}
                                  onClick={() => handleContentCreate(kw.keyword, btn.type)}
                                  className="flex-1 flex items-center justify-center"
                                  style={{
                                    padding: '10px 4px', borderRadius: '10px',
                                    backgroundColor: C.surface,
                                    border: `1px solid ${C.borderDefault}`,
                                    cursor: 'pointer', gap: '4px',
                                    transition: 'all 0.15s ease',
                                  }}
                                  onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
                                  onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                                  onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
                                >
                                  <span style={{ fontSize: '14px' }}>{btn.icon}</span>
                                  <span style={{
                                    fontFamily: font, fontSize: '12px', fontWeight: 600,
                                    color: C.textSecondary,
                                  }}>
                                    {btn.label}
                                  </span>
                                </button>
                              ))}
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* 인사이트 */}
            {topicAnalysis.insights.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{
                  fontFamily: font, fontSize: '15px', fontWeight: 600,
                  color: C.textPrimary, marginBottom: '12px',
                }}>
                  핵심 인사이트
                </h3>
                <div className="flex flex-col" style={{ gap: '8px' }}>
                  {topicAnalysis.insights.map((insight, i) => {
                    const text = typeof insight === 'string' ? insight : insight.text;
                    const instinct = typeof insight === 'object' ? insight.instinct : null;
                    return (
                      <div key={i} style={{
                        padding: '12px 14px', borderRadius: '10px',
                        backgroundColor: C.surfaceSecondary,
                      }}>
                        <div className="flex" style={{ gap: '10px' }}>
                          <span style={{ fontSize: '14px', flexShrink: 0 }}>💡</span>
                          <p style={{
                            fontFamily: font, fontSize: '14px', fontWeight: 400,
                            lineHeight: '21px', letterSpacing: '-0.28px',
                            color: C.textSecondary, margin: 0,
                          }}>
                            {renderBoldText(text)}
                          </p>
                        </div>
                        {instinct && (
                          <div style={{
                            marginTop: '6px', marginLeft: '24px',
                            fontFamily: font, fontSize: '12px', fontWeight: 500,
                            color: '#F57F17', lineHeight: '18px',
                          }}>
                            본능: {instinct}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 콘텐츠 아이디어 */}
            {topicAnalysis.content_ideas.length > 0 && (
              <div>
                <h3 style={{
                  fontFamily: font, fontSize: '15px', fontWeight: 600,
                  color: C.textPrimary, marginBottom: '12px',
                }}>
                  콘텐츠 아이디어
                </h3>
                <div className="flex flex-col" style={{ gap: '10px' }}>
                  {topicAnalysis.content_ideas.map((idea, i) => {
                    const ideaText = typeof idea === 'string' ? idea : idea.idea;
                    const ideaObj = typeof idea === 'object' ? idea : null;
                    return (
                      <div key={i} style={{
                        padding: '14px', borderRadius: '12px',
                        backgroundColor: C.surfaceSecondary,
                      }}>
                        <div className="flex items-start" style={{ gap: '10px' }}>
                          <span style={{ fontSize: '14px', flexShrink: 0 }}>✨</span>
                          <p style={{
                            fontFamily: font, fontSize: '14px', fontWeight: 500,
                            lineHeight: '21px', letterSpacing: '-0.28px',
                            color: C.textPrimary, margin: 0,
                          }}>
                            {renderBoldText(ideaText)}
                          </p>
                        </div>
                        {ideaObj && (ideaObj.differentiation || ideaObj.controversy || ideaObj.meme_potential || ideaObj.hook_strategy) && (
                          <div style={{ marginTop: '10px', marginLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {ideaObj.differentiation && (
                              <div style={{ fontFamily: font, fontSize: '12px', lineHeight: '18px' }}>
                                <span style={{ fontWeight: 600, color: C.primary }}>차별화</span>
                                <span style={{ fontWeight: 400, color: C.textSecondary, marginLeft: '6px' }}>{ideaObj.differentiation}</span>
                              </div>
                            )}
                            {ideaObj.controversy && (
                              <div style={{ fontFamily: font, fontSize: '12px', lineHeight: '18px' }}>
                                <span style={{ fontWeight: 600, color: '#E65100' }}>논란</span>
                                <span style={{ fontWeight: 400, color: C.textSecondary, marginLeft: '6px' }}>{ideaObj.controversy}</span>
                              </div>
                            )}
                            {ideaObj.meme_potential && (
                              <div style={{ fontFamily: font, fontSize: '12px', lineHeight: '18px' }}>
                                <span style={{ fontWeight: 600, color: '#7B1FA2' }}>밈</span>
                                <span style={{ fontWeight: 400, color: C.textSecondary, marginLeft: '6px' }}>{ideaObj.meme_potential}</span>
                              </div>
                            )}
                            {ideaObj.hook_strategy && (
                              <div style={{ fontFamily: font, fontSize: '12px', lineHeight: '18px' }}>
                                <span style={{ fontWeight: 600, color: '#F57F17' }}>후킹</span>
                                <span style={{ fontWeight: 400, color: C.textSecondary, marginLeft: '6px' }}>{ideaObj.hook_strategy}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 출처 아코디언 */}
            {topicSources.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.borderDefault}`, paddingTop: '16px' }}>
                <button
                  onClick={() => setSourcesOpen(!sourcesOpen)}
                  className="flex items-center w-full"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, gap: '6px',
                  }}
                >
                  <span style={{
                    fontFamily: font, fontSize: '13px', fontWeight: 500,
                    color: C.textTertiary,
                  }}>
                    출처 ({topicSources.length})
                  </span>
                  <span style={{
                    fontSize: '10px', color: C.textCaption,
                    transform: sourcesOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'inline-block',
                  }}>
                    ▼
                  </span>
                </button>
                {sourcesOpen && (
                  <div className="flex flex-col" style={{ gap: '6px', marginTop: '10px' }}>
                    {topicSources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start"
                        style={{
                          padding: '8px 12px', borderRadius: '8px',
                          backgroundColor: C.surfaceSecondary,
                          textDecoration: 'none', gap: '8px',
                          transition: 'background-color 0.15s ease',
                        }}
                        onPointerEnter={e => { e.currentTarget.style.backgroundColor = '#f0f0f0'; }}
                        onPointerLeave={e => { e.currentTarget.style.backgroundColor = C.surfaceSecondary; }}
                      >
                        <span style={{ fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>🔗</span>
                        <span style={{
                          fontFamily: font, fontSize: '12px', fontWeight: 400,
                          lineHeight: '18px', color: C.primary,
                          wordBreak: 'break-all',
                        }}>
                          {src.title || src.url}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Spinner keyframes */}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
