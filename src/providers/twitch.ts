import type { ParsedClipBody } from '.';
import { hostIs, segments } from '.';

/** Clip slugs are letters, digits, '-' and '_' (e.g. "AwkwardHelplessSalamanderSwiftRage-xyz"). */
const SLUG = /^[A-Za-z0-9_-]{8,}$/;

/**
 * clips.twitch.tv/<slug>
 * twitch.tv/<channel>/clip/<slug>
 * m.twitch.tv/<channel>/clip/<slug>
 * clips.twitch.tv/embed?clip=<slug>
 */
export function parseTwitch(url: URL): ParsedClipBody | undefined {
  const parts = segments(url);

  if (url.hostname.toLowerCase() === 'clips.twitch.tv') {
    const fromQuery = url.searchParams.get('clip');
    const slug = parts[0] === 'embed' ? fromQuery : parts[0];
    return slug && SLUG.test(slug) ? { id: slug } : undefined;
  }

  if (hostIs(url, 'twitch.tv')) {
    const clipAt = parts.indexOf('clip');
    const slug = clipAt >= 0 ? parts[clipAt + 1] : undefined;
    return slug && SLUG.test(slug) ? { id: slug } : undefined;
  }

  return undefined;
}
