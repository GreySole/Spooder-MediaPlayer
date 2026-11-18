/*
    Turns one cue into playback and keeps track of what is currently running, so a cue can be
    stopped by id and Stop All Media can clear everything at once.

    A cue is self-contained: the plugin has already resolved which asset to play and how, so
    nothing here reads pluginSettings. That is what lets an asset picked on a node seconds ago
    play without the overlay reloading.
*/

var activeCues = {};

function assetUrl(src) {
  // Asset names come from the streamer's own filenames, so spaces, apostrophes and '#' all
  // turn up in practice. Encode per segment - the slashes are path structure, not content.
  const encoded = src.split('/').map(encodeURIComponent).join('/');
  // getAssetUrl is provided by osc-bundle.js and resolves against this plugin's asset folder.
  return getAssetUrl(encoded);
}

async function playCue(cue) {
  if (!cue || !cue.src) {
    return;
  }

  const finish = function () {
    endCue(cue.id);
  };
  const url = assetUrl(cue.src);

  let handle = null;
  switch (cue.mediaType) {
    case 'sound':
      handle = await playSound(url, cue.volume, cue.duration, finish);
      break;
    case 'image':
      handle = showImage(url, cue, finish);
      break;
    case 'video':
      handle = showVideo(url, cue, finish);
      break;
    // Not an asset of ours: the cue names a provider and video id, and showClip embeds it.
    case 'clip':
      handle = showClip(cue, finish);
      break;
    default:
      console.warn('Unknown media type:', cue.mediaType);
      return;
  }

  if (handle) {
    activeCues[cue.id] = handle;
  }
}

/*
    Ends one cue, whether it ran its course or is being cut short. stop() is safe to call on a
    cue that already finished, and deleting the entry is what keeps activeCues from growing
    for the whole length of a stream.
*/
function endCue(id) {
  const handle = activeCues[id];
  if (!handle) {
    return;
  }
  handle.stop();
  delete activeCues[id];
}

function stopAllMedia() {
  Object.keys(activeCues).forEach(endCue);
  // Sounds started before a reconnect can outlive their entry in activeCues, so clear the
  // audio side directly as well - a panic stop that leaves something ringing is not a stop.
  stopAllSounds();
  stage.innerHTML = '';
}
