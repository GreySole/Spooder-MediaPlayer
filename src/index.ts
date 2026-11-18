import { KeyedObject, OSCMessage, PluginBase, StreamMessage } from '@spooder/plugin-sdk';
import { buildTwitchCue, buildUrlCue, ClipCue, toNumber } from './functions/ClipCue';
import { buildMediaCue, MediaCue } from './functions/MediaCue';
import { ClipStrategy, findClip } from './functions/TwitchClips';
import { parseClipUrl } from './providers';

/**
 * Media Player
 *
 * Sends finished playback cues to the overlay at /overlay/media_player. Two ways in:
 *
 *  - a `Play Media` action node (events-form.json), where the asset is picked on the node
 *    itself. This is the way to build new events.
 *  - the legacy `events` map in settings.json, keyed by event name. Kept working so setups
 *    from before the node editor keep firing, but nothing new needs to be added there.
 *
 * Clips are the exception to "everything is a local asset": `Play URL` and `Play Clip` hand the
 * overlay a provider and a video id (Twitch, YouTube, Vimeo, Streamable) and the overlay embeds
 * that provider's player. Twitch will only embed into a page served from https on a real domain
 * (or localhost), so the overlay checks where it is running and, if it cannot play a Twitch
 * clip, says on screen how to turn on public serving. That is checked there rather than here
 * because only the overlay knows which address it was opened from.
 */
export default class MediaPlayer extends PluginBase {
  /** Address prefix the overlay listens on. */
  static readonly OSC_PREFIX = '/media_player';

  onEvent(type: string, data: StreamMessage) {
    if (type === 'stop_media') {
      this.stopAll();
      return;
    }

    if (type === 'play_url') {
      this.playUrl(data?.pluginEventData ?? {});
      return;
    }

    if (type === 'play_clip') {
      // Deliberately not awaited: onEvent is fire-and-forget, and a Helix round trip should
      // not hold up the rest of the graph.
      void this.playTwitchClip(data?.pluginEventData ?? {});
      return;
    }

    // A node fires with its own values attached; the legacy path fires with nothing but a
    // name, which is looked up in settings.json instead.
    const values = data?.pluginEventData ?? this.getLegacyEvent(type);
    const cue = buildMediaCue(values);

    if (!cue) {
      this.pluginLog(`No media configured for event '${type}'`);
      return;
    }

    this.play(cue);
  }

  /**
   * Other plugins can drive this one over OSC: send /media_player/play with a JSON object
   * holding the same fields the node uses, e.g. {"media_type":"sound","sound":"sound/bonk.mp3"}.
   */
  onOSC(message: OSCMessage) {
    const address = Array.isArray(message.address) ? message.address.join('/') : message.address;
    if (address !== `${MediaPlayer.OSC_PREFIX}/request`) {
      return;
    }

    const cue = buildMediaCue(this.parseArg(message.args?.[0]));
    if (cue) {
      this.play(cue);
    }
  }

  playUrl(values: KeyedObject) {
    const url = String(values.url ?? '').trim();
    if (!url) {
      this.pluginLog('Play URL fired with no URL.');
      return;
    }

    const clip = parseClipUrl(url);
    if (!clip) {
      this.pluginLog(`'${url}' is not a Twitch, YouTube, Vimeo or Streamable video link.`);
      return;
    }

    this.play(buildUrlCue(clip, values));
  }

  async playTwitchClip(values: KeyedObject) {
    const result = await findClip(this, String(values.username ?? ''), {
      strategy: (values.selection as ClipStrategy) ?? 'random',
      periodDays: Math.max(0, toNumber(values.period_days, 0)),
      maxDuration: Math.max(0, toNumber(values.max_duration, 0)),
    });

    if (!result.ok) {
      this.pluginLog(result.reason);
      return;
    }

    this.pluginLog(
      `Playing clip '${result.clip.title}' from ${result.clip.broadcaster_name} ` +
        `(${result.clip.view_count} views)`,
    );
    this.play(buildTwitchCue(result.clip, values));
  }

  play(cue: MediaCue | ClipCue) {
    this.osc.sendToTCP(`${MediaPlayer.OSC_PREFIX}/play`, JSON.stringify(cue));
  }

  /** Clears whatever the overlay is currently showing or playing. */
  stopAll() {
    this.osc.sendToTCP(`${MediaPlayer.OSC_PREFIX}/stop`, JSON.stringify({ id: 'all' }));
  }

  /** The pre-node configuration: settings.events[eventName]. Undefined when there is no entry. */
  private getLegacyEvent(eventName: string): KeyedObject | undefined {
    const events = this.settings?.events as KeyedObject | undefined;
    return events?.[eventName];
  }

  /** OSC args arrive as a JSON string from most senders and as an object from a few. */
  private parseArg(arg: unknown): KeyedObject | undefined {
    if (arg && typeof arg === 'object') {
      return arg as KeyedObject;
    }
    if (typeof arg !== 'string') {
      return undefined;
    }
    try {
      return JSON.parse(arg);
    } catch (e) {
      this.pluginLog('Could not parse OSC media request:', arg);
      return undefined;
    }
  }
}
