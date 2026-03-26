import { AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig } from 'remotion';

type SubtitlePart = { text: string; bold: boolean };
type SubtitleWord = { word: string; bold: boolean; globalIndex: number };

function parseSubtitle(text: string): SubtitlePart[] {
  const parts: SubtitlePart[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    parts.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), bold: false });
  }
  if (parts.length === 0) parts.push({ text, bold: false });
  return parts;
}

function splitToWords(parts: SubtitlePart[]): SubtitleWord[] {
  const words: SubtitleWord[] = [];
  let idx = 0;
  for (const part of parts) {
    const tokens = part.text.split(/\s+/).filter(Boolean);
    for (const w of tokens) {
      words.push({ word: w, bold: part.bold, globalIndex: idx++ });
    }
  }
  return words;
}

export default function SubtitleOverlay({ subtitle }: { subtitle: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Container entry
  const containerEntry = spring({ frame, fps, config: { damping: 15, mass: 0.8 } });
  const containerScale = interpolate(containerEntry, [0, 1], [0.9, 1]);
  const containerOpacity = interpolate(containerEntry, [0, 1], [0, 1]);

  const parts = parseSubtitle(subtitle);
  const words = splitToWords(parts);

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 260 }}>
      {/* Shadow backdrop gradient */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
        pointerEvents: 'none',
      }} />

      {/* Subtitle container */}
      <div style={{
        transform: `scale(${containerScale})`,
        opacity: containerOpacity,
        textAlign: 'center',
        padding: '18px 44px',
        position: 'relative',
        zIndex: 1,
        maxWidth: '92%',
      }}>
        {/* Frosted background pill */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderRadius: 20,
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }} />

        {/* Words with stagger entrance */}
        <div style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexWrap: 'wrap',
          justifyContent: 'center', alignItems: 'baseline',
          gap: '4px 10px',
          lineHeight: 1.55,
        }}>
          {words.map((w) => {
            // Stagger: each word enters 2 frames after the previous
            const wordEntry = spring({
              frame: Math.max(0, frame - w.globalIndex * 2),
              fps,
              config: { damping: 14, mass: 0.4 },
            });
            const wordScale = interpolate(wordEntry, [0, 1], [0.7, 1]);
            const wordOpacity = interpolate(wordEntry, [0, 1], [0, 1]);
            const wordY = interpolate(wordEntry, [0, 1], [14, 0]);

            // Bold word subtle pulse
            const boldPulse = w.bold
              ? 1 + Math.sin((frame - w.globalIndex * 2) * 0.08) * 0.03
              : 1;

            return (
              <span key={w.globalIndex} style={{
                fontFamily: "'Pretendard Variable', Pretendard, sans-serif",
                fontSize: w.bold ? 56 : 48,
                fontWeight: w.bold ? 900 : 700,
                color: w.bold ? '#FFD93D' : 'white',
                textShadow: w.bold
                  ? '0 0 24px rgba(255,217,61,0.5), 0 0 50px rgba(255,217,61,0.15), 0 2px 8px rgba(0,0,0,0.6)'
                  : '0 2px 10px rgba(0,0,0,0.6), 0 0 20px rgba(0,0,0,0.3)',
                transform: `translateY(${wordY}px) scale(${wordScale * boldPulse})`,
                opacity: wordOpacity,
                display: 'inline-block',
                wordBreak: 'keep-all',
              }}>
                {w.word}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
