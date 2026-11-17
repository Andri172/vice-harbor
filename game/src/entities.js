// People and vehicles of Vice Harbor: the player, traffic, pedestrians,
// police, combat and the wanted system. All behaviour here is original code.

VH.makeCar = function (G, x, y, angle, type, kind) {
  return {
    x: x, y: y, angle: angle, speed: 0,
    type: type, kind: kind || 'parked',
    health: VH.CFG.carHealth, r: VH.CFG.carRadius,
    driver: kind === 'traffic',
    // Traffic state: grid intersection the car is heading to.
    ti: 0, tj: 0, ni: 0, nj: 0, mdx: 1, mdy: 0,
    targetSpeed: 0, stuckTimer: 0, reverseTimer: 0,
    smokeTimer: 0, hitCd: 0, id: G.nextCarId++,
  };
};

VH.spawnParkedCars = function (G, rng) {
  G.city.parkedSpots.forEach(function (spot) {
    if (rng() < 0.35) return; // some spots stay empty
    var type = VH.pick(rng, VH.CAR_TYPES.filter(function (t) { return t.kind !== 'police'; }));
    var car = VH.makeCar(G, spot.x, spot.y, spot.angle, type, 'parked');
    G.cars.push(car);
  });
};

VH.spawnTraffic = function (G, n) {
  var rng = G.rng;
  for (var k = 0; k < n; k++) {
    var p = VH.randomRoadPoint(rng, G.city);
    var type = VH.pick(rng, VH.CAR_TYPES.filter(function (t) { return t.kind !== 'police'; }));
    var car = VH.makeCar(G, p.x, p.y, 0, type, 'traffic');
    // Pick a random starting intersection and a neighbour to head for.
    car.ti = VH.randInt(rng, 0, VH.CFG.blocks);
    car.tj = VH.randInt(rng, 0, VH.CFG.blocks);
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var d = VH.pick(rng, dirs);
    car.mdx = d[0]; car.mdy = d[1];
    car.ni = VH.clamp(car.ti + d[0], 0, VH.CFG.blocks);
    car.nj = VH.clamp(car.tj + d[1], 0, VH.CFG.blocks);
    car.x = VH.roadAt(car.ti);
    car.y = VH.roadAt(car.tj);
    car.angle = Math.atan2(car.mdy, car.mdx);
    car.targetSpeed = VH.rand(rng, VH.CFG.trafficSpeedMin, VH.CFG.trafficSpeedMax);
    car.speed = car.targetSpeed;
    G.cars.push(car);
  }
};

VH.spawnPeds = function (G, n) {
  for (var k = 0; k < n; k++) {
    G.peds.push(VH.makePed(G));
  }
};

VH.makePed = function (G, x, y, kind) {
  var rng = G.rng;
  var p = x === undefined ? VH.randomSidewalkPoint(rng) : { x: x, y: y };
  // Start walking from the nearest intersection so the first target is near.
  var ti0 = VH.clamp(Math.round((p.x - VH.CFG.road / 2) / (VH.CFG.block + VH.CFG.road)), 0, VH.CFG.blocks);
  var tj0 = VH.clamp(Math.round((p.y - VH.CFG.road / 2) / (VH.CFG.block + VH.CFG.road)), 0, VH.CFG.blocks);
  return {
    x: p.x, y: p.y, angle: rng() * Math.PI * 2,
    speed: VH.rand(rng, VH.CFG.pedSpeedMin, VH.CFG.pedSpeedMax),
    r: VH.CFG.pedRadius, kind: kind || 'ped',
    state: 'walk', stateTimer: 0, health: kind === 'gang' ? 3 : 1,
    color: VH.pick(rng, ['#d8a05a', '#7fb069', '#c96f4a', '#6a8caf', '#b5658a', '#8a7fd8']),
    shirt: VH.pick(rng, ['#d8d8d8', '#e8e8e8', '#c0c0c0']),
    // Walking target: a nearby intersection, with a sidewalk offset.
    ti: ti0, tj: tj0, ni: Math.min(ti0 + 1, VH.CFG.blocks), nj: tj0, mdx: 1, mdy: 0,
    fleeX: 0, fleeY: 0, shootTimer: VH.rand(rng, 0.5, 1.5),
    down: 0, // seconds remaining knocked down
  };
};

// ---- Player on foot ----

VH.updatePlayerOnFoot = function (G, dt) {
  var p = G.player;
  var k = G.keys;
  var dx = (k[VH.KEYS.right] ? 1 : 0) - (k[VH.KEYS.left] ? 1 : 0);
  var dy = (k[VH.KEYS.down] ? 1 : 0) - (k[VH.KEYS.up] ? 1 : 0);
  var run = k[VH.KEYS.run];
  var sp = run ? VH.CFG.runSpeed : VH.CFG.walkSpeed;
  if (dx || dy) {
    var len = Math.sqrt(dx * dx + dy * dy);
    p.x += (dx / len) * sp * dt;
    p.y += (dy / len) * sp * dt;
  }
  // The player faces the mouse (twin-stick aiming).
  var m = G.mouseWorld;
  p.angle = Math.atan2(m.y - p.y, m.x - p.x);
  var c = { x: p.x, y: p.y, r: p.r };
  VH.resolveSolids(c, G.solids);
  p.x = c.x; p.y = c.y;
  VH.clampToWorld(p, 20);
  // Footsteps stir a little dust when running.
  if ((dx || dy) && run && Math.random() < dt * 6) {
    VH.burst(G, p.x, p.y + 8, 1, '#9a938a', 12, 0.4, 2);
  }
};

// ---- Driving ----

VH.updateDriving = function (G, dt) {
  var p = G.player;
  var car = p.car;
  var k = G.keys;
  var forward = (k[VH.KEYS.up] ? 1 : 0) - (k[VH.KEYS.down] ? 1 : 0);
  var steer = (k[VH.KEYS.left] ? 1 : 0) - (k[VH.KEYS.right] ? 1 : 0);
  var handbrake = !!k[VH.KEYS.handbrake];

  if (forward > 0) car.speed += VH.CFG.carAccel * dt;
  else if (forward < 0) {
    if (car.speed > 20) car.speed -= VH.CFG.carBrake * dt;
    else car.speed -= VH.CFG.carAccel * 0.6 * dt;
  } else {
    car.speed -= car.speed * 1.4 * dt; // rolling drag
  }
  car.speed = VH.clamp(car.speed, -VH.CFG.carReverseMax, car.type.top);

  // Steering only bites while moving; handbrake makes the tail step out.
  var spd = Math.abs(car.speed);
  var grip = handbrake ? 0.45 : 1;
  var turn = VH.CFG.carTurnRate * steer * VH.clamp(spd / 120, 0, 1) * grip;
  car.angle += turn * dt * (car.speed < 0 ? -1 : 1);

  var nx = car.x + Math.cos(car.angle) * car.speed * dt;
  var ny = car.y + Math.sin(car.angle) * car.speed * dt;
  var c = { x: nx, y: ny, r: car.r };
  var hits = VH.resolveSolids(c, G.solids);
  if (hits) {
    var impact = Math.abs(car.speed);
    if (impact > 140) {
      VH.damageCar(G, car, (impact - 140) / 9, 'wall');
      VH.damagePlayer(G, impact / 40);
      VH.sfx('crash');
      G.shake = Math.min(14, impact / 30);
      VH.burst(G, car.x, car.y, 10, '#c8c8c8', 90, 0.6, 3);
    }
    car.speed *= 0.35;
    nx = c.x; ny = c.y;
  }
  // Skid marks while the handbrake is down at speed, or under hard braking.
  if ((handbrake && spd > 120) || (forward < 0 && spd > 160)) {
    VH.addSkid(G, car);
    if (Math.random() < dt * 20) VH.burst(G, car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14, 1, '#888888', 20, 0.5, 2);
  }
  car.x = nx; car.y = ny;
  VH.clampToWorld(car, 24);
  p.x = car.x; p.y = car.y;
  p.angle = car.angle;
};

// ---- Entering and leaving cars ----

VH.nearestEnterableCar = function (G) {
  var best = null, bestD = 52;
  G.cars.forEach(function (car) {
    if (car.kind === 'police' || car.kind === 'wreck') return;
    if (Math.abs(car.speed) > 40) return;
    var d = VH.dist(G.player.x, G.player.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  });
  return best;
};

VH.tryEnterCar = function (G) {
  var p = G.player;
  if (p.car) { VH.exitCar(G); return; }
  var car = VH.nearestEnterableCar(G);
  if (!car) return;
  var wasParked = car.kind === 'parked';
  var wasTraffic = car.kind === 'traffic';
  // A traffic car's driver bails out and runs.
  if (wasTraffic && car.driver) {
    var d = VH.makePed(G, car.x + 20, car.y + 10, 'ped');
    d.state = 'flee'; d.fleeX = car.x; d.fleeY = car.y; d.stateTimer = 2.5;
    G.peds.push(d);
    car.driver = false;
  }
  car.kind = 'player';
  p.car = car;
  p.x = car.x; p.y = car.y;
  VH.sfx('enter');
  G.stats.carsStolen++;
  // Stealing a car in front of witnesses is a crime (mission cars exempt:
  // the mission itself raises the wanted level when its car is taken).
  if ((wasParked || wasTraffic) && !G.missionTheftOk && !car.missionCar) {
    var witnessed = false;
    G.peds.forEach(function (ped) {
      if (ped.kind === 'cop' || ped.kind === 'ped') {
        if (VH.dist(ped.x, ped.y, car.x, car.y) < 260) witnessed = true;
      }
    });
    G.cars.forEach(function (other) {
      if (other.kind === 'police' && VH.dist(other.x, other.y, car.x, car.y) < 320) witnessed = true;
    });
    if (witnessed) {
      VH.addWanted(G, 1, 'car theft witnessed');
      G.toast('Witnessed! Car theft — wanted level up', 2.5);
    }
  }
  G.missionTheftOk = false;
};

VH.exitCar = function (G) {
  var p = G.player;
  var car = p.car;
  if (!car) return;
  // Step out to the side of the car.
  var side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 30;
  p.y = car.y + Math.sin(side) * 30;
  var c = { x: p.x, y: p.y, r: p.r };
  VH.resolveSolids(c, G.solids);
  p.x = c.x; p.y = c.y;
  car.speed = 0;
  p.car = null;
};

// ---- Damage, wanted, busted / wasted ----

VH.damageCar = function (G, car, amount, cause) {
  if (car.health <= 0) return;
  car.health -= amount;
  if (car.health < 35 && Math.random() < 0.5) {
    VH.burst(G, car.x, car.y - 6, 2, '#555555', 30, 0.8, 4);
  }
  if (car.health <= 0) {
    car.health = 0;
    car.kind = car.kind === 'player' ? 'wreck' : car.kind;
    VH.burst(G, car.x, car.y, 26, '#ff9a3c', 160, 0.8, 4);
    VH.burst(G, car.x, car.y, 14, '#444444', 60, 1.4, 6);
    VH.sfx('crash');
    G.shake = 16;
    if (G.player.car === car) {
      VH.damagePlayer(G, 12);
      VH.exitCar(G);
      G.toast('Your car is wrecked!', 2.5);
    }
  }
};

VH.damagePlayer = function (G, amount) {
  if (G.state !== 'playing') return;
  G.player.health -= amount;
  G.player.hurtTimer = 5;
  if (G.player.health <= 0) {
    G.player.health = 0;
    VH.wasted(G);
  }
};

VH.addWanted = function (G, n, reason) {
  if (G.wanted >= VH.CFG.maxWanted) return;
  G.wanted = Math.min(VH.CFG.maxWanted, G.wanted + n);
  G.wantedTimer = 0;
  G.lastCrime = reason || '';
  if (G.wanted > 0) G.toast('Wanted level ' + G.wanted + ' — ' + G.lastCrime, 2.5);
};

VH.busted = function (G) {
  if (G.state !== 'playing') return;
  if (G.player.car) VH.exitCar(G);
  G.state = 'busted';
  var fine = Math.min(G.cash, 200);
  G.cash -= fine;
  G.bustedFine = fine;
  G.wanted = 0;
  VH.sfx('busted');
  VH.saveGame(G);
};

VH.wasted = function (G) {
  if (G.state !== 'playing') return;
  if (G.player.car) VH.exitCar(G);
  G.state = 'wasted';
  var fine = Math.min(G.cash, 150);
  G.cash -= fine;
  G.wastedFine = fine;
  G.wanted = 0;
  VH.sfx('wasted');
  VH.saveGame(G);
};

// Respawn at the hospital after busted / wasted.
VH.respawn = function (G) {
  var h = G.city.specials.hospital;
  G.player.x = h.x;
  G.player.y = VH.roadAt(2);
  G.player.health = VH.CFG.playerHealth;
  G.player.car = null;
  G.player.angle = -Math.PI / 2;
  G.cam.x = VH.clamp(G.player.x - VH.CFG.viewW / 2, 0, VH.CFG.world - VH.CFG.viewW);
  G.cam.y = VH.clamp(G.player.y - VH.CFG.viewH / 2, 0, VH.CFG.world - VH.CFG.viewH);
  G.state = 'playing';
  if (G.mission) VH.restartMission(G);
};

// ---- Traffic AI: cars follow the road grid, intersection to intersection ----

VH.trafficTargetPoint = function (car) {
  // Lane offset: right-hand side of the direction of travel.
  var ox = 0, oy = 0;
  if (car.mdx !== 0) oy = car.mdx > 0 ? VH.CFG.lane : -VH.CFG.lane;
  else ox = car.mdy > 0 ? -VH.CFG.lane : VH.CFG.lane;
  return { x: VH.roadAt(car.ni) + ox, y: VH.roadAt(car.nj) + oy };
};

VH.updateTraffic = function (G, dt) {
  var p = G.player;
  G.cars.forEach(function (car) {
    if (car.kind !== 'traffic') return;
    var tp = VH.trafficTargetPoint(car);
    var dx = tp.x - car.x, dy = tp.y - car.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    // Slow down for the car ahead.
    var want = car.targetSpeed;
    G.cars.forEach(function (other) {
      if (other === car || other.kind === 'wreck') return;
      var ox = other.x - car.x, oy = other.y - car.y;
      var along = ox * car.mdx + oy * car.mdy;
      var side = Math.abs(ox * car.mdy - oy * car.mdx);
      if (along > 0 && along < 78 && side < 26) {
        want = Math.min(want, Math.max(0, other.speed - 6));
        if (along < 34) want = 0;
      }
    });
    // Slow for the player crossing in front.
    if (p.car !== car) {
      var px = p.x - car.x, py = p.y - car.y;
      var alongP = px * car.mdx + py * car.mdy;
      var sideP = Math.abs(px * car.mdy - py * car.mdx);
      if (alongP > 0 && alongP < 60 && sideP < 24) want = Math.min(want, 0);
    }
    car.speed += VH.clamp(want - car.speed, -160 * dt, 90 * dt);
    if (d > 4) {
      car.angle = Math.atan2(dy, dx);
      var step = car.speed * dt;
      if (step > d) step = d;
      car.x += Math.cos(car.angle) * step;
      car.y += Math.sin(car.angle) * step;
    }
    if (d < 8) {
      // Arrived: pick the next intersection (straight most of the time).
      car.ti = car.ni; car.tj = car.nj;
      var straight = Math.random() < 0.65;
      var opts = [];
      if (straight) opts.push([car.mdx, car.mdy]);
      opts.push([car.mdy, car.mdx], [-car.mdy, -car.mdx]);
      if (car.mdx !== 0) opts.push([0, 1], [0, -1]);
      else opts.push([1, 0], [-1, 0]);
      var pick = null;
      for (var tries = 0; tries < 8 && !pick; tries++) {
        var o = opts[Math.floor(Math.random() * opts.length)];
        var ni = car.ti + o[0], nj = car.tj + o[1];
        if (ni >= 0 && ni <= VH.CFG.blocks && nj >= 0 && nj <= VH.CFG.blocks) {
          pick = o;
        }
      }
      if (!pick) pick = [-car.mdx, -car.mdy];
      car.mdx = pick[0]; car.mdy = pick[1];
      car.ni = car.ti + pick[0];
      car.nj = car.tj + pick[1];
    }
  });
  // Keep traffic near the player: recycle cars that drifted far away.
  for (var i = G.cars.length - 1; i >= 0; i--) {
    var c2 = G.cars[i];
    if (c2.kind === 'traffic' && VH.dist(c2.x, c2.y, p.x, p.y) > 1100) {
      var np = VH.randomRoadPoint(G.rng, G.city, p.x, p.y, 500);
      c2.x = np.x; c2.y = np.y;
      c2.ti = VH.randInt(G.rng, 0, VH.CFG.blocks);
      c2.tj = VH.randInt(G.rng, 0, VH.CFG.blocks);
      c2.ni = c2.ti; c2.nj = c2.tj;
    }
  }
};

// ---- Police ----

VH.updatePolice = function (G, dt) {
  var p = G.player;
  // How many police cars should be out, by wanted level.
  var wantCount = G.wanted > 0 ? Math.min(G.wanted + 1, 5) : 0;
  var policeCars = G.cars.filter(function (c) { return c.kind === 'police'; });
  if (policeCars.length < wantCount && G.state === 'playing' && !G.stageNoSpawn) {
    var spot = VH.randomIntersection(G.rng, p.x, p.y, 480, 800);
    var type = VH.CAR_TYPES.filter(function (t) { return t.kind === 'police'; })[0];
    var pc = VH.makeCar(G, spot.x, spot.y, 0, type, 'police');
    pc.targetSpeed = 380;
    G.cars.push(pc);
  }
  // Foot cops at wanted 2+ when the player is on foot.
  var cops = G.peds.filter(function (pd) { return pd.kind === 'cop'; });
  if (G.wanted >= 2 && !p.car && cops.length < Math.min(G.wanted, 3) && G.state === 'playing') {
    var cp = VH.makePed(G, p.x + VH.rand(G.rng, -260, 260), p.y + VH.rand(G.rng, -260, 260), 'cop');
    cp.speed = 150;
    G.peds.push(cp);
  }
  // Police cars chase the player.
  G.cars.forEach(function (car) {
    if (car.kind !== 'police') return;
    var dx = p.x - car.x, dy = p.y - car.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    var desired = Math.atan2(dy, dx);
    if (car.reverseTimer > 0) {
      car.reverseTimer -= dt;
      car.speed = Math.max(car.speed - 260 * dt, -110);
    } else {
      car.speed = Math.min(car.speed + 300 * dt, 375);
      car.angle = VH.turnToward(car.angle, desired, 3.4 * dt);
    }
    var nx = car.x + Math.cos(car.angle) * car.speed * dt;
    var ny = car.y + Math.sin(car.angle) * car.speed * dt;
    var c = { x: nx, y: ny, r: car.r };
    if (VH.resolveSolids(c, G.solids)) {
      car.speed *= 0.4;
      car.stuckTimer += dt;
      if (car.stuckTimer > 1.1) { car.reverseTimer = 0.7; car.stuckTimer = 0; }
    } else {
      car.stuckTimer = 0;
    }
    car.x = c.x; car.y = c.y;
    // Ram the player's car (firm but survivable: a chase should last).
    if (p.car && d < 44) {
      VH.damageCar(G, p.car, 8 * dt, 'police');
      VH.damagePlayer(G, 2 * dt);
      G.shake = Math.max(G.shake, 4);
      if (Math.random() < dt * 8) VH.sfx('crash');
    }
    // Despawn when the heat is off and the car is far away.
    if (G.wanted === 0 && d > 950) car.kind = 'gone';
  });
  G.cars = G.cars.filter(function (c) { return c.kind !== 'gone'; });

  // Foot cops chase and can bust the player.
  G.peds.forEach(function (cop) {
    if (cop.kind !== 'cop') return;
    var dx = p.x - cop.x, dy = p.y - cop.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (p.car) {
      // Run at the car; if it is nearly stopped, drag the player out.
      cop.angle = Math.atan2(dy, dx);
      var sp = d > 40 ? 165 : 0;
      cop.x += Math.cos(cop.angle) * sp * dt;
      cop.y += Math.sin(cop.angle) * sp * dt;
      if (d < 46 && Math.abs(p.car.speed) < 15) {
        cop.stateTimer += dt;
        if (cop.stateTimer > 1.5) VH.busted(G);
      } else {
        cop.stateTimer = 0;
      }
    } else {
      cop.angle = Math.atan2(dy, dx);
      var c2 = { x: cop.x + Math.cos(cop.angle) * cop.speed * dt, y: cop.y + Math.sin(cop.angle) * cop.speed * dt, r: cop.r };
      VH.resolveSolids(c2, G.solids);
      cop.x = c2.x; cop.y = c2.y;
      if (d < VH.CFG.bustDistance) {
        cop.stateTimer += dt;
        if (cop.stateTimer > VH.CFG.bustHoldSeconds) VH.busted(G);
      } else {
        cop.stateTimer = 0;
      }
    }
  });
  // Wanted decays when no police can see the player for a while.
  if (G.wanted > 0) {
    var nearPolice = false;
    G.cars.forEach(function (car) {
      if (car.kind === 'police' && VH.dist(car.x, car.y, p.x, p.y) < 520) nearPolice = true;
    });
    G.peds.forEach(function (pd) {
      if (pd.kind === 'cop' && VH.dist(pd.x, pd.y, p.x, p.y) < 420) nearPolice = true;
    });
    if (nearPolice) {
      G.wantedTimer = 0;
    } else {
      G.wantedTimer += dt;
      if (G.wantedTimer > VH.CFG.wantedDecaySeconds) {
        G.wanted--;
        G.wantedTimer = 0;
        G.toast(G.wanted > 0 ? 'Wanted level dropped to ' + G.wanted : 'You lost the heat', 2.5);
      }
    }
  }
};

// ---- Pedestrians ----

VH.updatePeds = function (G, dt) {
  var p = G.player;
  G.peds.forEach(function (ped) {
    if (ped.kind === 'cop') return; // cops are handled by updatePolice
    if (ped.down > 0) {
      ped.down -= dt;
      return;
    }
    if (ped.kind === 'gang') {
      // Gang members shoot at the player when close and they can see him.
      // Without a line of sight they keep closing in instead of standing
      // behind a container stack forever, wasting shots on crates: the
      // approach slides along solids, so they work their way around cover.
      var dx = p.x - ped.x, dy = p.y - ped.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 340 && G.state === 'playing') {
        ped.angle = Math.atan2(dy, dx);
        var seesPlayer = VH.hasLineOfSight(G, ped.x, ped.y, p.x, p.y);
        ped.shootTimer -= dt;
        if (ped.shootTimer <= 0) {
          ped.shootTimer = 1.1 + Math.random() * 0.5;
          if (seesPlayer) VH.gangShoot(G, ped);
        }
        if (d > 180 || !seesPlayer) {
          var c = { x: ped.x + Math.cos(ped.angle) * 85 * dt, y: ped.y + Math.sin(ped.angle) * 85 * dt, r: ped.r };
          VH.resolveSolids(c, G.solids);
          ped.x = c.x; ped.y = c.y;
        }
      }
      return;
    }
    // Fleeing from danger.
    if (ped.state === 'flee') {
      ped.stateTimer -= dt;
      var fx = ped.x - ped.fleeX, fy = ped.y - ped.fleeY;
      var fl = Math.sqrt(fx * fx + fy * fy) || 1;
      var c2 = { x: ped.x + (fx / fl) * 175 * dt, y: ped.y + (fy / fl) * 175 * dt, r: ped.r };
      VH.resolveSolids(c2, G.solids);
      ped.x = c2.x; ped.y = c2.y;
      ped.angle = Math.atan2(fy, fx);
      if (ped.stateTimer <= 0) ped.state = 'walk';
      return;
    }
    // Panic: a fast car or a gunshot nearby sends a ped fleeing.
    var danger = false;
    if (G.shotsFiredAt && G.time - G.shotsFiredAt < 1.2 && VH.dist(ped.x, ped.y, G.shotsFiredX, G.shotsFiredY) < 170) danger = true;
    if (p.car && Math.abs(p.car.speed) > 120 && VH.dist(ped.x, ped.y, p.x, p.y) < 60) danger = true;
    if (danger) {
      ped.state = 'flee';
      ped.fleeX = p.x; ped.fleeY = p.y;
      ped.stateTimer = 2.5;
      return;
    }
    // Walk the sidewalk grid, intersection to intersection.
    var tp = VH.pedTargetPoint(ped);
    var dx2 = tp.x - ped.x, dy2 = tp.y - ped.y;
    var d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (d2 > 4) {
      ped.angle = Math.atan2(dy2, dx2);
      var step = ped.speed * dt;
      if (step > d2) step = d2;
      ped.x += Math.cos(ped.angle) * step;
      ped.y += Math.sin(ped.angle) * step;
    } else {
      ped.ti = ped.ni; ped.tj = ped.nj;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      var back = [-ped.mdx, -ped.mdy];
      var choices = dirs.filter(function (o) {
        return !(o[0] === back[0] && o[1] === back[1]) &&
          ped.ti + o[0] >= 0 && ped.ti + o[0] <= VH.CFG.blocks &&
          ped.tj + o[1] >= 0 && ped.tj + o[1] <= VH.CFG.blocks;
      });
      var o2 = VH.pick(G.rng, choices.length ? choices : dirs);
      ped.mdx = o2[0]; ped.mdy = o2[1];
      ped.ni = ped.ti + o2[0];
      ped.nj = ped.tj + o2[1];
    }
  });
  // Hit a pedestrian with the car: they go down, and it is a crime.
  if (p.car && Math.abs(p.car.speed) > 40) {
    G.peds.forEach(function (ped) {
      if (ped.down > 0 || ped.kind === 'gang') return;
      if (VH.dist(ped.x, ped.y, p.x, p.y) < 26) {
        ped.down = 6;
        ped.state = 'walk';
        G.stats.pedsHit++;
        VH.addWanted(G, 1, 'hit a pedestrian');
        VH.burst(G, ped.x, ped.y, 8, '#c8c8c8', 60, 0.5, 3);
        G.shake = Math.max(G.shake, 5);
        VH.sfx('crash');
      }
    });
  }
};

VH.pedTargetPoint = function (ped) {
  // Sidewalk offset: right-hand side of the walking direction.
  var off = VH.CFG.road / 2 + 10;
  var ox = 0, oy = 0;
  if (ped.mdx !== 0) oy = ped.mdx > 0 ? off : -off;
  else ox = ped.mdy > 0 ? -off : off;
  return { x: VH.roadAt(ped.ni) + ox, y: VH.roadAt(ped.nj) + oy };
};

// ---- Combat ----

VH.playerShoot = function (G) {
  var p = G.player;
  if (p.car) return; // no drive-by shooting: combat is on foot
  if (G.time - (G.lastShot || 0) < VH.CFG.fireInterval) return;
  G.lastShot = G.time;
  G.stats.shotsFired++;
  var m = G.mouseWorld;
  var ang = Math.atan2(m.y - p.y, m.x - p.x);
  G.bullets.push({
    x: p.x + Math.cos(ang) * 18, y: p.y + Math.sin(ang) * 18,
    vx: Math.cos(ang) * VH.CFG.bulletSpeed, vy: Math.sin(ang) * VH.CFG.bulletSpeed,
    life: VH.CFG.bulletLife, from: 'player', damage: VH.CFG.gunDamage,
  });
  G.muzzle = 0.05;
  G.shotsFiredAt = G.time;
  G.shotsFiredX = p.x; G.shotsFiredY = p.y;
  VH.sfx('shot');
  // Firing near police is a crime.
  var nearCop = false;
  G.cars.forEach(function (car) {
    if (car.kind === 'police' && VH.dist(car.x, car.y, p.x, p.y) < 320) nearCop = true;
  });
  if (nearCop && G.time - (G.lastCrimeAt || 0) > 2) {
    G.lastCrimeAt = G.time;
    VH.addWanted(G, 1, 'shots fired near police');
  }
};

VH.gangShoot = function (G, gang) {
  var p = G.player;
  var ang = Math.atan2(p.y - gang.y, p.x - gang.x) + (Math.random() - 0.5) * 0.22;
  G.bullets.push({
    x: gang.x + Math.cos(ang) * 16, y: gang.y + Math.sin(ang) * 16,
    vx: Math.cos(ang) * 520, vy: Math.sin(ang) * 520,
    life: 0.7, from: 'gang', damage: 8,
  });
  VH.sfx('shot');
};

// Line of sight: sample the segment every 3px; blocked if any sample is
// inside a solid (a building or a crate) — the same solids that stop
// bullets, so a shooter who can see the player can also hit him. The fine
// step matters: a coarse sample can step over a crate corner that a bullet
// would still clip, leaving a shooter standing behind cover forever.
VH.hasLineOfSight = function (G, x1, y1, x2, y2) {
  var dist = VH.dist(x1, y1, x2, y2);
  var steps = Math.max(1, Math.ceil(dist / 3));
  for (var i = 1; i < steps; i++) {
    var t = i / steps;
    var sx = x1 + (x2 - x1) * t, sy = y1 + (y2 - y1) * t;
    for (var s = 0; s < G.solids.length; s++) {
      if (VH.inRect(sx, sy, G.solids[s])) return false;
    }
  }
  return true;
};

// Does the segment (x1,y1)->(x2,y2) pass within r of (cx,cy)? Bullets move
// 15-30px per frame, so a point test at the new position alone can step
// clean over a small target on a slow frame. Test the whole swept segment.
VH.segHit = function (x1, y1, x2, y2, cx, cy, r) {
  var dx = x2 - x1, dy = y2 - y1;
  var len2 = dx * dx + dy * dy;
  var t = len2 > 0 ? ((cx - x1) * dx + (cy - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return VH.dist(x1 + t * dx, y1 + t * dy, cx, cy) < r;
};

VH.updateBullets = function (G, dt) {
  for (var i = G.bullets.length - 1; i >= 0; i--) {
    var b = G.bullets[i];
    var px = b.x, py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    var dead = b.life <= 0;
    if (!dead) {
      // Buildings stop bullets with a spark.
      for (var s = 0; s < G.solids.length; s++) {
        if (VH.inRect(b.x, b.y, G.solids[s])) {
          VH.burst(G, b.x, b.y, 4, '#ffd75e', 80, 0.3, 2);
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.from === 'player') {
      // Hit a person.
      for (var k = 0; k < G.peds.length; k++) {
        var ped = G.peds[k];
        if (ped.down > 0) continue;
        if (VH.segHit(px, py, b.x, b.y, ped.x, ped.y, ped.r + 4)) {
          dead = true;
          ped.health -= b.damage;
          VH.burst(G, ped.x, ped.y, 6, '#e8e8e8', 70, 0.4, 2);
          if (ped.health <= 0) {
            if (ped.kind === 'gang') {
              G.stats.gangDown++;
              G.peds.splice(k, 1);
              VH.burst(G, ped.x, ped.y, 14, '#ff8c1a', 120, 0.6, 3);
            } else {
              ped.down = 6;
              ped.health = 1;
              if (ped.kind === 'cop') VH.addWanted(G, 2, 'shot a police officer');
              else VH.addWanted(G, 1, 'shot a pedestrian');
            }
          }
          break;
        }
      }
      // Hit a car. The player's own car is excluded: a bullet fired from
      // inside it starts at its centre and would kill itself on frame one.
      if (!dead) {
        for (var c = 0; c < G.cars.length; c++) {
          var car = G.cars[c];
          if (car.kind === 'wreck') continue;
          if (car === G.player.car) continue;
          if (VH.segHit(px, py, b.x, b.y, car.x, car.y, car.r + 4)) {
            dead = true;
            VH.damageCar(G, car, 6, 'bullet');
            VH.burst(G, b.x, b.y, 4, '#c8c8c8', 70, 0.3, 2);
            break;
          }
        }
      }
    }
    if (!dead && b.from === 'gang') {
      var p = G.player;
      if (!p.car && VH.segHit(px, py, b.x, b.y, p.x, p.y, p.r + 4)) {
        dead = true;
        VH.damagePlayer(G, b.damage);
        VH.burst(G, p.x, p.y, 6, '#ff5a4a', 80, 0.4, 2);
      } else if (p.car && VH.segHit(px, py, b.x, b.y, p.car.x, p.car.y, p.car.r + 4)) {
        dead = true;
        VH.damageCar(G, p.car, 2, 'bullet');
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }
};

// ---- Particles and skid marks ----

VH.burst = function (G, x, y, n, color, speed, life, size) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2;
    var v = speed * (0.4 + Math.random() * 0.6);
    G.parts.push({
      x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: life * (0.6 + Math.random() * 0.4), maxLife: life,
      color: color, size: size * (0.7 + Math.random() * 0.6),
    });
    if (G.parts.length > 500) G.parts.shift();
  }
};

VH.updateParticles = function (G, dt) {
  for (var i = G.parts.length - 1; i >= 0; i--) {
    var pt = G.parts[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96; pt.vy *= 0.96;
    pt.life -= dt;
    if (pt.life <= 0) G.parts.splice(i, 1);
  }
  if (G.muzzle > 0) G.muzzle -= dt;
  // Wrecked and smoking cars keep puffing.
  G.cars.forEach(function (car) {
    if (car.health < 35 && car.health > 0) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.12;
        VH.burst(G, car.x, car.y - 6, 1, '#555555', 14, 1.1, 5);
      }
    }
  });
};

VH.addSkid = function (G, car) {
  var back = 14;
  var bx = car.x - Math.cos(car.angle) * back;
  var by = car.y - Math.sin(car.angle) * back;
  var perp = car.angle + Math.PI / 2;
  G.skids.push({
    x1: bx + Math.cos(perp) * 8, y1: by + Math.sin(perp) * 8,
    x2: bx - Math.cos(perp) * 8, y2: by - Math.sin(perp) * 8,
    life: 6,
  });
  if (G.skids.length > 420) G.skids.shift();
};

VH.updateSkids = function (G, dt) {
  for (var i = G.skids.length - 1; i >= 0; i--) {
    G.skids[i].life -= dt;
    if (G.skids[i].life <= 0) G.skids.splice(i, 1);
  }
};

// ---- Drawing people and vehicles ----

VH.drawCar = function (ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  var L = 34, W = 18;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 2, -W / 2 + 3, L, W);
  // Body.
  ctx.fillStyle = car.type.color;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, 5);
  ctx.fill();
  // Cabin and windshield.
  ctx.fillStyle = 'rgba(20,30,50,0.85)';
  ctx.fillRect(-4, -W / 2 + 3, 12, W - 6);
  ctx.fillStyle = 'rgba(200,220,240,0.5)';
  ctx.fillRect(8, -W / 2 + 3, 4, W - 6);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 4);
  ctx.fillRect(L / 2 - 2, W / 2 - 6, 3, 4);
  // Police livery and light bar.
  if (car.kind === 'police') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-L / 2 + 2, -W / 2 + 2, L - 4, 5);
    var blink = Math.floor(Date.now() / 280) % 2 === 0;
    ctx.fillStyle = blink ? '#ff3b30' : '#2f6df6';
    ctx.fillRect(-6, -W / 2 - 2, 12, 4);
  }
  // Damage smoke is drawn as particles; a wreck is dark and tilted.
  if (car.health <= 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(-L / 2, -W / 2, L, W);
  }
  ctx.restore();
};

VH.drawPed = function (ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.down > 0) {
    // Knocked down: lying flat.
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.color;
    ctx.fillRect(-11, -4, 22, 8);
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath(); ctx.arc(13, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  // Shadow, body, head.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(2, 2, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.kind === 'cop' ? '#1f2a44' : (ped.kind === 'gang' ? '#8a2f1d' : ped.color);
  ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8c9a0';
  ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI * 2); ctx.fill();
  // A cop's cap, a gang member's gun.
  if (ped.kind === 'cop') {
    ctx.fillStyle = '#101828';
    ctx.fillRect(2, -5, 5, 10);
  }
  if (ped.kind === 'gang') {
    ctx.fillStyle = '#222222';
    ctx.fillRect(8, -2, 10, 3);
  }
  ctx.restore();
};

VH.drawEntities = function (ctx, G) {
  // Skid marks under everything.
  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 3;
  G.skids.forEach(function (s) {
    ctx.globalAlpha = Math.min(0.55, s.life / 6);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  // Cars, then people, then bullets and particles.
  G.cars.forEach(function (car) { VH.drawCar(ctx, car); });
  // The player on foot.
  var p = G.player;
  if (!p.car) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(2, 2, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8b93b';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8c9a0';
    ctx.beginPath(); ctx.arc(5, 0, 6, 0, Math.PI * 2); ctx.fill();
    // Pistol in hand.
    ctx.fillStyle = '#222222';
    ctx.fillRect(10, -2, 12, 4);
    // Muzzle flash.
    if (G.muzzle > 0) {
      ctx.fillStyle = 'rgba(255,220,120,0.95)';
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(34, -6);
      ctx.lineTo(34, 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  G.peds.forEach(function (ped) { VH.drawPed(ctx, ped); });
  // Bullets as bright tracers.
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 3;
  G.bullets.forEach(function (b) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });
  // Particles.
  G.parts.forEach(function (pt) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
};
