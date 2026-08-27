import {Audio, Loop, Sequence, interpolate, staticFile} from 'remotion';

type SfxTrackProps = {
  enabled: boolean;
  fps: number;
  hookEndSec: number;
  bwCompleteSec: number;
  colorCompleteSec: number;
  totalFrames: number;
};

const SFX_LOOP_FRAMES = 60; // each generated sample is 2s @ 30fps, see scripts/generate-sfx.mjs

const toFrame = (sec: number, fps: number) => Math.round(sec * fps);

// PRD §4.3/§8.1: procedural draw-noise beds, not voiceover/BGM. Sequential
// phases (rustle -> pencil -> marker), fading out under the punchline.
export const SfxTrack: React.FC<SfxTrackProps> = ({
  enabled,
  fps,
  hookEndSec,
  bwCompleteSec,
  colorCompleteSec,
  totalFrames,
}) => {
  if (!enabled) return null;

  const hookEndFrame = toFrame(hookEndSec, fps);
  const bwCompleteFrame = toFrame(bwCompleteSec, fps);
  const colorCompleteFrame = toFrame(colorCompleteSec, fps);

  const punchlineFrames = Math.max(1, totalFrames - colorCompleteFrame);
  const fadeOutFrames = Math.min(30, punchlineFrames);

  return (
    <>
      {hookEndFrame > 0 ? (
        <Sequence from={0} durationInFrames={hookEndFrame} name="sfx-hook">
          <Loop durationInFrames={SFX_LOOP_FRAMES}>
            <Audio src={staticFile('assets/sfx/paper-rustle.wav')} volume={0.4} />
          </Loop>
        </Sequence>
      ) : null}

      {bwCompleteFrame > hookEndFrame ? (
        <Sequence
          from={hookEndFrame}
          durationInFrames={bwCompleteFrame - hookEndFrame}
          name="sfx-bw"
        >
          <Loop durationInFrames={SFX_LOOP_FRAMES}>
            <Audio src={staticFile('assets/sfx/pencil-scratch.wav')} />
          </Loop>
        </Sequence>
      ) : null}

      {colorCompleteFrame > bwCompleteFrame ? (
        <Sequence
          from={bwCompleteFrame}
          durationInFrames={colorCompleteFrame - bwCompleteFrame}
          name="sfx-color"
        >
          <Loop durationInFrames={SFX_LOOP_FRAMES}>
            <Audio
              src={staticFile('assets/sfx/marker-squeak.wav')}
              volume={(localFrame) =>
                interpolate(
                  localFrame,
                  [colorCompleteFrame - bwCompleteFrame - fadeOutFrames, colorCompleteFrame - bwCompleteFrame],
                  [1, 0],
                  {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
                )
              }
            />
          </Loop>
        </Sequence>
      ) : null}
    </>
  );
};
