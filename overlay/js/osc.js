/*
    OSC entry points. getOSCMessage is called by osc-bundle.js for every message that reaches
    this overlay, so the address check here is what makes it this plugin's.
*/

// '/mediaplayer' is what this plugin used before the address was aligned with its folder name.
// Still accepted so anything already pointed at the old address keeps working.
var ADDRESS_PREFIXES = ['/media_player', '/mediaplayer'];

function matchAddress(address) {
  for (let i = 0; i < ADDRESS_PREFIXES.length; i++) {
    if (address.startsWith(ADDRESS_PREFIXES[i] + '/')) {
      return address.substring(ADDRESS_PREFIXES[i].length + 1);
    }
  }
  return null;
}

function parsePayload(arg) {
  if (arg && typeof arg === 'object') {
    return arg;
  }
  try {
    return JSON.parse(arg);
  } catch (e) {
    console.warn('Unreadable media payload:', arg, e);
    return null;
  }
}

function getOSCMessage(message) {
  const command = matchAddress(message.address);
  if (command == null) {
    return;
  }

  const payload = parsePayload(message.args[0]);
  if (payload == null) {
    return;
  }

  switch (command) {
    case 'play':
      playCue(payload);
      break;
    case 'stop':
      if (payload.id && payload.id !== 'all') {
        endCue(payload.id);
      } else {
        stopAllMedia();
      }
      break;
    default:
      break;
  }
}

function onOSCOpen() {
  console.log('Media Player overlay connected.');
}
