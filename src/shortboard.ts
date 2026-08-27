import rawShortboard from '../shortboard.json';
import type {Shortboard} from './types';

export const shortboard = rawShortboard as Shortboard;

export const totalFrames = Math.round(
  shortboard.project.duration_sec * shortboard.project.fps,
);
