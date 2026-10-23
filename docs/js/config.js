// Where the live server lives. If the game is opened from the server itself
// (localhost or the Render URL), it just talks to wherever it was loaded from.
window.BISCUIT_SERVER = (function () {
  var RENDER = 'https://biscuitmaker.onrender.com';
  var h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.onrender.com')) {
    return location.origin;
  }
  return RENDER;
})();
