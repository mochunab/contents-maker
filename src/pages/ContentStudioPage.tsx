import { useNavigate } from 'react-router-dom';
import ArrowLeft from '../components/ArrowLeft';

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
  textTertiary: '#6d6d6d',
  textCaption: '#848484',
  textDisabled: '#b7b7b7',
};

type ContentCard = {
  id: string;
  title: string;
  description: string;
  icon: string;
  path: string;
  ready: boolean;
};

const CONTENT_CARDS: ContentCard[] = [
  {
    id: 'trend-tracker',
    title: '트렌드 추적기',
    description: 'X 실시간 트렌드를 확인하고 바로 콘텐츠를 만들어요',
    icon: '🔥',
    path: '/trend-tracker',
    ready: true,
  },
  {
    id: 'thumbnail',
    title: '썸네일 만들기',
    description: '레퍼런스 기반으로 AI가 썸네일을 만들어줘요',
    icon: '🖼️',
    path: '/thumbnail',
    ready: true,
  },
  {
    id: 'ad-copy',
    title: '광고 카피 만들기',
    description: 'AI가 전환율 높은 광고 카피를 만들어줘요',
    icon: '✍️',
    path: '/ad-copy',
    ready: true,
  },
  {
    id: 'ad-creative',
    title: '광고 소재 만들기',
    description: 'AI가 인스타 광고 포스터를 만들어줘요',
    icon: '📸',
    path: '/ad-creative',
    ready: true,
  },
  {
    id: 'card-news',
    title: '카드뉴스 만들기',
    description: 'AI가 카드뉴스를 자동으로 만들어줘요',
    icon: '🗞️',
    path: '/card-news',
    ready: true,
  },
  {
    id: 'short-form',
    title: '숏폼 만들기',
    description: 'AI가 숏폼 영상을 자동으로 만들어줘요',
    icon: '🎬',
    path: '/short-form',
    ready: true,
  },
  {
    id: 'meme-ad',
    title: '밈광고영상 만들기',
    description: '밈 후크 + AI 광고 영상을 합쳐줘요',
    icon: '🎪',
    path: '/meme-ad',
    ready: true,
  },
];

export default function ContentStudioPage() {
  const navigate = useNavigate();

  return (
    <div className="bg-white relative min-h-screen w-full flex justify-center">
      <div className="w-full max-w-[440px] relative" style={{ fontFamily: font }}>

        {/* NavigationHeader */}
        <div className="bg-white h-[52px] shrink-0 w-full z-20 fixed top-0 left-1/2 -translate-x-1/2 max-w-[440px]">
          <div className="flex flex-col justify-center size-full">
            <div className="content-stretch flex items-center justify-between px-[12px] py-[4px] relative size-full">
              <ArrowLeft onClick={() => navigate(-1)} />
              <p style={{
                fontFamily: font, fontSize: '18px', fontWeight: 600,
                lineHeight: '25.5px', letterSpacing: '-0.36px',
                color: C.textBlack, textAlign: 'center',
              }}>
                콘텐츠 만들기
              </p>
              <div className="w-[44px]" />
            </div>
          </div>
        </div>

        {/* 헤더 여백 */}
        <div className="h-[60px]" />

        {/* Main */}
        <div style={{ padding: '0 20px' }}>
          <div style={{ marginTop: '8px', marginBottom: '24px' }}>
            <h1 style={{
              fontFamily: font, fontSize: '22px', fontWeight: 600,
              lineHeight: '32.5px', letterSpacing: '-0.22px',
              color: C.textPrimary, margin: 0,
            }}>
              AI 콘텐츠 스튜디오
            </h1>
            <p style={{
              fontFamily: font, fontSize: '15px', fontWeight: 400,
              lineHeight: '20px', letterSpacing: '-0.45px',
              color: C.textTertiary, marginTop: '8px',
            }}>
              AI가 콘텐츠 제작을 도와드려요
            </p>
          </div>

          {/* Cards */}
          <div className="flex flex-col" style={{ gap: '12px' }}>
            {CONTENT_CARDS.map(card => (
              <button
                key={card.id}
                onClick={() => card.ready && navigate(card.path)}
                className="w-full flex items-start"
                style={{
                  padding: '20px', borderRadius: '16px',
                  backgroundColor: card.ready ? C.surface : C.surfaceSecondary,
                  border: `1px solid ${C.borderDefault}`,
                  cursor: card.ready ? 'pointer' : 'default',
                  opacity: card.ready ? 1 : 0.6,
                  textAlign: 'left',
                  gap: '16px',
                  transition: 'all 0.15s ease',
                }}
                onPointerDown={e => { if (card.ready) e.currentTarget.style.transform = 'scale(0.99)'; }}
                onPointerUp={e => { e.currentTarget.style.transform = ''; }}
                onPointerLeave={e => { e.currentTarget.style.transform = ''; }}
              >
                {/* Icon */}
                <div className="flex items-center justify-center shrink-0" style={{
                  width: '48px', height: '48px', borderRadius: '16px',
                  backgroundColor: C.primaryLight,
                  fontSize: '24px',
                }}>
                  {card.icon}
                </div>

                {/* Text */}
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="flex items-center" style={{ gap: '8px' }}>
                    <span style={{
                      fontFamily: font, fontSize: '16px', fontWeight: 600,
                      lineHeight: '25px', letterSpacing: '-0.32px',
                      color: C.textPrimary,
                    }}>
                      {card.title}
                    </span>
                    {!card.ready && (
                      <span style={{
                        fontFamily: font, fontSize: '10px', fontWeight: 600,
                        padding: '2px 6px', borderRadius: '4px',
                        backgroundColor: C.primaryLight, color: C.primaryDark,
                      }}>
                        준비 중
                      </span>
                    )}
                  </div>
                  <p style={{
                    fontFamily: font, fontSize: '13px', fontWeight: 400,
                    lineHeight: '20px', letterSpacing: '-0.3px',
                    color: C.textCaption, marginTop: '4px',
                  }}>
                    {card.description}
                  </p>
                </div>

                {/* Arrow */}
                {card.ready && (
                  <div className="flex items-center shrink-0" style={{ marginTop: '12px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textDisabled} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
