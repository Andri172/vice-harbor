// VICE HARBOR — main loop, input, camera, save/load and scene staging.
// This file wires the city, the people, the missions and the sound together.

VH.newGame = function (seed) {
  var G = {
    seed: seed || 7,
    rng: VH.makeRng(seed || 7),
    state: 'title', // title | playing | paused | busted | wasted | complete
    time: 0, playTime: 0, last: 0,
    timeOfDay: 540, // minutes after midnight; the game opens at 09:00
    nightFactor: 0,
    city: null, solids: [],
    player: {
      x: 0, y: 0, angle: -Math.PI / 2, r: VH.CFG.playerRadius,
      health: VH.CFG.playerHealth, hurtTimer: 0, car: null,
    },
    cars: [], peds: [], bullets: [], parts: [], skids: [],
    nextCarId: 1,
    wanted: 0, wantedTimer: 0, lastCrime: '', lastCrimeAt: -10,
    cash: 0, missionIndex: 0, mission: null, missionCar: null,
    missionTheftOk: false,
    dialogue: [], dialogueTimer: 0,
    toastText: '', toastTimer: 0,
    // Show a short message at the top of the screen for a few seconds.
    toast: function (text, seconds) {
      this.toastText = text;
      this.toastTimer = seconds || 2.5;
    },
    cam: { x: 0, y: 0 },
    shake: 0, muzzle: 0,
    keys: {}, mouse: { x: 0, y: 0, down: false },
    mouseWorld: { x: 0, y: 0 },
    stats: { missionsDone: 0, carsStolen: 0, pedsHit: 0, shotsFired: 0, gangDown: 0 },
    shotsFiredAt: -10, shotsFiredX: 0, shotsFiredY: 0,
    lastShot: -10, bustedFine: 0, wastedFine: 0, finalTime: 0,
    saveExists: false,
  };
  return G;
};

VH.buildWorld = function (G) {
  G.city = VH.buildCity(G.seed);
  G.solids = VH.citySolids(G.city);
  var hospital = G.city.specials.hospital;
  // Spawn on the road just south of the hospital, facing north up the street.
  G.player.x = hospital.x;
  G.player.y = VH.roadAt(2);
  G.player.angle = -Math.PI / 2;
  VH.spawnParkedCars(G, G.rng);
  VH.spawnTraffic(G, VH.CFG.trafficCount);
  VH.spawnPeds(G, VH.CFG.pedCount);
  G.cam.x = VH.clamp(G.player.x - VH.CFG.viewW / 2, 0, VH.CFG.world - VH.CFG.viewW);
  G.cam.y = VH.clamp(G.player.y - VH.CFG.viewH / 2, 0, VH.CFG.world - VH.CFG.viewH);
};

VH.nightFactorFor = function (minutes) {
  var h = minutes / 60;
  if (h >= 19.5 || h < 5.5) return 1;
  if (h >= 18) return (h - 18) / 1.5;
  if (h < 7) return 1 - (h - 5.5) / 1.5;
  return 0;
};

// ---- Save / load (localStorage) ----

VH.saveGame = function (G) {
  try {
    var data = {
      cash: G.cash, missionIndex: G.missionIndex,
      px: G.player.x, py: G.player.y, health: G.player.health,
      timeOfDay: G.timeOfDay, playTime: G.playTime,
      stats: G.stats, savedAt: Date.now(),
    };
    localStorage.setItem(VH.CFG.saveKey, JSON.stringify(data));
    G.saveExists = true;
  } catch (e) { /* storage unavailable: the game still plays */ }
};

VH.loadSave = function () {
  try {
    var raw = localStorage.getItem(VH.CFG.saveKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};

VH.applySave = function (G, data) {
  G.cash = data.cash || 0;
  G.missionIndex = data.missionIndex || 0;
  G.player.x = data.px || 0;
  G.player.y = data.py || 0;
  G.player.health = data.health || VH.CFG.playerHealth;
  G.timeOfDay = data.timeOfDay || 540;
  G.playTime = data.playTime || 0;
  if (data.stats) G.stats = data.stats;
  VH.startMission(G, G.missionIndex);
};

// ---- Input ----

VH.bindInput = function (G, canvas) {
  window.addEventListener('keydown', function (e) {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
    VH.audioInit();
    G.keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === VH.KEYS.mute) {
      var muted = VH.audioToggleMute();
      G.toast(muted ? 'Sound off' : 'Sound on', 1.2);
    }
    if (G.state === 'title' && e.code === VH.KEYS.start) {
      VH.startPlaying(G, !!G.saveExists);
    } else if (G.state === 'playing') {
      if (e.code === VH.KEYS.pause || e.code === VH.KEYS.escape) {
        G.state = 'paused';
        VH.saveGame(G);
        VH.sfx('click');
      } else if (e.code === VH.KEYS.enterCar) {
        if (G.dialogue.length) VH.advanceDialogue(G);
        else VH.tryEnterCar(G);
      }
    } else if (G.state === 'paused') {
      if (e.code === VH.KEYS.pause || e.code === VH.KEYS.escape) {
        G.state = 'playing';
        VH.sfx('click');
      } else if (e.code === 'KeyQ') {
        G.state = 'title';
        VH.saveGame(G);
      }
    } else if ((G.state === 'busted' || G.state === 'wasted') && e.code === 'KeyR') {
      VH.respawn(G);
    } else if (G.state === 'complete' && e.code === 'KeyR') {
      G.state = 'playing';
      G.mission = null;
      G.toast('Free roam — Vice Harbor is yours', 3);
    }
  });
  window.addEventListener('keyup', function (e) { G.keys[e.code] = false; });
  canvas.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();
    G.mouse.x = (e.clientX - rect.left) * (VH.CFG.viewW / rect.width);
    G.mouse.y = (e.clientY - rect.top) * (VH.CFG.viewH / rect.height);
  });
  canvas.addEventListener('mousedown', function (e) {
    VH.audioInit();
    G.mouse.down = true;
    if (G.state === 'playing' && G.dialogue.length) VH.advanceDialogue(G);
  });
  window.addEventListener('mouseup', function () { G.mouse.down = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('blur', function () {
    if (G.state === 'playing') { G.state = 'paused'; VH.saveGame(G); }
  });
};

VH.advanceDialogue = function (G) {
  G.dialogue.shift();
  G.dialogueTimer = G.dialogue.length ? 5 : 0;
  VH.sfx('click');
};

VH.startPlaying = function (G, cont) {
  if (cont) {
    var data = VH.loadSave();
    if (data) VH.applySave(G, data);
    else VH.startMission(G, 0);
  } else {
    G.cash = 0;
    G.missionIndex = 0;
    VH.startMission(G, 0);
  }
  G.state = 'playing';
  VH.sfx('mission');
};

// ---- Main loop ----

VH.update = function (G, dt) {
  G.time += dt;
  G.nightFactor = VH.nightFactorFor(G.timeOfDay);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  if (G.toastTimer > 0) G.toastTimer -= dt;
  if (G.state !== 'playing') return;
  // Dialogue pauses the world (but the clock and effects keep running).
  if (G.dialogue.length) {
    G.dialogueTimer -= dt;
    if (G.dialogueTimer <= 0) VH.advanceDialogue(G);
    return;
  }
  G.playTime += dt;
  G.timeOfDay = (G.timeOfDay + dt * (1440 / VH.CFG.dayLengthSeconds)) % 1440;
  G.nightFactor = VH.nightFactorFor(G.timeOfDay);
  var p = G.player;
  if (p.hurtTimer > 0) {
    p.hurtTimer -= dt;
    if (p.hurtTimer <= 0 && p.health > 0 && p.health < VH.CFG.playerHealth) {
      p.health = Math.min(VH.CFG.playerHealth, p.health + 3 * dt);
    }
  } else if (p.health > 0 && p.health < VH.CFG.playerHealth) {
    p.health = Math.min(VH.CFG.playerHealth, p.health + 3 * dt);
  }
  // Mouse position in world coordinates (for aiming).
  G.mouseWorld.x = G.cam.x + G.mouse.x;
  G.mouseWorld.y = G.cam.y + G.mouse.y;
  if (p.car) VH.updateDriving(G, dt);
  else VH.updatePlayerOnFoot(G, dt);
  // Hold the mouse to keep firing on foot.
  if (G.mouse.down && !p.car) VH.playerShoot(G);
  VH.updateTraffic(G, dt);
  VH.updatePolice(G, dt);
  VH.updatePeds(G, dt);
  VH.updateBullets(G, dt);
  VH.updateParticles(G, dt);
  VH.updateSkids(G, dt);
  VH.updateMission(G, dt);
  VH.audioUpdate(G, dt);
  // Car-to-car collisions (player car vs the world of cars).
  VH.collideCars(G, dt);
  // Camera follows the player.
  var tx = VH.clamp(p.x - VH.CFG.viewW / 2, 0, VH.CFG.world - VH.CFG.viewW);
  var ty = VH.clamp(p.y - VH.CFG.viewH / 2, 0, VH.CFG.world - VH.CFG.viewH);
  G.cam.x = VH.lerp(G.cam.x, tx, 0.12);
  G.cam.y = VH.lerp(G.cam.y, ty, 0.12);
};

// Push overlapping cars apart and trade a little damage on hard hits.
// One damage tick per collision, then a short cooldown: without it a single
// crash drains a car by hitting it again on every frame while overlapped.
VH.collideCars = function (G, dt) {
  var cars = G.cars;
  for (var i = 0; i < cars.length; i++) {
    for (var j = i + 1; j < cars.length; j++) {
      var a = cars[i], b = cars[j];
      if (a.kind === 'wreck' || b.kind === 'wreck') continue;
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var min = a.r + b.r - 6;
      if (d > 0.01 && d < min) {
        var push = (min - d) / 2;
        var nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        var rel = Math.abs(a.speed - b.speed);
        if (rel > 130 && a.hitCd <= 0 && b.hitCd <= 0) {
          var dmg = Math.min(14, rel / 26);
          VH.damageCar(G, a, dmg, 'traffic');
          VH.damageCar(G, b, dmg, 'traffic');
          VH.sfx('crash');
          G.shake = Math.max(G.shake, 5);
          a.hitCd = 0.6;
          b.hitCd = 0.6;
        }
        if (a.kind === 'traffic') a.speed *= 0.7;
        if (b.kind === 'traffic') b.speed *= 0.7;
      }
    }
  }
  cars.forEach(function (c) { if (c.hitCd > 0) c.hitCd -= dt; });
};

// ---- Rendering ----

VH.render = function (G, ctx) {
  var C = VH.CFG;
  ctx.clearRect(0, 0, C.viewW, C.viewH);
  var shx = (Math.random() - 0.5) * G.shake;
  var shy = (Math.random() - 0.5) * G.shake;
  ctx.save();
  ctx.translate(-Math.round(G.cam.x + shx), -Math.round(G.cam.y + shy));
  VH.drawWorld(ctx, G);
  // Mission marker: a beam of light and a pulsing ring on the ground.
  if (G.mission && G.mission.marker && G.state === 'playing') {
    var mk = G.mission.marker;
    ctx.fillStyle = 'rgba(255,215,94,0.10)';
    ctx.fillRect(mk.x - 26, mk.y - 320, 52, 320);
    var pulse = 26 + Math.sin(G.time * 5) * 6;
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mk.x, mk.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(mk.x, mk.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  VH.drawEntities(ctx, G);
  ctx.restore();
  // Night tint and headlights.
  if (G.nightFactor > 0.02) {
    ctx.fillStyle = 'rgba(8,10,38,' + (0.38 * G.nightFactor).toFixed(3) + ')';
    ctx.fillRect(0, 0, C.viewW, C.viewH);
    var p = G.player;
    if (p.car) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var grad = ctx.createRadialGradient(
        p.x - G.cam.x + Math.cos(p.angle) * 130, p.y - G.cam.y + Math.sin(p.angle) * 130, 10,
        p.x - G.cam.x + Math.cos(p.angle) * 130, p.y - G.cam.y + Math.sin(p.angle) * 130, 190);
      grad.addColorStop(0, 'rgba(255,230,160,' + (0.30 * G.nightFactor).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x - G.cam.x + Math.cos(p.angle) * 130, p.y - G.cam.y + Math.sin(p.angle) * 130, 190, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // Hurt vignette.
  if (G.player.health < 35 && G.state === 'playing') {
    var hurt = (35 - G.player.health) / 35;
    var vg = ctx.createRadialGradient(C.viewW / 2, C.viewH / 2, C.viewH / 3, C.viewW / 2, C.viewH / 2, C.viewH / 1.2);
    vg.addColorStop(0, 'rgba(200,0,0,0)');
    vg.addColorStop(1, 'rgba(200,0,0,' + (0.35 * hurt).toFixed(3) + ')');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, C.viewW, C.viewH);
  }
  if (G.state === 'playing' || G.state === 'paused') VH.drawHUD(ctx, G);
  if (G.state === 'title') VH.drawTitle(ctx, G);
  if (G.state === 'paused') VH.drawPaused(ctx, G);
  if (G.state === 'busted') VH.drawEndScreen(ctx, G, 'BUSTED', 'Detective Holt\'s officers hauled you in.', 'Fine paid: ' + VH.fmtCash(G.bustedFine), 'Press R — back on the street');
  if (G.state === 'wasted') VH.drawEndScreen(ctx, G, 'WASTED', 'Vice Harbor is not done with you yet.', 'Hospital bill: ' + VH.fmtCash(G.wastedFine), 'Press R — walk it off');
  if (G.state === 'complete') VH.drawComplete(ctx, G);
};

// ---- HUD ----

VH.drawHUD = function (ctx, G) {
  var C = VH.CFG;
  var p = G.player;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Health bar and cash, top-left.
  ctx.fillStyle = 'rgba(10,12,16,0.65)';
  ctx.fillRect(14, 12, 220, 54);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('JAX ROOK', 24, 32);
  ctx.fillStyle = '#222222';
  ctx.fillRect(24, 38, 140, 12);
  ctx.fillStyle = p.health > 35 ? '#5fc95f' : '#e84a3c';
  ctx.fillRect(24, 38, 140 * (p.health / 100), 12);
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(VH.fmtCash(G.cash), 172, 50);
  // Wanted stars, top-right.
  ctx.fillStyle = 'rgba(10,12,16,0.65)';
  ctx.fillRect(C.viewW - 214, 12, 200, 44);
  for (var s = 0; s < 5; s++) {
    ctx.fillStyle = s < G.wanted ? '#ffd75e' : 'rgba(255,255,255,0.22)';
    VH.drawStar(ctx, C.viewW - 196 + s * 36, 34, 13);
  }
  // Mission objective, top-centre.
  if (G.mission) {
    var obj = G.mission.def.objective(G);
    ctx.font = 'bold 15px monospace';
    var w = ctx.measureText(obj).width + 28;
    ctx.fillStyle = 'rgba(10,12,16,0.65)';
    ctx.fillRect(C.viewW / 2 - w / 2, 12, w, 30);
    ctx.fillStyle = '#ffd75e';
    ctx.textAlign = 'center';
    ctx.fillText(G.mission.def.title.toUpperCase() + ' — ' + obj, C.viewW / 2, 33);
    ctx.textAlign = 'left';
    // Off-screen marker arrow.
    var mk = G.mission.marker;
    if (mk) {
      var mx = mk.x - G.cam.x, my = mk.y - G.cam.y;
      if (mx < 0 || mx > C.viewW || my < 0 || my > C.viewH) {
        var cx = C.viewW / 2, cy = C.viewH / 2;
        var ang = Math.atan2(my - cy, mx - cx);
        var ax = cx + Math.cos(ang) * 300, ay = cy + Math.sin(ang) * 200;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        ctx.fillStyle = '#ffd75e';
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffd75e';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(VH.dist(p.x, p.y, mk.x, mk.y)) + 'm', ax, ay + 26);
        ctx.textAlign = 'left';
      }
    }
  }
  // Weapon and car status, bottom-left.
  ctx.fillStyle = 'rgba(10,12,16,0.65)';
  ctx.fillRect(14, C.viewH - 58, 260, 44);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 15px monospace';
  if (p.car) {
    ctx.fillText(p.car.type.name.toUpperCase() + '  •  ' + Math.round(Math.abs(p.car.speed) * 0.24) + ' km/h', 24, C.viewH - 34);
    ctx.fillStyle = '#222222';
    ctx.fillRect(24, C.viewH - 26, 140, 8);
    ctx.fillStyle = p.car.health > 35 ? '#5fc95f' : '#e84a3c';
    ctx.fillRect(24, C.viewH - 26, 140 * (p.car.health / 100), 8);
  } else {
    ctx.fillText('PISTOL  •  E — enter car', 24, C.viewH - 32);
  }
  // Minimap, bottom-right.
  VH.drawMinimap(ctx, G, C.viewW - 196, C.viewH - 196, 180);
  // Clock and day/night, under the minimap.
  var hh = Math.floor(G.timeOfDay / 60), mm = Math.floor(G.timeOfDay % 60);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'right';
  ctx.fillText((hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + (G.nightFactor > 0.5 ? '  NIGHT' : '  DAY'), C.viewW - 16, C.viewH - 6);
  ctx.textAlign = 'left';
  // Toast.
  if (G.toastTimer > 0) {
    ctx.font = 'bold 17px monospace';
    var tw = ctx.measureText(G.toastText).width + 30;
    ctx.fillStyle = 'rgba(10,12,16,0.75)';
    ctx.fillRect(C.viewW / 2 - tw / 2, 52, tw, 30);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(G.toastText, C.viewW / 2, 73);
    ctx.textAlign = 'left';
  }
  // Dialogue box.
  if (G.dialogue.length) {
    var line = G.dialogue[0];
    ctx.fillStyle = 'rgba(10,12,16,0.85)';
    ctx.fillRect(C.viewW / 2 - 340, C.viewH - 150, 680, 84);
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 2;
    ctx.strokeRect(C.viewW / 2 - 340, C.viewH - 150, 680, 84);
    ctx.fillStyle = '#ffd75e';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(line.who.toUpperCase(), C.viewW / 2 - 322, C.viewH - 122);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    VH.wrapText(ctx, line.text, C.viewW / 2 - 322, C.viewH - 98, 644, 20);
    ctx.fillStyle = '#9aa0a8';
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('E — continue', C.viewW / 2 + 322, C.viewH - 76);
    ctx.textAlign = 'left';
  }
  // Crosshair.
  if (!p.car && G.state === 'playing') {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(G.mouse.x, G.mouse.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(G.mouse.x - 13, G.mouse.y); ctx.lineTo(G.mouse.x - 5, G.mouse.y);
    ctx.moveTo(G.mouse.x + 5, G.mouse.y); ctx.lineTo(G.mouse.x + 13, G.mouse.y);
    ctx.moveTo(G.mouse.x, G.mouse.y - 13); ctx.lineTo(G.mouse.x, G.mouse.y - 5);
    ctx.moveTo(G.mouse.x, G.mouse.y + 5); ctx.lineTo(G.mouse.x, G.mouse.y + 13);
    ctx.stroke();
  }
};

VH.drawStar = function (ctx, x, y, r) {
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var ang = -Math.PI / 2 + i * Math.PI / 5;
    var rad = i % 2 === 0 ? r : r * 0.45;
    var px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
};

VH.wrapText = function (ctx, text, x, y, maxW, lineH) {
  var words = text.split(' ');
  var line = '';
  var yy = y;
  words.forEach(function (word) {
    var test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  });
  ctx.fillText(line, x, yy);
};

// ---- Screens ----

VH.drawTitle = function (ctx, G) {
  var C = VH.CFG;
  ctx.fillStyle = 'rgba(8,10,18,0.82)';
  ctx.fillRect(0, 0, C.viewW, C.viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 84px monospace';
  ctx.fillText(VH.CFG.title, C.viewW / 2, 190);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '20px monospace';
  ctx.fillText(VH.CFG.subtitle, C.viewW / 2, 228);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#9aa0a8';
  var lines = [
    'WASD — move / drive      E — enter or exit a car      Mouse — aim, click — shoot',
    'SHIFT — run      SPACE — handbrake      P — pause      M — mute',
    'Steal cars, dodge the law, and run five jobs for Eddie Kwan.',
    'An original game: its city, story and art were made for this entry.',
  ];
  lines.forEach(function (l, i) { ctx.fillText(l, C.viewW / 2, 300 + i * 28); });
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px monospace';
  var blink = Math.floor(G.time * 1.6) % 2 === 0;
  if (blink) ctx.fillText(G.saveExists ? 'PRESS ENTER — CONTINUE YOUR STORY' : 'PRESS ENTER — START A NEW STORY', C.viewW / 2, 470);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#9aa0a8';
  ctx.fillText('Progress saves automatically. Headphones on — the bay is loud tonight.', C.viewW / 2, 520);
  ctx.textAlign = 'left';
};

VH.drawPaused = function (ctx, G) {
  var C = VH.CFG;
  ctx.fillStyle = 'rgba(8,10,18,0.7)';
  ctx.fillRect(0, 0, C.viewW, C.viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px monospace';
  ctx.fillText('PAUSED', C.viewW / 2, 300);
  ctx.font = '18px monospace';
  ctx.fillStyle = '#c9c9c9';
  ctx.fillText('P — resume      Q — save and quit to title', C.viewW / 2, 350);
  ctx.textAlign = 'left';
};

VH.drawEndScreen = function (ctx, G, big, sub, fine, hint) {
  var C = VH.CFG;
  ctx.fillStyle = 'rgba(8,10,18,0.78)';
  ctx.fillRect(0, 0, C.viewW, C.viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = big === 'BUSTED' ? '#6fa8ff' : '#ff5a4a';
  ctx.font = 'bold 72px monospace';
  ctx.fillText(big, C.viewW / 2, 280);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '20px monospace';
  ctx.fillText(sub, C.viewW / 2, 330);
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(fine, C.viewW / 2, 370);
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px monospace';
  var blink = Math.floor(G.time * 1.6) % 2 === 0;
  if (blink) ctx.fillText(hint, C.viewW / 2, 440);
  ctx.textAlign = 'left';
};

VH.drawComplete = function (ctx, G) {
  var C = VH.CFG;
  ctx.fillStyle = 'rgba(8,10,18,0.85)';
  ctx.fillRect(0, 0, C.viewW, C.viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 56px monospace';
  ctx.fillText('VICE HARBOR COMPLETE', C.viewW / 2, 220);
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '20px monospace';
  ctx.fillText('All five jobs done. Jax Rook owns the bay tonight.', C.viewW / 2, 265);
  ctx.font = '18px monospace';
  var rows = [
    'Time in the city: ' + VH.fmtTime(G.finalTime),
    'Cash: ' + VH.fmtCash(G.cash),
    'Cars stolen: ' + G.stats.carsStolen,
    'Pedestrians hit: ' + G.stats.pedsHit,
    'Shots fired: ' + G.stats.shotsFired,
    'Breakers taken down: ' + G.stats.gangDown,
  ];
  rows.forEach(function (r, i) { ctx.fillText(r, C.viewW / 2, 320 + i * 30); });
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px monospace';
  var blink = Math.floor(G.time * 1.6) % 2 === 0;
  if (blink) ctx.fillText('Press R — keep playing in free roam', C.viewW / 2, 540);
  ctx.textAlign = 'left';
};

// ---- Scene staging for screenshots and tests ----

VH.stageScene = function (G, name) {
  if (name === 'start') {
    G.state = 'title';
    return;
  }
  G.state = 'playing';
  if (name === 'drive') {
    // Mid-city, driving through traffic in daylight, first mission live.
    var road = VH.roadAt(4);
    var car = VH.spawnMissionCar(G, 'Drifter', road + 30, VH.roadAt(5), 0);
    G.player.car = car;
    car.kind = 'player';
    car.speed = 200;
    G.player.x = car.x; G.player.y = car.y;
    G.timeOfDay = 10 * 60;
    if (!G.mission) VH.startMission(G, 0);
    G.dialogue = [];
  } else if (name === 'cover' || name === 'chase') {
    // Night police chase at wanted level 3, third mission live.
    // Two staged patrol cars close behind; no extra spawns while staging,
    // so the chase reads as a chase instead of a pile-up.
    G.timeOfDay = 19 * 60 + 30;
    var road2 = VH.roadAt(4);
    var car2 = VH.spawnMissionCar(G, 'Comet GT', road2 + 60, VH.roadAt(5), 0);
    G.player.car = car2;
    car2.kind = 'player';
    car2.speed = 260;
    G.player.x = car2.x; G.player.y = car2.y;
    var policeType = VH.CAR_TYPES.filter(function (t) { return t.kind === 'police'; })[0];
    for (var i = 0; i < 2; i++) {
      var pc = VH.makeCar(G, car2.x - 170 - i * 80, VH.roadAt(5) + (i % 2 ? 18 : -18), 0, policeType, 'police');
      pc.speed = 245;
      G.cars.push(pc);
    }
    VH.startMission(G, 2);
    G.dialogue = [];
    G.wanted = 3;
    G.stageNoSpawn = true;
  } else if (name === 'mission') {
    // Second mission: on foot by the yellow Comet GT, objective on the HUD.
    G.timeOfDay = 14 * 60;
    VH.startMission(G, 1);
    G.dialogue = [];
    var mc = G.missionCar;
    if (mc) {
      G.player.x = mc.x + 70;
      G.player.y = mc.y + 40;
    }
  }
  // Point the camera at the player for a clean first frame.
  G.cam.x = VH.clamp(G.player.x - VH.CFG.viewW / 2, 0, VH.CFG.world - VH.CFG.viewW);
  G.cam.y = VH.clamp(G.player.y - VH.CFG.viewH / 2, 0, VH.CFG.world - VH.CFG.viewH);
};

// ---- Boot ----

VH.boot = function () {
  var params = new URLSearchParams(window.location.search);
  var seed = parseInt(params.get('seed') || '7', 10);
  if (isNaN(seed)) seed = 7;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var G = VH.newGame(seed);
  G.saveExists = !!VH.loadSave();
  VH.buildWorld(G);
  VH.bindInput(G, canvas);
  window.VH = VH;
  VH.G = G;
  // Screenshot scenes (?shot=cover|drive|mission|start) stage a fixed setup.
  var shot = params.get('shot');
  if (shot) VH.stageScene(G, shot);
  var loop = function (t) {
    var now = t / 1000;
    var dt = Math.min(0.05, now - (G.last || now));
    G.last = now;
    VH.update(G, dt);
    VH.render(G, ctx);
    VH.ready = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return G;
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', VH.boot);
} else {
  VH.boot();
}
