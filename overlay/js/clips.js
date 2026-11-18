/*
    Clip playback: Twitch, YouTube, Vimeo and Streamable.

    Each clip becomes one iframe pointing at the provider's own embed. The embeds are
    cross-origin and report nothing back, so a cue ends when the duration the plugin set for it
    runs out.

    Twitch authorises its embed by the page showing it: it answers with
    `Content-Security-Policy: frame-ancestors <scheme>://<parent>`, built from the parent we ask
    for, and the browser enforces that against this page's real address. Measured against the
    live endpoint:

      - a non-loopback IP address as parent is refused outright;
      - localhost and 127.0.0.0/8 are allowed on http and any port;
      - any other hostname is https only, on the default port.

    The other providers do not care where they are embedded, so only Twitch is checked. When
    Twitch would refuse, nothing is embedded - the frame would just be a black rectangle - and
    a notice on the overlay says how to fix it instead.
*/

function isIpLiteral(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.indexOf(':') !== -1;
}

/** IPv4 loopback is the one IP form Twitch accepts. ::1 is refused like any other address. */
function isLoopback(hostname) {
  return hostname === 'localhost' || /^127\./.test(hostname);
}

function twitchRefusedHere() {
  const host = window.location.hostname;
  if (isLoopback(host)) {
    return false;
  }
  const defaultPort = window.location.port === '' || window.location.port === '443';
  return isIpLiteral(host) || window.location.protocol !== 'https:' || !defaultPort;
}

function toQuery(params) {
  return new URLSearchParams(params).toString();
}

/* One builder per provider; each returns the iframe src for a cue. */
var CLIP_EMBEDS = {
  twitch: function (cue) {
    return (
      'https://clips.twitch.tv/embed?' +
      toQuery({
        clip: cue.videoId,
        parent: window.location.hostname,
        autoplay: 'true',
        muted: cue.muted ? 'true' : 'false',
      })
    );
  },

  youtube: function (cue) {
    const params = {
      autoplay: '1',
      mute: cue.muted ? '1' : '0',
      controls: '0',
      rel: '0',
      playsinline: '1',
      modestbranding: '1',
    };
    if (cue.start > 0) {
      params.start = String(Math.floor(cue.start));
    }
    // `end` is measured from the start of the video, not from `start`.
    params.end = String(Math.floor(cue.start || 0) + Math.ceil(cue.duration));
    return (
      'https://www.youtube.com/embed/' + encodeURIComponent(cue.videoId) + '?' + toQuery(params)
    );
  },

  vimeo: function (cue) {
    const params = {
      autoplay: '1',
      muted: cue.muted ? '1' : '0',
      controls: '0',
      title: '0',
      byline: '0',
      portrait: '0',
      autopause: '0',
    };
    if (cue.hash) {
      params.h = cue.hash;
    }
    const time = cue.start > 0 ? '#t=' + Math.floor(cue.start) + 's' : '';
    return (
      'https://player.vimeo.com/video/' + encodeURIComponent(cue.videoId) + '?' + toQuery(params) + time
    );
  },

  streamable: function (cue) {
    return (
      'https://streamable.com/e/' +
      encodeURIComponent(cue.videoId) +
      '?' +
      toQuery({ autoplay: '1', muted: cue.muted ? '1' : '0', nocontrols: '1' })
    );
  },
};

/* How long the "can't play this" notice stays up, and a guard so repeats don't stack. */
var NOTICE_SECONDS = 20;
var activeNotice = null;

function showNotice(lines) {
  if (activeNotice) {
    return;
  }

  const box = document.createElement('div');
  box.style.cssText =
    'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
    'max-width:70vmin;padding:2.5vmin 3vmin;border-radius:1.5vmin;' +
    'background:rgba(20,20,28,0.92);color:#fff;font:600 2.4vmin/1.45 sans-serif;' +
    'border:0.3vmin solid #ff6b6b;';
  box.innerHTML = lines
    .map(function (line, i) {
      const el = document.createElement('div');
      el.textContent = line;
      if (i === 0) {
        el.style.cssText = 'font-size:3vmin;color:#ff9b9b;margin-bottom:1vmin;';
      }
      return el.outerHTML;
    })
    .join('');
  stage.appendChild(box);

  activeNotice = box;
  setTimeout(function () {
    box.remove();
    activeNotice = null;
  }, NOTICE_SECONDS * 1000);
}

function showTwitchBlockedNotice() {
  const where = window.location.origin;
  console.error(
    'Media Player: Twitch will not embed a clip into ' +
      where +
      '. It needs https on a real domain, or localhost.',
  );
  // Same shape osc-bundle.js reports its own errors in, so both read alike in the monitor.
  sendOSC('/spooder/plugin/error', {
    name: window.location.href,
    message: 'Twitch clips need this overlay served over public hosting (https).',
    type: 'clip-parent-refused',
  });
  showNotice([
    "Can't play this Twitch clip here",
    'Twitch only plays clips on a page served over https from a real domain. This overlay is at ' +
      where +
      '.',
    '1. Network settings: set up an external handle (Motherwolf, ngrok or manual).',
    '2. Turn on "Serve over public internet" for the overlay layout this source shows (Overlays tab), or for Media Player alone (Plugins tab).',
    '3. Copy the Public Overlay URL it shows and use that for this browser source.',
  ]);
}

/* Returns null when nothing was embedded, so there is no cue to track or stop. */
function showClip(cue, onFinished) {
  const build = CLIP_EMBEDS[cue.provider];
  if (!build) {
    console.warn('Unknown clip provider:', cue.provider);
    return null;
  }

  if (cue.provider === 'twitch' && twitchRefusedHere()) {
    showTwitchBlockedNotice();
    return null;
  }

  const frame = document.createElement('iframe');
  frame.src = build(cue);
  frame.allow = 'autoplay; fullscreen';
  frame.setAttribute('frameborder', '0');
  frame.setAttribute('scrolling', 'no');
  applyLayout(frame, cue);
  // Every supported embed is 16:9, and an iframe has no intrinsic size to read proportions
  // from, so they are stated outright.
  fitToCanvas(frame, cue.size, 16 / 9);
  stage.appendChild(frame);

  const timer = setTimeout(onFinished, cue.duration * 1000);

  return {
    element: frame,
    stop: function () {
      clearTimeout(timer);
      frame.remove();
    },
  };
}
