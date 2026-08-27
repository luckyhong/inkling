import type {CSSProperties} from 'react';
import {useCurrentFrame} from 'remotion';
import {revealProgress} from './easing';

type HookTextProps = {
  text: string;
  startFrame: number;
  durationFrames: number;
};

// Same left-to-right clip-path reveal mechanism as upstream's TextWipe,
// renamed for inkling's hook/punchline/sfx pipeline (PRD F15). The text
// box geometry (top/left/width) matches LayerWipe's drawing-area top (382)
// so the hook sits cleanly above the illustration on the shared 1080x1440
// canvas.
const textStyle = (fontSize: number): CSSProperties => ({
  fontFamily: 'OriginalDiaryHand, STKaiti, serif',
  fontSize,
  fontWeight: 400,
  lineHeight: 1.34,
  letterSpacing: '0.025em',
  color: '#171714',
  WebkitTextStroke: '0.7px #171714',
  margin: 0,
  maxWidth: 888,
  textAlign: 'left',
  whiteSpace: 'pre-line',
  transform: 'rotate(-0.35deg)',
});

// PRD §8.2: hook must stay to one or two lines, under ~18 hanzi/line.
const fontSizeFor = (text: string) => {
  const lines = text.split('\n').filter(Boolean);
  const lineCount = Math.max(1, lines.length);
  const longestLine = Math.max(...lines.map((line) => line.length), 1);
  const widthLimited = Math.floor(888 / (longestLine * 1.08));
  const heightLimited = Math.floor(306 / (lineCount * 1.28));
  return Math.max(48, Math.min(82, widthLimited, heightLimited));
};

export const HookText: React.FC<HookTextProps> = ({
  text,
  startFrame,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const progress = revealProgress(frame, startFrame, durationFrames);
  const fontSize = fontSizeFor(text);

  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 40,
        top: 92,
        left: 96,
        right: 96,
        display: 'flex',
        justifyContent: 'flex-start',
        clipPath: `inset(0 ${100 - progress * 100}% 0 0)`,
      }}
    >
      <p style={textStyle(fontSize)}>{text}</p>
    </div>
  );
};
