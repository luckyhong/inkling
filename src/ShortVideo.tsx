import {AbsoluteFill, useVideoConfig} from 'remotion';
import {HookText} from './HookText';
import {LayerWipe} from './LayerWipe';
import {PunchlineOverlay} from './PunchlineOverlay';
import {SfxTrack} from './SfxTrack';
import {shortboard} from './shortboard';

const toFrame = (sec: number, fps: number) => Math.round(sec * fps);

// Single-scene pipeline per PRD F15: HookText -> BwWipe -> ColorWipe ->
// PunchlineOverlay -> SfxTrack. Unlike upstream's multi-scene StoryVideo,
// there is no Series/page-flip here — inkling is MVP single-scene only.
export const ShortVideo: React.FC = () => {
  const {fps, durationInFrames} = useVideoConfig();
  const {project, scene} = shortboard;
  const {beats} = project;

  const hookEndFrame = toFrame(beats.hook_end_sec, fps);
  const drawStartFrame = toFrame(beats.draw_start_sec, fps);
  const bwCompleteFrame = toFrame(beats.bw_complete_sec, fps);
  const colorCompleteFrame = toFrame(beats.color_complete_sec, fps);
  const punchlineStartFrame = toFrame(beats.punchline_start_sec, fps);

  return (
    <AbsoluteFill style={{backgroundColor: '#FFFFFF', overflow: 'hidden'}}>
      {scene.assets.bw ? (
        <LayerWipe
          src={scene.assets.bw}
          startFrame={drawStartFrame}
          durationFrames={Math.max(1, bwCompleteFrame - drawStartFrame)}
          zIndex={10}
          treatment="bw"
        />
      ) : null}

      {scene.assets.color ? (
        <LayerWipe
          src={scene.assets.color}
          startFrame={bwCompleteFrame}
          durationFrames={Math.max(1, colorCompleteFrame - bwCompleteFrame)}
          zIndex={20}
          treatment="color"
        />
      ) : null}

      <HookText text={scene.hook_text} startFrame={0} durationFrames={hookEndFrame} />

      <PunchlineOverlay
        text={scene.punchline_text}
        creditTo={scene.credit_to}
        startFrame={punchlineStartFrame}
      />

      <SfxTrack
        enabled={project.sfx}
        fps={fps}
        hookEndSec={beats.hook_end_sec}
        bwCompleteSec={beats.bw_complete_sec}
        colorCompleteSec={beats.color_complete_sec}
        totalFrames={durationInFrames}
      />
    </AbsoluteFill>
  );
};
