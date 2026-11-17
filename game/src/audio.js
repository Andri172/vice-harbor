// Synthesized sound for Vice Harbor: every effect and the music loop are
// built with the Web Audio API. No audio files are loaded or fetched.

VH.audio = {
  ctx: null,
  master: null,
  muted: false,
  engineOsc: null,
  engineGain: null,
  sirenOsc: null,
  sirenGain: null,
  sirenOn: false,
  musicTimer: 0,
  musicStep: 0,
  musicOn: false,
};

// Create the audio graph on the first user gesture (browsers require it).
VH.audioInit = function () {
  if (VH.audio.ctx) {
    if (VH.audio.ctx.state === 'suspended') VH.audio.ctx.resume();
    return;
  }
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  var ctx = new AC();
  VH.audio.ctx = ctx;
  VH.audio.master = ctx.createGain();
  VH.audio.master.gain.value = VH.audio.muted ? 0 : 0.5;
  VH.audio.master.connect(ctx.destination);

  // Engine hum: a sawtooth whose pitch follows the speed, kept quiet.
  var eng = ctx.createOscillator();
  eng.type = 'sawtooth';
  eng.frequency.value = 55;
  var engGain = ctx.createGain();
  engGain.gain.value = 0;
  var engFilter = ctx.createBiquadFilter();
  engFilter.type = 'lowpass';
  engFilter.frequency.value = 320;
  eng.connect(engFilter);
  engFilter.connect(engGain);
  engGain.connect(VH.audio.master);
  eng.start();
  VH.audio.engineOsc = eng;
  VH.audio.engineGain = engGain;

  // Police siren: two alternating tones, switched by a timer in update.
  var sir = ctx.createOscillator();
  sir.type = 'triangle';
  sir.frequency.value = 720;
  var sirGain = ctx.createGain();
  sirGain.gain.value = 0;
  sir.connect(sirGain);
  sirGain.connect(VH.audio.master);
  sir.start();
  VH.audio.sirenOsc = sir;
  VH.audio.sirenGain = sirGain;
};

VH.audioToggleMute = function () {
  VH.audio.muted = !VH.audio.muted;
  if (VH.audio.master) VH.audio.master.gain.value = VH.audio.muted ? 0 : 0.5;
  return VH.audio.muted;
};

// One short tone: frequency, duration, wave type, volume.
VH.audioTone = function (freq, dur, type, vol, slideTo) {
  var a = VH.audio;
  if (!a.ctx || a.muted) return;
  var t = a.ctx.currentTime;
  var o = a.ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  var g = a.ctx.createGain();
  g.gain.setValueAtTime(vol || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(a.master);
  o.start(t);
  o.stop(t + dur + 0.02);
};

// A burst of filtered noise (shots, crashes, skids).
VH.audioNoise = function (dur, vol, filterFreq, type) {
  var a = VH.audio;
  if (!a.ctx || a.muted) return;
  var t = a.ctx.currentTime;
  var len = Math.max(1, Math.floor(a.ctx.sampleRate * dur));
  var buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  var src = a.ctx.createBufferSource();
  src.buffer = buf;
  var f = a.ctx.createBiquadFilter();
  f.type = type || 'lowpass';
  f.frequency.value = filterFreq || 1200;
  var g = a.ctx.createGain();
  g.gain.setValueAtTime(vol || 0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(a.master);
  src.start(t);
};

// Named effects the rest of the game triggers.
VH.sfx = function (name) {
  if (!VH.audio.ctx) return;
  switch (name) {
    case 'shot':
      VH.audioNoise(0.09, 0.5, 2600, 'highpass');
      VH.audioTone(180, 0.07, 'square', 0.16, 60);
      break;
    case 'crash':
      VH.audioNoise(0.28, 0.5, 500);
      VH.audioTone(90, 0.25, 'sine', 0.3, 40);
      break;
    case 'pickup':
      VH.audioTone(660, 0.09, 'sine', 0.2);
      setTimeout(function () { VH.audioTone(990, 0.12, 'sine', 0.2); }, 90);
      break;
    case 'enter':
      VH.audioTone(220, 0.1, 'triangle', 0.2, 330);
      break;
    case 'busted':
      VH.audioTone(440, 0.3, 'square', 0.18, 220);
      setTimeout(function () { VH.audioTone(330, 0.4, 'square', 0.18, 165); }, 260);
      break;
    case 'mission':
      VH.audioTone(523, 0.14, 'sine', 0.22);
      setTimeout(function () { VH.audioTone(659, 0.14, 'sine', 0.22); }, 130);
      setTimeout(function () { VH.audioTone(784, 0.22, 'sine', 0.22); }, 260);
      break;
    case 'wasted':
      VH.audioTone(392, 0.4, 'sawtooth', 0.16, 98);
      break;
    case 'click':
      VH.audioTone(880, 0.05, 'sine', 0.15);
      break;
    case 'horn':
      VH.audioTone(370, 0.16, 'square', 0.12);
      VH.audioTone(466, 0.16, 'square', 0.1);
      break;
  }
};

// Per-frame audio: engine pitch by speed, siren wail while wanted.
VH.audioUpdate = function (G, dt) {
  var a = VH.audio;
  if (!a.ctx) return;
  var inCar = !!G.player.car;
  var speed = inCar ? Math.abs(G.player.car.speed) : 0;
  if (a.engineGain) {
    var target = inCar ? 0.05 + Math.min(0.1, speed / 3600) : 0;
    a.engineGain.gain.setTargetAtTime(target, a.ctx.currentTime, 0.08);
    if (a.engineOsc) a.engineOsc.frequency.setTargetAtTime(50 + speed * 0.55, a.ctx.currentTime, 0.08);
  }
  var wantSiren = G.wanted > 0 && G.state === 'playing';
  if (wantSiren && !a.sirenOn) { a.sirenOn = true; }
  if (!wantSiren && a.sirenOn) { a.sirenOn = false; if (a.sirenGain) a.sirenGain.gain.value = 0; }
  if (a.sirenOn && a.sirenOsc && a.sirenGain) {
    a.sirenGain.gain.setTargetAtTime(0.045, a.ctx.currentTime, 0.1);
    var phase = (G.time * 1.4) % 2;
    a.sirenOsc.frequency.setTargetAtTime(phase < 1 ? 720 : 960, a.ctx.currentTime, 0.05);
  }
  // Tiny music sequencer: a moody bass line with a hat tick, 112 BPM.
  if (G.state === 'playing' && !a.muted) {
    a.musicTimer += dt;
    var stepDur = 60 / 112 / 2;
    if (a.musicTimer >= stepDur) {
      a.musicTimer -= stepDur;
      var bass = [55, 0, 55, 65.4, 0, 55, 49, 58.3];
      var note = bass[a.musicStep % bass.length];
      if (note) VH.audioTone(note, stepDur * 1.8, 'triangle', 0.11);
      if (a.musicStep % 2 === 1) VH.audioNoise(0.03, 0.05, 6000, 'highpass');
      a.musicStep++;
    }
  }
};
