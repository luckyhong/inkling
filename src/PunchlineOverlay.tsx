import {interpolate, useCurrentFrame} from 'remotion';

type PunchlineOverlayProps = {
  text: string;
  creditTo?: string | null;
  startFrame: number;
};

// PRD §8.3: short, snappy appear — no bounce/spring overshoot. 10 frames
// (~0.33s @30fps) of ease-out opacity+scale, landing exactly on 1/1.
const APPEAR_FRAMES = 10;

export const PunchlineOverlay: React.FC<PunchlineOverlayProps> = ({
  text,
  creditTo,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [startFrame, startFrame + APPEAR_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const eased = 1 - (1 - t) * (1 - t); // ease-out, no overshoot
  const opacity = eased;
  const scale = 0.96 + eased * 0.04;

  if (frame < startFrame) return null;

  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 50,
        left: 96,
        right: 96,
        bottom: 96,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center bottom',
      }}
    >
      <div
        style={{
          background: 'rgba(255, 252, 244, 0.92)',
          border: '2.5px solid #171714',
          borderRadius: 10,
          padding: '20px 32px',
          transform: 'rotate(-1.1deg)',
          boxShadow: '0 4px 0 rgba(23, 23, 20, 0.18)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: 'OriginalDiaryHand, STKaiti, serif',
            fontSize: 56,
            fontWeight: 700,
            color: '#171714',
            textAlign: 'center',
            lineHeight: 1.3,
            whiteSpace: 'pre-line',
          }}
        >
          {text}
        </p>
        {creditTo ? (
          <p
            style={{
              margin: '8px 0 0',
              fontFamily: 'STKaiti, serif',
              fontSize: 22,
              fontWeight: 400,
              color: '#5a584f',
              textAlign: 'center',
            }}
          >
            {creditTo}
          </p>
        ) : null}
      </div>
    </div>
  );
};
