/*
    Image, video and clip placement.

    `size` is a percentage of the canvas: the media is scaled, up or down, to the largest size
    that fits inside that share of the width AND of the height, keeping its own proportions. So
    100 fills the canvas as far as the media's shape allows, and the same cue lands the same
    way on a 1080p and a 1440p canvas.
*/

var stage = document.getElementById('stage');

/*
    Anchor points as percentages of the canvas. The element is positioned so that the same
    percentage of ITSELF lines up with it (left: L% together with translate(-L%, ...)), which
    keeps it fully inside the canvas whatever its size - 0 is flush with the left edge, 100
    flush with the right, 50 centred. Corners are inset a few percent so they are not hard
    against the edge.
*/
var POSITIONS = {
  center: [50, 50],
  'top-left': [3, 3],
  top: [50, 3],
  'top-right': [97, 3],
  left: [3, 50],
  right: [97, 50],
  'bottom-left': [3, 97],
  bottom: [50, 97],
  'bottom-right': [97, 97],
};

function resolvePosition(position) {
  if (position === 'random') {
    return [Math.random() * 100, Math.random() * 100];
  }
  return POSITIONS[position] || POSITIONS['center'];
}

function applyLayout(element, cue) {
  const anchor = resolvePosition(cue.position);
  element.className = 'media-item';
  element.style.left = anchor[0] + '%';
  element.style.top = anchor[1] + '%';
  element.style.transform = 'translate(-' + anchor[0] + '%, -' + anchor[1] + '%)';
}

/*
    Size an element to the largest box of the given proportions that fits inside `size`% of
    the canvas width and height. Width is whichever is smaller: the width allowed outright, or
    the width that the allowed height permits at this aspect ratio. Height follows from the
    aspect ratio, so the shape is never distorted.
*/
function fitToCanvas(element, size, aspectRatio) {
  element.style.aspectRatio = String(aspectRatio);
  element.style.width = 'min(' + size + 'vw, calc(' + size + 'vh * ' + aspectRatio + '))';
  element.style.height = 'auto';
}

/*
    Images and videos only know their proportions once their metadata has loaded, so they stay
    hidden until then rather than flashing at the wrong size.
*/
function fitWhenLoaded(element, eventName, getSize, cue) {
  element.style.visibility = 'hidden';
  element.addEventListener(eventName, function () {
    const natural = getSize();
    if (natural.width > 0 && natural.height > 0) {
      fitToCanvas(element, cue.size, natural.width / natural.height);
    }
    element.style.visibility = 'visible';
  });
}

function showImage(url, cue, onFinished) {
  const image = document.createElement('img');
  fitWhenLoaded(
    image,
    'load',
    function () {
      return { width: image.naturalWidth, height: image.naturalHeight };
    },
    cue,
  );
  image.src = url;
  applyLayout(image, cue);
  stage.appendChild(image);

  const timer = setTimeout(onFinished, cue.duration * 1000);

  return {
    element: image,
    stop: function () {
      clearTimeout(timer);
      image.remove();
    },
  };
}

function showVideo(url, cue, onFinished) {
  const video = document.createElement('video');
  video.src = url;
  video.volume = cue.volume;
  video.autoplay = true;
  // An overlay has no controls to unmute with, so a browser that refuses to autoplay with
  // sound would leave the cue stuck. Retry muted rather than show nothing.
  video.playsInline = true;
  fitWhenLoaded(
    video,
    'loadedmetadata',
    function () {
      return { width: video.videoWidth, height: video.videoHeight };
    },
    cue,
  );
  applyLayout(video, cue);
  stage.appendChild(video);

  video.play().catch(function (e) {
    console.warn('Video autoplay blocked, retrying muted:', url, e);
    video.muted = true;
    video.play().catch(function (err) {
      console.warn('Video could not play:', url, err);
      onFinished();
    });
  });

  // duration 0 means "play it out", so only a positive duration cuts the video short.
  const timer = cue.duration > 0 ? setTimeout(onFinished, cue.duration * 1000) : null;
  video.addEventListener('ended', onFinished);

  return {
    element: video,
    stop: function () {
      if (timer != null) {
        clearTimeout(timer);
      }
      video.pause();
      video.remove();
    },
  };
}
