// The story of Vice Harbor: five sequential missions for Jax Rook, an
// ex-wheelman back in Meridian Bay. Every character and place is invented.

VH.setMarker = function (G, x, y) {
  if (!G.mission) G.mission = {};
  G.mission.marker = { x: x, y: y };
};

VH.atMarker = function (G, radius) {
  if (!G.mission || !G.mission.marker) return false;
  return VH.dist(G.player.x, G.player.y, G.mission.marker.x, G.mission.marker.y) < (radius || 55);
};

VH.say = function (G, who, text) {
  if (G.dialogue.length === 0) G.dialogueTimer = 5;
  G.dialogue.push({ who: who, text: text });
};

VH.startMission = function (G, index) {
  var def = VH.MISSIONS[index];
  if (!def) return;
  G.missionIndex = index;
  G.mission = { def: def, stage: 0, data: {}, marker: null };
  G.dialogue = [];
  def.briefing.forEach(function (line) { VH.say(G, line[0], line[1]); });
  def.start(G);
  G.toast('Mission: ' + def.title, 3);
};

VH.restartMission = function (G) {
  var index = G.missionIndex;
  // Clear mission-spawned gang and the mission car before restarting.
  G.peds = G.peds.filter(function (p) { return p.kind !== 'gang'; });
  var mc = G.missionCar;
  if (mc) {
    var idx = G.cars.indexOf(mc);
    if (idx >= 0) G.cars.splice(idx, 1);
    G.missionCar = null;
  }
  VH.startMission(G, index);
};

VH.completeMission = function (G) {
  var def = G.mission.def;
  G.cash += def.reward;
  G.stats.missionsDone++;
  VH.sfx('mission');
  G.toast('Mission complete — ' + VH.fmtCash(def.reward), 3.5);
  VH.saveGame(G);
  if (G.missionIndex + 1 >= VH.MISSIONS.length) {
    G.state = 'complete';
    G.finalTime = G.playTime;
    VH.saveGame(G);
    return;
  }
  VH.startMission(G, G.missionIndex + 1);
};

VH.failMission = function (G, reason) {
  G.toast('Mission failed — ' + reason + '. Try again.', 3.5);
  VH.restartMission(G);
};

VH.updateMission = function (G, dt) {
  if (!G.mission || !G.mission.def) return;
  G.mission.def.update(G, dt);
};

// Spawn a specific car for a mission (the Comet GT, a delivery sedan, ...).
VH.spawnMissionCar = function (G, typeName, x, y, angle) {
  var type = VH.CAR_TYPES.filter(function (t) { return t.name === typeName; })[0];
  var car = VH.makeCar(G, x, y, angle || 0, type, 'parked');
  car.missionCar = true;
  G.cars.push(car);
  G.missionCar = car;
  return car;
};

VH.MISSIONS = [
  {
    id: 'm1', title: 'Back in the Harbor', reward: 300,
    briefing: [
      ['Eddie Kwan', "Jax Rook. Back in Vice Harbor at last. I thought the mainland had swallowed you."],
      ['Jax Rook', "It tried, Eddie. It tried. What do you need?"],
      ['Eddie Kwan', "A car, then a favour. The garage on Gull Way has a sedan with your name on it. Drive it to my bar."],
    ],
    start: function (G) {
      var garage = G.city.specials.garage;
      VH.setMarker(G, garage.door.x, garage.door.y);
      // A plain sedan waits on the road in front of the garage.
      VH.spawnMissionCar(G, 'Civic', garage.door.x + 30, garage.door.y, 0);
      G.mission.data = { carTaken: false };
    },
    update: function (G) {
      var d = G.mission.data;
      if (G.mission.stage === 0) {
        if (VH.atMarker(G, 70)) {
          G.mission.stage = 1;
          // A toast, not dialogue: mid-mission lines must not freeze the
          // world (dialogue pauses the game until it is skipped).
          G.toast("Jax: There she is. Keys under the mat, like always.", 3);
          G.toast("Eddie: Take her to my bar on Meridian St. Easy money, Jax. Don't scratch her.", 3);
          var bar = G.city.specials.bar;
          VH.setMarker(G, bar.door.x, bar.door.y);
        }
      } else if (G.mission.stage === 1) {
        if (VH.atMarker(G, 70)) VH.completeMission(G);
      }
    },
    objective: function (G) {
      return G.mission.stage === 0
        ? 'Go to Kwan\'s Garage'
        : 'Drive the sedan to Eddie\'s Bar';
    },
  },
  {
    id: 'm2', title: 'The Comet Job', reward: 600,
    briefing: [
      ['Eddie Kwan', "One more job, Jax. A Comet GT — yellow, fast, worth a fortune — sits in the lot by the precinct."],
      ['Eddie Kwan', "Bring it to the chop shop on Copper Ln. The guard there owes Vince Marko money, so he will shout. Be quick."],
      ['Jax Rook', "A loud car, a loud guard, and a loud cop shop next door. Fine."],
    ],
    start: function (G) {
      var lot = G.city.lots.filter(function (l) { return l.kind === 'lot'; })[0];
      var x = lot ? lot.x + lot.w / 2 : G.city.specials.police.x;
      var y = lot ? lot.y + lot.h / 2 : G.city.specials.police.y + 80;
      VH.spawnMissionCar(G, 'Comet GT', x, y, 0);
      VH.setMarker(G, x, y);
      // A guard watches the lot.
      var guard = VH.makePed(G, x + 50, y + 20, 'ped');
      guard.state = 'walk';
      G.peds.push(guard);
      G.mission.data = { guard: guard };
    },
    update: function (G) {
      var d = G.mission.data;
      if (G.mission.stage === 0) {
        var car = G.missionCar;
        if (car && G.player.car === car) {
          G.mission.stage = 1;
          G.missionTheftOk = true;
          VH.addWanted(G, 1, 'the Comet GT was stolen');
          G.toast("Guard: HEY! That Comet belongs to the Breakers! Vince will hear about this!", 3);
          var shop = G.city.specials.chopshop;
          VH.setMarker(G, shop.door.x, shop.door.y);
        }
      } else if (G.mission.stage === 1) {
        if (G.player.car === G.missionCar && VH.atMarker(G, 70)) VH.completeMission(G);
        if (G.player.car !== G.missionCar && G.missionCar) {
          G.toast('Get back in the Comet GT!', 2);
        }
      }
    },
    objective: function (G) {
      return G.mission.stage === 0
        ? 'Steal the yellow Comet GT'
        : 'Deliver the Comet GT to the Chop Shop';
    },
  },
  {
    id: 'm3', title: 'Hot Pursuit', reward: 500,
    briefing: [
      ['Eddie Kwan', "The precinct is buzzing, Jax. Two stars on you already — Detective Holt does not let go."],
      ['Eddie Kwan', "Lose them. Get to the hideout on Dune St and stay out of sight. The heat dies down when nobody sees you."],
    ],
    start: function (G) {
      VH.addWanted(G, 2, 'the precinct is after you');
      var hide = G.city.specials.hideout;
      VH.setMarker(G, hide.door.x, hide.door.y);
      G.mission.data = {};
    },
    update: function (G) {
      if (VH.atMarker(G, 70)) {
        G.wanted = 0;
        G.toast("Jax: Quiet. Finally. Holt's boys will give up by morning.", 3);
        VH.completeMission(G);
      }
    },
    objective: function () {
      return 'Lose the police and reach the Hideout';
    },
  },
  {
    id: 'm4', title: 'Three Drops', reward: 800,
    briefing: [
      ['Eddie Kwan', "A client needs three packages across the bay, and the boat leaves in two and a half minutes."],
      ['Eddie Kwan', "Grab all three, then run them to the docks. Late means sunk, Jax. The clock is already running."],
    ],
    start: function (G) {
      var pkgs = [];
      for (var i = 0; i < 3; i++) {
        var p = VH.randomIntersection(G.rng, G.player.x, G.player.y, 260, 1200);
        pkgs.push({ x: p.x, y: p.y, taken: false });
      }
      G.mission.data = { packages: pkgs, timeLeft: 150 };
      VH.setMarker(G, pkgs[0].x, pkgs[0].y);
    },
    update: function (G, dt) {
      var d = G.mission.data;
      d.timeLeft -= dt;
      if (d.timeLeft <= 0) {
        VH.failMission(G, 'the boat left without the packages');
        return;
      }
      var remaining = d.packages.filter(function (p) { return !p.taken; });
      if (remaining.length === 0) {
        var docks = G.city.specials.docks;
        VH.setMarker(G, docks.door.x, docks.door.y);
        if (VH.atMarker(G, 80)) VH.completeMission(G);
        return;
      }
      var next = remaining[0];
      VH.setMarker(G, next.x, next.y);
      if (VH.dist(G.player.x, G.player.y, next.x, next.y) < 34) {
        next.taken = true;
        VH.sfx('pickup');
        G.cash += 50;
        G.toast('Package picked up (' + (3 - remaining.length + 1) + '/3)', 2);
      }
    },
    objective: function (G) {
      var d = G.mission.data;
      var left = d.packages.filter(function (p) { return !p.taken; }).length;
      if (left > 0) return 'Pick up the packages (' + (3 - left) + '/3) — ' + Math.ceil(d.timeLeft) + 's left';
      return 'Deliver the packages to the Docks — ' + Math.ceil(d.timeLeft) + 's left';
    },
  },
  {
    id: 'm5', title: 'Dockside Showdown', reward: 1500,
    briefing: [
      ['Eddie Kwan', "Vince Marko is at the docks with his whole crew. He wants the Comet back and he wants you gone."],
      ['Eddie Kwan', "End it, Jax. Then get out before Detective Holt's precinct rolls in. This is the last job."],
      ['Jax Rook', "Tell the bay I said goodbye, Eddie."],
    ],
    start: function (G) {
      var docks = G.city.specials.docks;
      VH.setMarker(G, docks.door.x, docks.door.y);
      G.mission.data = { spawned: false, startKills: G.stats.gangDown };
    },
    update: function (G) {
      var d = G.mission.data;
      var docks = G.city.specials.docks;
      if (G.mission.stage === 0) {
        if (VH.dist(G.player.x, G.player.y, docks.x, docks.y) < 420) {
          d.spawned = true;
          G.mission.stage = 1;
          for (var i = 0; i < 6; i++) {
            var gx = docks.x + VH.rand(G.rng, -160, 160);
            var gy = docks.y + VH.rand(G.rng, -120, 120);
            var gang = VH.makePed(G, gx, gy, 'gang');
            G.peds.push(gang);
          }
          G.toast("Vince Marko: Rook! You stole from the Breakers. The bay is going to swallow you tonight!", 3.5);
          VH.addWanted(G, 1, 'a shootout at the docks');
        }
      } else if (G.mission.stage === 1) {
        var left = 6 - (G.stats.gangDown - d.startKills);
        if (left <= 0) {
          G.mission.stage = 2;
          G.toast("Jax: It's done. Marko's crew is finished. Now I disappear.", 3.5);
          VH.addWanted(G, 2, 'the precinct is rolling in');
          var hide = G.city.specials.hideout;
          VH.setMarker(G, hide.door.x, hide.door.y);
        }
      } else if (G.mission.stage === 2) {
        if (VH.atMarker(G, 70)) {
          G.wanted = 0;
          VH.completeMission(G);
        }
      }
    },
    objective: function (G) {
      if (G.mission.stage === 0) return 'Go to the Docks';
      if (G.mission.stage === 1) {
        var left = 6 - (G.stats.gangDown - G.mission.data.startKills);
        return 'Take down the Breakers (' + Math.max(0, left) + ' left)';
      }
      return 'Escape to the Hideout';
    },
  },
];
