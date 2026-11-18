import type { ParsedClipBody } from '.';
import { hostIs, segments } from '.';

const SHORTCODE = /^[a-z0-9]{4,10}$/i;

/** streamable.com/<code>, and the /e/, /o/, /s/ forms of it. */
export function parseStreamable(url: URL): ParsedClipBody | undefined {
  if (!hostIs(url, 'streamable.com')) {
    return undefined;
  }
  const parts = segments(url);
  const code = ['e', 'o', 's', 'm', 'edit'].includes(parts[0]) ? parts[1] : parts[0];
  return code && SHORTCODE.test(code) ? { id: code } : undefined;
}
