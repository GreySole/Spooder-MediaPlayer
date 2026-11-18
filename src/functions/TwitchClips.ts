import { KeyedObject } from '@spooder/plugin-sdk';
import type MediaPlayer from '..';
import { toNumber, TwitchClip } from './ClipCue';

/** How a clip is chosen out of the ones the lookup returned. */
export type ClipStrategy = 'random' | 'most_viewed' | 'most_recent' | 'featured';

/** Helix caps Get Clips at 100 per page, and one page is plenty to pick from. */
const CLIP_PAGE_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything that can go wrong before there is a clip to play, as a message worth showing.
 * The plugin logs these rather than throwing: a shoutout that finds no clip should carry on
 * with the rest of the graph, not take the event down with it.
 */
export type ClipLookupResult = { ok: true; clip: TwitchClip } | { ok: false; reason: string };

/**
 * Narrow the fetched clips to those short enough, then pick one.
 *
 * `featured` falls back to the whole list rather than failing: most channels have never marked
 * a featured clip, and a shoutout that silently does nothing is worse than one that plays a
 * merely popular clip.
 */
export function selectClip(
  clips: TwitchClip[],
  strategy: ClipStrategy,
  maxDuration: number,
): TwitchClip | undefined {
  let pool = maxDuration > 0 ? clips.filter((c) => toNumber(c.duration, 0) <= maxDuration) : clips;

  // Every clip being too long is worth distinguishing from the channel having no clips, so
  // the filter is not quietly widened here - the caller reports on an empty pool.
  if (pool.length === 0) {
    return undefined;
  }

  if (strategy === 'featured') {
    const featured = pool.filter((c) => c.is_featured);
    if (featured.length > 0) {
      pool = featured;
    }
  }

  switch (strategy) {
    case 'most_viewed':
      return [...pool].sort((a, b) => toNumber(b.view_count, 0) - toNumber(a.view_count, 0))[0];
    case 'most_recent':
      return [...pool].sort(
        (a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''),
      )[0];
    case 'random':
    case 'featured':
    default:
      return pool[Math.floor(Math.random() * pool.length)];
  }
}

/**
 * Look up one clip for a channel.
 *
 * Get Clips needs no scope beyond a valid token, so this rides the broadcaster's existing
 * credentials - clip lookup costs the streamer no new Twitch permission.
 */
export async function findClip(
  plugin: MediaPlayer,
  username: string,
  options: { strategy: ClipStrategy; periodDays: number; maxDuration: number },
): Promise<ClipLookupResult> {
  const twitch = plugin.getModule('twitch');
  // The module can be present but bare while logged out.
  if (!twitch?.getUserInfo || !twitch?.callBroadcasterApi) {
    return { ok: false, reason: 'The Twitch module is not connected.' };
  }

  const login = username.trim().replace(/^@/, '').toLowerCase();
  if (!login) {
    return { ok: false, reason: 'No username was given to look up clips for.' };
  }

  const userInfo = await twitch.getUserInfo(login);
  if (!userInfo?.id) {
    return { ok: false, reason: `No Twitch user found for '${login}'.` };
  }

  const params = new URLSearchParams({
    broadcaster_id: userInfo.id,
    first: String(CLIP_PAGE_SIZE),
  });

  // Helix defaults ended_at to a week after started_at when it is left off, which would turn a
  // 90-day window into the first week of it. Always send the pair.
  if (options.periodDays > 0) {
    const now = Date.now();
    params.set('started_at', new Date(now - options.periodDays * DAY_MS).toISOString());
    params.set('ended_at', new Date(now).toISOString());
  }

  let response: KeyedObject | undefined;
  try {
    response = (await twitch.callBroadcasterApi(
      `https://api.twitch.tv/helix/clips?${params.toString()}`,
    )) as KeyedObject | undefined;
  } catch (e) {
    return { ok: false, reason: `Twitch clip lookup failed: ${(e as Error)?.message ?? e}` };
  }

  const clips = (response?.data ?? []) as TwitchClip[];
  if (clips.length === 0) {
    const window = options.periodDays > 0 ? ` in the last ${options.periodDays} days` : '';
    return { ok: false, reason: `${login} has no clips${window}.` };
  }

  const clip = selectClip(clips, options.strategy, options.maxDuration);
  if (!clip) {
    return {
      ok: false,
      reason: `All ${clips.length} of ${login}'s clips are longer than ${options.maxDuration}s.`,
    };
  }

  return { ok: true, clip };
}
