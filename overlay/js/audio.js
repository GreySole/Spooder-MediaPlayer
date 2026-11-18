/*
    Sound playback.

    Web Audio rather than an <audio> element per cue: decoded buffers are cached by URL, so
    the same sound fired twice in a row starts instantly the second time, and overlapping
    plays of one sound cost nothing extra. A decode that fails (an exotic codec) falls back
    to an <audio> element, which is more forgiving about what it will play.
*/

var audioContext = null;
var audioBuffers = {};
var activeSounds = [];

function getAudioContext() {
  if (audioContext == null) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

/*
    A browser tab that has never been interacted with starts its AudioContext suspended.
    OBS's browser source does not, but a streamer checking the overlay in a normal tab would
    otherwise get silence with no explanation - so resume on the first play, and again on the
    first click if that play was too early.
*/
function resumeAudio() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(function () {});
  }
}

document.addEventListener('click', resumeAudio, { once: true });
document.addEventListener('keydown', resumeAudio, { once: true });

async function loadAudioBuffer(url) {
  if (audioBuffers[url]) {
    return audioBuffers[url];
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not fetch ' + url + ': ' + response.status);
  }
  const bytes = await response.arrayBuffer();
  audioBuffers[url] = await getAudioContext().decodeAudioData(bytes);
  return audioBuffers[url];
}

/*
    Plays a cue's sound. Returns a handle with a stop() so the player can cut it short, either
    because the cue ran out its duration or because a Stop All Media came through. onFinished
    fires when the sound ends on its own, so the caller can drop its record of it.
*/
async function playSound(url, volume, duration, onFinished) {
  resumeAudio();

  let buffer = null;
  try {
    buffer = await loadAudioBuffer(url);
  } catch (e) {
    console.warn('Falling back to <audio> for', url, e);
    return playSoundElement(url, volume, duration, onFinished);
  }

  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start();

  if (duration > 0) {
    source.stop(ctx.currentTime + duration);
  }

  const handle = {
    stop: function () {
      try {
        source.stop();
      } catch (e) {
        /* already stopped */
      }
    },
  };

  source.onended = function () {
    removeActiveSound(handle);
    onFinished();
  };

  activeSounds.push(handle);
  return handle;
}

function playSoundElement(url, volume, duration, onFinished) {
  const element = new Audio(url);
  element.volume = volume;
  element.play().catch(function (e) {
    console.warn('Sound blocked:', url, e);
  });

  const handle = {
    stop: function () {
      element.pause();
      element.currentTime = 0;
    },
  };

  element.addEventListener('ended', function () {
    removeActiveSound(handle);
    onFinished();
  });

  if (duration > 0) {
    setTimeout(function () {
      handle.stop();
      removeActiveSound(handle);
      onFinished();
    }, duration * 1000);
  }

  activeSounds.push(handle);
  return handle;
}

function removeActiveSound(handle) {
  const index = activeSounds.indexOf(handle);
  if (index !== -1) {
    activeSounds.splice(index, 1);
  }
}

function stopAllSounds() {
  // stop() fires onended, which splices the handle out - so walk a copy.
  activeSounds.slice().forEach(function (handle) {
    handle.stop();
  });
  activeSounds = [];
}
