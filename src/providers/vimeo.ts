import type { ParsedClipBody } from '.';
import { hostIs, segments } from '.';

/**
 * vimeo.com/<id>
 * vimeo.com/<id>/<hash>              (unlisted)
 * vimeo.com/channels/<name>/<id>, vimeo.com/groups/<name>/videos/<id>
 * player.vimeo.com/video/<id>?h=<hash>
 */
export function parseVimeo(url: URL): ParsedClipBody | undefined {
  if (!hostIs(url, 'vimeo.com')) {
    return undefined;
  }

  const parts = segments(url);
  const idAt = parts.findIndex((p) => /^\d+$/.test(p));
  if (idAt < 0) {
    return undefined;
  }

  const hash = url.searchParams.get('h') ?? parts[idAt + 1];
  return hash && /^[a-f0-9]+$/i.test(hash) ? { id: parts[idAt], hash } : { id: parts[idAt] };
}
