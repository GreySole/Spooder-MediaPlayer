import { KeyedObject } from '@spooder/plugin-sdk';
import { ParsedClip } from '../providers';

/**
 * One clip to play. This is the whole contract with the overlay: it is handed a finished cue
 * and builds the embed from it, so it never reads settings or resolves URLs itself.
 */
export interface ClipCue {
  /** Unique per fire, so the overlay can address one playing cue. */
  id: string;
  /** Tells the overlay which kind of cue this is, next to sound, image and video. */
  mediaType: 'clip';
  /** The overlay refuses a cue with no `src`; for a clip it is the same as `videoId`. */
  src: string;
  provider: ParsedClip['provider'];
  /** The provider's own id for the video: Twitch slug, YouTube id, Vimeo id, Streamable shortcode. */
  videoId: string;
  /** Vimeo's unlisted-video hash. */
  hash?: string;
  /** Seconds into the video to start from. */
  start: number;
  /**
   * How long the cue stays on screen, in seconds. The embeds are cross-origin and report no
   * "ended" event, so the overlay can only be told up front how long to wait.
   */
  duration: number;
  muted: boolean;
  position: ClipPosition;
  /** Percentage of the canvas's width and height the clip may fill, at 16:9. */
  size: number;
  title?: string;
}

export type ClipPosition =
  | 'center'
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'
  | 'random';

const POSITIONS: ClipPosition[] = [
  'center',
  'top-left',
  'top',
  'top-right',
  'left',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
  'random',
];

/** Used when a URL has no known length and the node did not say. */
export const DEFAULT_DURATION = 30;

/** Cushion against the embed's own startup, so a clip is not cut off a beat before it ends. */
export const DURATION_SLACK = 1;

/** Form values arrive as whatever the field wrote: "" for a cleared number, "0.6" for a range. */
export function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Presentation fields shared by both nodes. */
function presentation(values: KeyedObject) {
  return {
    muted: values.muted === true || values.muted === 'true',
    position: POSITIONS.includes(values.position) ? (values.position as ClipPosition) : 'center',
    size: clamp(toNumber(values.size, 60), 1, 100),
  };
}

function newCueId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A cue for a pasted URL. `duration` of 0 on the node means "use the default", not "no limit". */
export function buildUrlCue(clip: ParsedClip, values: KeyedObject): ClipCue {
  const duration = Math.max(0, toNumber(values.duration, 0));
  return {
    id: newCueId(),
    mediaType: 'clip',
    src: clip.id,
    provider: clip.provider,
    videoId: clip.id,
    hash: clip.hash,
    start: clip.start ?? 0,
    duration: duration > 0 ? duration : DEFAULT_DURATION,
    ...presentation(values),
  };
}

/** The subset of Helix's Get Clips response this plugin reads. */
export interface TwitchClip {
  id: string;
  title: string;
  broadcaster_name: string;
  view_count: number;
  created_at: string;
  duration: number;
  is_featured: boolean;
}

/**
 * A cue for a looked-up Twitch clip. The length comes from Helix, so unlike a URL cue it is
 * known: `max_duration` is a ceiling, never a target.
 */
export function buildTwitchCue(clip: TwitchClip, values: KeyedObject): ClipCue {
  const cap = Math.max(0, toNumber(values.max_duration, 0));
  const natural = Math.max(1, toNumber(clip.duration, DEFAULT_DURATION)) + DURATION_SLACK;
  return {
    id: newCueId(),
    mediaType: 'clip',
    src: clip.id,
    provider: 'twitch',
    videoId: clip.id,
    start: 0,
    duration: cap > 0 ? Math.min(natural, cap + DURATION_SLACK) : natural,
    title: clip.title,
    ...presentation(values),
  };
}
