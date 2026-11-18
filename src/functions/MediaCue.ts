import { KeyedObject } from '@spooder/plugin-sdk';

/**
 * One thing to play. This is the entire contract between the plugin and the overlay - the
 * overlay is handed a finished cue and never reads settings.json for itself, so a node can
 * play an asset the streamer picked seconds ago without the overlay reloading anything.
 */
export interface MediaCue {
  /** Unique per fire, so the overlay can address a specific playing cue (to stop it early). */
  id: string;
  mediaType: MediaType;
  /**
   * What to play: an asset path relative to this plugin's asset folder ("sound/bonk.mp3") for
   * sound, image and video.
   */
  src: string;
  /** 0..1. Ignored for images. */
  volume: number;
  /**
   * How long the cue stays on screen, in seconds. 0 means "as long as it naturally lasts":
   * a video plays to its end, an image falls back to IMAGE_DEFAULT_DURATION. Sounds ignore it.
   */
  duration: number;
  position: MediaPosition;
  /**
   * Percentage of the canvas's width and height the media may fill. It is scaled to fit inside
   * that, keeping its proportions. Not used by sound.
   */
  size: number;
}

export type MediaType = 'sound' | 'image' | 'video';

export type MediaPosition =
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

const MEDIA_TYPES: MediaType[] = ['sound', 'image', 'video'];

const POSITIONS: MediaPosition[] = [
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

/** An image has no natural length of its own, so one has to be picked for it. */
export const IMAGE_DEFAULT_DURATION = 5;

/**
 * Settings and node values both arrive as whatever the form wrote - a range field stores its
 * volume as the string "0.6", a number field that was cleared stores "". Everything below
 * coerces rather than trusts, so a half-filled node degrades to a sensible default instead of
 * sending NaN to the overlay.
 */
function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toMediaType(value: unknown): MediaType {
  return MEDIA_TYPES.includes(value as MediaType) ? (value as MediaType) : 'sound';
}

function toPosition(value: unknown): MediaPosition {
  return POSITIONS.includes(value as MediaPosition) ? (value as MediaPosition) : 'center';
}

/**
 * Turn one set of form values into a cue, or undefined when there is nothing to play.
 *
 * The same function serves both the `play_media` node and the legacy `settings.events` map,
 * because the two use identical field names - the old settings block was already
 * `{ media_type, sound, sound_volume }`, so it reads as a node's values without translation.
 */
export function buildMediaCue(values: KeyedObject | undefined): MediaCue | undefined {
  if (!values) {
    return undefined;
  }

  const mediaType = toMediaType(values.media_type);
  // The asset lives under the key named after its type, so the form can show one picker per
  // type and keep the other choices intact while the streamer switches between them.
  const src = String(values[mediaType] ?? '').trim();
  if (!src) {
    return undefined;
  }

  // `sound_volume` is what the old settings block called it; `volume` is what the node calls
  // it. Accept both rather than migrating every existing settings.json entry.
  const volume = clamp(toNumber(values.volume ?? values.sound_volume, 1), 0, 1);
  const duration = Math.max(0, toNumber(values.duration, 0));

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    mediaType,
    src,
    volume,
    duration: mediaType === 'image' && duration === 0 ? IMAGE_DEFAULT_DURATION : duration,
    position: toPosition(values.position),
    size: clamp(toNumber(values.size, 50), 1, 100),
  };
}
