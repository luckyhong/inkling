import {Composition} from 'remotion';
import {ShortVideo} from './ShortVideo';
import {shortboard, totalFrames} from './shortboard';

export const RemotionRoot: React.FC = () => {
  const {project} = shortboard;

  return (
    <Composition
      id="ShortVideo"
      component={ShortVideo}
      durationInFrames={totalFrames}
      fps={project.fps}
      width={project.width}
      height={project.height}
      defaultProps={{}}
    />
  );
};
