import type { ParsedClipBody } from '.';
import { hostIs, segments } from '.';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** "90", "90s" and "1h2m3s" all turn up in `t=`. */
function parseTimestamp(raw: string | null): number | undefined {
  if (!raw) {
    return undefined;
  }
  if (/^\d+s?$/.test(raw)) {
    return parseInt(raw, 10);
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!match || !match[0]) {
    return undefined;
  }
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/**
 * youtube.com/watch?v=<id>
 * youtu.be/<id>
 * youtube.com/shorts/<id>, /embed/<id>, /live/<id>, /v/<id>
 */
export function parseYouTube(url: URL): ParsedClipBody | undefined {
  const host = url.hostname.toLowerCase();
  const parts = segments(url);
  let id: string | undefined;

  if (host === 'youtu.be') {
    id = parts[0];
  } else if (hostIs(url, 'youtube.com') || hostIs(url, 'youtube-nocookie.com')) {
    if (parts[0] === 'watch') {
      id = url.searchParams.get('v') ?? undefined;
    } else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) {
      id = parts[1];
    }
  }

  if (!id || !VIDEO_ID.test(id)) {
    return undefined;
  }
  const start = parseTimestamp(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return start ? { id, start } : { id };
}
