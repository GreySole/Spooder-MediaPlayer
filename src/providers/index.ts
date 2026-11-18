import { parseStreamable } from './streamable';
import { parseTwitch } from './twitch';
import { parseVimeo } from './vimeo';
import { parseYouTube } from './youtube';

export type ClipProvider = 'twitch' | 'youtube' | 'vimeo' | 'streamable';

export interface ParsedClip {
  provider: ClipProvider;
  id: string;
  /** Seconds into the video to start from, when the URL carries a timestamp. */
  start?: number;
  /** Vimeo only: the hash that unlisted videos need in the embed. */
  hash?: string;
}

/** What a provider's parser returns; the registry fills in `provider`. */
export type ParsedClipBody = Omit<ParsedClip, 'provider'>;

const PROVIDERS: { id: ClipProvider; parse: (url: URL) => ParsedClipBody | undefined }[] = [
  { id: 'twitch', parse: parseTwitch },
  { id: 'youtube', parse: parseYouTube },
  { id: 'vimeo', parse: parseVimeo },
  { id: 'streamable', parse: parseStreamable },
];

/**
 * Work out which provider a pasted URL belongs to and pull the video id out of it.
 * Returns undefined for anything that is not a supported provider's video URL; the caller
 * logs that rather than guessing.
 *
 * Only http(s) is accepted. The id ends up in an iframe src built by the overlay, so nothing
 * but the extracted id is ever passed on - the URL itself is never embedded.
 */
export function parseClipUrl(input: string): ParsedClip | undefined {
  let url: URL;
  try {
    // Chat-pasted links often lose the scheme.
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }

  for (const provider of PROVIDERS) {
    const parsed = provider.parse(url);
    if (parsed) {
      return { provider: provider.id, ...parsed };
    }
  }
  return undefined;
}

/** Host matches `domain` or any subdomain of it. */
export function hostIs(url: URL, domain: string): boolean {
  const host = url.hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

/** Path segments with the empty ones dropped. */
export function segments(url: URL): string[] {
  return url.pathname.split('/').filter(Boolean);
}
