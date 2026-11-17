// The city of Vice Harbor: generation, collision data, drawing and minimap.
// The layout is a road grid; every block is either buildings, a park, a
// parking lot or one of the story locations. Generation is seeded, so one
// seed always rebuilds the same city.

VH.buildCity = function (seed) {
  var rng = VH.makeRng(seed || 7);
  var C = VH.CFG;
  var city = {
    buildings: [], parks: [], lots: [], crates: [],
    lamps: [], hydrants: [], parkedSpots: [],
    specials: {},
  };

  // Story locations, one per chosen block (col, row on the block grid).
  var specialBlocks = {
    hospital: [1, 1], garage: [2, 2], bar: [4, 4], chopshop: [6, 3],
    hideout: [1, 7], police: [7, 1], docks: [7, 8],
  };
  var specialAt = {};
  Object.keys(specialBlocks).forEach(function (k) {
    specialAt[specialBlocks[k][0] + ',' + specialBlocks[k][1]] = k;
  });

  var palette = ['#b08d6a', '#8f9bb0', '#a76a5e', '#7d8f7a', '#9a8a68',
    '#6f7f96', '#b56e4a', '#8a6f8f', '#5f7f7a', '#a89a7a'];

  for (var bi = 0; bi < C.blocks; bi++) {
    for (var bj = 0; bj < C.blocks; bj++) {
      var br = VH.blockRect(bi, bj);
      var key = bi + ',' + bj;
      var kind = specialAt[key];
      if (kind === 'docks') {
        // The docks: open concrete with container stacks (solid crates).
        city.lots.push({ x: br.x, y: br.y, w: br.w, h: br.h, kind: 'docks' });
        for (var c = 0; c < 7; c++) {
          var cx = br.x + 24 + rng() * (br.w - 80);
          var cy = br.y + 24 + rng() * (br.h - 80);
          city.crates.push({ x: cx, y: cy, w: 34, h: 26, color: VH.pick(rng, ['#a8622f', '#3f6d8f', '#7a8a3a']) });
        }
        city.specials.docks = {
          x: br.x + br.w / 2, y: br.y + br.h / 2,
          door: { x: br.x + br.w / 2, y: br.y + br.h / 2 }, // the docks yard is open
          name: 'The Docks',
        };
        continue;
      }
      if (kind) {
        // A story building: one big block with a sign, plus its marker.
        // The door is the reachable point on the road in front of it —
        // missions point at the door, never at the building's centre.
        var hgt = 26 + rng() * 26;
        city.buildings.push({
          x: br.x + 18, y: br.y + 18, w: br.w - 36, h: br.h - 36,
          hgt: hgt, color: VH.pick(rng, palette), kind: kind,
        });
        city.specials[kind] = {
          x: br.x + br.w / 2, y: br.y + br.h / 2,
          door: { x: br.x + br.w / 2, y: br.y + br.h + C.road / 2 },
          name: VH.specialName(kind),
        };
        continue;
      }
      var roll = rng();
      if (roll < 0.12) {
        // Park: grass, trees, a few benches (crates as benches).
        var park = { x: br.x, y: br.y, w: br.w, h: br.h, trees: [] };
        for (var t = 0; t < 9; t++) {
          park.trees.push({
            x: br.x + 20 + rng() * (br.w - 40),
            y: br.y + 20 + rng() * (br.h - 40),
            r: 12 + rng() * 10,
          });
        }
        city.parks.push(park);
        continue;
      }
      if (roll < 0.22) {
        // Parking lot: open asphalt with rows of parked-car spots.
        city.lots.push({ x: br.x, y: br.y, w: br.w, h: br.h, kind: 'lot' });
        for (var s = 0; s < 6; s++) {
          var horizontal = rng() < 0.5;
          city.parkedSpots.push({
            x: br.x + 30 + rng() * (br.w - 60),
            y: br.y + 30 + rng() * (br.h - 60),
            angle: horizontal ? 0 : Math.PI / 2,
          });
        }
        continue;
      }
      // Normal block: one to four buildings with alleys between them.
      var layout = rng();
      var blocks = [];
      if (layout < 0.4) {
        blocks.push({ x: br.x + 16, y: br.y + 16, w: br.w - 32, h: br.h - 32 });
      } else if (layout < 0.75) {
        blocks.push({ x: br.x + 14, y: br.y + 14, w: br.w / 2 - 22, h: br.h - 28 });
        blocks.push({ x: br.x + br.w / 2 + 8, y: br.y + 14, w: br.w / 2 - 22, h: br.h - 28 });
      } else {
        var qw = br.w / 2, qh = br.h / 2;
        blocks.push({ x: br.x + 12, y: br.y + 12, w: qw - 20, h: qh - 20 });
        blocks.push({ x: br.x + qw + 8, y: br.y + 12, w: qw - 20, h: qh - 20 });
        blocks.push({ x: br.x + 12, y: br.y + qh + 8, w: qw - 20, h: qh - 20 });
        blocks.push({ x: br.x + qw + 8, y: br.y + qh + 8, w: qw - 20, h: qh - 20 });
      }
      blocks.forEach(function (b) {
        city.buildings.push({
          x: b.x, y: b.y, w: b.w, h: b.h,
          hgt: 14 + rng() * 46, color: VH.pick(rng, palette), kind: '',
        });
      });
      // A crate or two tucked against a block edge.
      if (rng() < 0.6) {
        city.crates.push({
          x: br.x + 8 + rng() * (br.w - 40), y: br.y + 8 + rng() * (br.h - 40),
          w: 22, h: 18, color: '#6e5136',
        });
      }
    }
  }

  // Street lamps along every road, alternating sides, plus hydrants.
  for (var i = 0; i <= C.blocks; i++) {
    var rc = VH.roadAt(i);
    for (var p = 0; p < C.world; p += 300) {
      city.lamps.push({ x: rc - C.road / 2 + 6, y: p + 40 });
      city.lamps.push({ x: p + 40, y: rc - C.road / 2 + 6 });
      if (rng() < 0.3) city.hydrants.push({ x: rc + C.road / 2 - 10, y: p + 120 });
    }
  }

  // Curb parking spots along the roads.
  for (var r2 = 0; r2 < 26; r2++) {
    var vertical = rng() < 0.5;
    var roadIdx = VH.randInt(rng, 0, C.blocks);
    var along = VH.rand(rng, 80, C.world - 80);
    city.parkedSpots.push({
      x: vertical ? VH.roadAt(roadIdx) + C.road / 2 - 14 : along,
      y: vertical ? along : VH.roadAt(roadIdx) + C.road / 2 - 14,
      angle: vertical ? Math.PI / 2 : 0,
    });
  }
  return city;
};

VH.specialName = function (kind) {
  return {
    hospital: 'Meridian General', garage: "Kwan's Garage", bar: "Eddie's Bar",
    chopshop: 'Chop Shop', hideout: 'Hideout', police: 'Harbor Precinct',
    docks: 'The Docks',
  }[kind] || kind;
};

// All solid rectangles (buildings + crates) for collision.
VH.citySolids = function (city) {
  return city.buildings.concat(city.crates);
};

// Is point (x, y) on a road (inside a road band)?
VH.isOnRoad = function (x, y) {
  var C = VH.CFG;
  for (var i = 0; i <= C.blocks; i++) {
    if (Math.abs(x - VH.roadAt(i)) < C.road / 2 + 2) return true;
    if (Math.abs(y - VH.roadAt(i)) < C.road / 2 + 2) return true;
  }
  return false;
};

// A random point on a road, at least `minD` away from (cx, cy) if given.
VH.randomRoadPoint = function (rng, city, cx, cy, minD) {
  var C = VH.CFG;
  for (var tries = 0; tries < 40; tries++) {
    var vertical = rng() < 0.5;
    var idx = VH.randInt(rng, 0, C.blocks);
    var along = VH.rand(rng, 60, C.world - 60);
    var x = vertical ? VH.roadAt(idx) : along;
    var y = vertical ? along : VH.roadAt(idx);
    if (cx === undefined || VH.dist(x, y, cx, cy) >= (minD || 0)) return { x: x, y: y };
  }
  return { x: VH.roadAt(4), y: VH.roadAt(4) };
};

// A random road intersection (roadAt x roadAt), at a distance band from a point.
VH.randomIntersection = function (rng, cx, cy, minD, maxD) {
  var C = VH.CFG;
  for (var tries = 0; tries < 60; tries++) {
    var i = VH.randInt(rng, 0, C.blocks);
    var j = VH.randInt(rng, 0, C.blocks);
    var x = VH.roadAt(i), y = VH.roadAt(j);
    var d = VH.dist(x, y, cx, cy);
    if (d >= minD && d <= maxD) return { x: x, y: y, i: i, j: j };
  }
  return { x: VH.roadAt(4), y: VH.roadAt(4), i: 4, j: 4 };
};

// A random point on a sidewalk ring around a block.
VH.randomSidewalkPoint = function (rng) {
  var C = VH.CFG;
  var bi = VH.randInt(rng, 0, C.blocks - 1);
  var bj = VH.randInt(rng, 0, C.blocks - 1);
  var br = VH.blockRect(bi, bj);
  var side = VH.randInt(rng, 0, 3);
  var m = C.sidewalk / 2 + 2;
  if (side === 0) return { x: br.x + rng() * br.w, y: br.y - m };
  if (side === 1) return { x: br.x + rng() * br.w, y: br.y + br.h + m };
  if (side === 2) return { x: br.x - m, y: br.y + rng() * br.h };
  return { x: br.x + br.w + m, y: br.y + rng() * br.h };
};

// ---- Drawing ----

VH.drawWorld = function (ctx, G) {
  var C = VH.CFG;
  var cam = G.cam;
  var x0 = cam.x - 40, y0 = cam.y - 40;
  var x1 = cam.x + C.viewW + 40, y1 = cam.y + C.viewH + 40;
  var inView = function (r) { return r.x + r.w > x0 && r.x < x1 && r.y + r.h > y0 && r.y < y1; };

  // Ground: city base.
  ctx.fillStyle = '#5d6b52';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // Roads: dark asphalt bands in both directions.
  ctx.fillStyle = '#33373d';
  for (var i = 0; i <= C.blocks; i++) {
    var rc = VH.roadAt(i);
    ctx.fillRect(x0, rc - C.road / 2, x1 - x0, C.road);
    ctx.fillRect(rc - C.road / 2, y0, C.road, y1 - y0);
  }
  // Centre dashes.
  ctx.fillStyle = '#c9b458';
  for (var d = 0; d <= C.blocks; d++) {
    var rcd = VH.roadAt(d);
    for (var p = 0; p < C.world; p += 48) {
      if (p % 96 < 48) {
        ctx.fillRect(p, rcd - 2, 22, 4);
        ctx.fillRect(rcd - 2, p, 4, 22);
      }
    }
  }
  // Sidewalks: light rings around every block.
  ctx.fillStyle = '#8d8f8a';
  for (var bi = 0; bi < C.blocks; bi++) {
    for (var bj = 0; bj < C.blocks; bj++) {
      var br = VH.blockRect(bi, bj);
      if (!inView(br)) continue;
      ctx.fillRect(br.x - C.sidewalk, br.y - C.sidewalk, br.w + C.sidewalk * 2, br.h + C.sidewalk * 2);
    }
  }
  // Parking lots and the docks yard.
  G.city.lots.forEach(function (lot) {
    if (!inView(lot)) return;
    ctx.fillStyle = lot.kind === 'docks' ? '#7a7468' : '#4a4d52';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    if (lot.kind === 'lot') {
      ctx.strokeStyle = '#c9c9c9';
      ctx.lineWidth = 2;
      for (var s = 0; s < 5; s++) {
        ctx.strokeRect(lot.x + 20 + s * 40, lot.y + 20, 30, 60);
      }
    }
  });
  // Parks: grass and trees.
  G.city.parks.forEach(function (park) {
    if (!inView(park)) return;
    ctx.fillStyle = '#4e7a3f';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    park.trees.forEach(function (t) {
      ctx.fillStyle = '#2f5a26';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a8a38';
      ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
    });
  });
  // Crates.
  G.city.crates.forEach(function (cr) {
    if (!inView(cr)) return;
    ctx.fillStyle = cr.color;
    ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cr.x + 1, cr.y + 1, cr.w - 2, cr.h - 2);
  });
  // Buildings: side shade for height, then the roof with a rim and windows.
  G.city.buildings.forEach(function (b) {
    if (!inView(b)) return;
    var lift = Math.min(26, b.hgt * 0.45);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + lift * 0.5, b.y + lift * 0.5, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    // Windows.
    ctx.fillStyle = 'rgba(20,30,50,0.55)';
    var cols = Math.max(1, Math.floor(b.w / 34));
    var rows = Math.max(1, Math.floor(b.h / 34));
    for (var wx = 0; wx < cols; wx++) {
      for (var wy = 0; wy < rows; wy++) {
        ctx.fillRect(b.x + 10 + wx * 34, b.y + 10 + wy * 34, 16, 12);
      }
    }
    // Story sign on special buildings.
    if (b.kind) {
      ctx.fillStyle = '#1d1d22';
      ctx.fillRect(b.x + b.w / 2 - 62, b.y + b.h / 2 - 14, 124, 28);
      ctx.fillStyle = '#ffd75e';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(VH.specialName(b.kind).toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 5);
      ctx.textAlign = 'left';
    }
  });
  // Street lamps and hydrants.
  var night = G.nightFactor || 0;
  G.city.lamps.forEach(function (l) {
    if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) return;
    if (night > 0.4) {
      ctx.fillStyle = 'rgba(255,220,120,' + (0.12 * night) + ')';
      ctx.beginPath(); ctx.arc(l.x, l.y, 26, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#2a2d33';
    ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
  });
  G.city.hydrants.forEach(function (h) {
    if (h.x < x0 || h.x > x1 || h.y < y0 || h.y > y1) return;
    ctx.fillStyle = '#b03a2e';
    ctx.fillRect(h.x - 4, h.y - 5, 8, 10);
  });
};

// Minimap: roads, blocks, mission marker, player, police, cars.
VH.drawMinimap = function (ctx, G, mx, my, size) {
  var C = VH.CFG;
  var s = size / C.world;
  ctx.save();
  ctx.fillStyle = 'rgba(12,14,18,0.85)';
  ctx.fillRect(mx - 4, my - 4, size + 8, size + 8);
  ctx.strokeStyle = '#c9c9c9';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx - 4, my - 4, size + 8, size + 8);
  // Roads.
  ctx.fillStyle = '#6a6f76';
  for (var i = 0; i <= C.blocks; i++) {
    var rc = VH.roadAt(i) * s;
    ctx.fillRect(mx, my + rc - 1.5, size, 3);
    ctx.fillRect(mx + rc - 1.5, my, 3, size);
  }
  // Parks.
  ctx.fillStyle = '#4e7a3f';
  G.city.parks.forEach(function (p) {
    ctx.fillRect(mx + p.x * s, my + p.y * s, p.w * s, p.h * s);
  });
  // Mission marker (pulsing).
  if (G.mission && G.mission.marker) {
    var pulse = 3 + Math.sin(G.time * 6) * 1.5;
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(mx + G.mission.marker.x * s, my + G.mission.marker.y * s, pulse + 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cars as grey dots, police as red, gang as orange.
  G.cars.forEach(function (car) {
    ctx.fillStyle = car.kind === 'police' ? '#ff3b30' : '#9aa0a8';
    ctx.fillRect(mx + car.x * s - 1.5, my + car.y * s - 1.5, 3, 3);
  });
  G.peds.forEach(function (p) {
    if (p.kind === 'gang') {
      ctx.fillStyle = '#ff8c1a';
      ctx.fillRect(mx + p.x * s - 1.5, my + p.y * s - 1.5, 3, 3);
    }
  });
  // Player arrow.
  var px = mx + G.player.x * s, py = my + G.player.y * s;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(G.player.angle) * 8, py + Math.sin(G.player.angle) * 8);
  ctx.stroke();
  ctx.restore();
};
