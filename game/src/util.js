// Small math and collision helpers shared by every module of Vice Harbor.

VH.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
VH.lerp = function (a, b, t) { return a + (b - a) * t; };
VH.dist = function (x1, y1, x2, y2) {
  var dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
};
VH.len = function (x, y) { return Math.sqrt(x * x + y * y); };

// Shortest signed difference between two angles, in (-PI, PI].
VH.angleDiff = function (a, b) {
  var d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
};

// Turn `angle` toward `target` by at most `maxStep` radians.
VH.turnToward = function (angle, target, maxStep) {
  var d = VH.angleDiff(angle, target);
  if (d > maxStep) return angle + maxStep;
  if (d < -maxStep) return angle - maxStep;
  return target;
};

// Deterministic random generator (mulberry32) so a seed rebuilds one city.
VH.makeRng = function (seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

VH.pick = function (rng, arr) { return arr[Math.floor(rng() * arr.length)]; };
VH.rand = function (rng, lo, hi) { return lo + rng() * (hi - lo); };
VH.randInt = function (rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); };

// Is point (x, y) inside rectangle r?
VH.inRect = function (x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
};

// Push a circle (x, y, radius r) out of a rectangle. Returns true on contact.
VH.circleRectPush = function (c, r) {
  var nx = VH.clamp(c.x, r.x, r.x + r.w);
  var ny = VH.clamp(c.y, r.y, r.y + r.h);
  var dx = c.x - nx, dy = c.y - ny;
  var d2 = dx * dx + dy * dy;
  if (d2 >= c.r * c.r) return false;
  if (d2 > 0.0001) {
    var d = Math.sqrt(d2);
    c.x = nx + (dx / d) * c.r;
    c.y = ny + (dy / d) * c.r;
  } else {
    // Centre is inside the rectangle: push out along the smallest overlap.
    var left = c.x - r.x, right = r.x + r.w - c.x;
    var top = c.y - r.y, bottom = r.y + r.h - c.y;
    var m = Math.min(left, right, top, bottom);
    if (m === left) c.x = r.x - c.r;
    else if (m === right) c.x = r.x + r.w + c.r;
    else if (m === top) c.y = r.y - c.r;
    else c.y = r.y + r.h + c.r;
  }
  return true;
};

// Resolve a circle against every solid rectangle in `solids` (buildings).
// Returns the number of contacts made.
VH.resolveSolids = function (c, solids) {
  var hits = 0;
  for (var i = 0; i < solids.length; i++) {
    if (VH.circleRectPush(c, solids[i])) hits++;
  }
  return hits;
};

// Keep a point inside the world bounds with a small margin.
VH.clampToWorld = function (c, margin) {
  var W = VH.CFG.world;
  c.x = VH.clamp(c.x, margin, W - margin);
  c.y = VH.clamp(c.y, margin, W - margin);
};

// Format seconds as M:SS for the HUD and the end screen.
VH.fmtTime = function (s) {
  var m = Math.floor(s / 60);
  var sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
};

// Format a cash amount with a dollar sign and thousands separators.
VH.fmtCash = function (n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
