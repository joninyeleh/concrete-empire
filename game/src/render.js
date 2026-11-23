// Concrete Empire — canvas renderer: the city, its cars and people, the
// dusk-to-night lighting, HUD, minimap, and all the screens.
import { CITY, ROADS_X, ROADS_Y, ROAD_W, DISTRICTS } from './config.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inView(cam, x, y, m = 80) {
  return x > cam.x - m && x < cam.x + cam.w + m && y > cam.y - m && y < cam.y + cam.h + m;
}

export function drawGame(ctx, game, W, H) {
  const world = game.world;
  const night = game.night01();
  const shake = game.shake;
  const cam = {
    x: Math.max(0, Math.min(CITY.W - W, world.player.x - W / 2)),
    y: Math.max(0, Math.min(CITY.H - H, world.player.y - H / 2)),
    w: W, h: H,
  };
  if (CITY.W < W) cam.x = (CITY.W - W) / 2;
  if (CITY.H < H) cam.y = (CITY.H - H) / 2;
  if (shake > 0) {
    cam.x += (Math.random() - 0.5) * shake;
    cam.y += (Math.random() - 0.5) * shake;
  }
  game.cam = cam;

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(-cam.x, -cam.y);

  // --- Ground: district colors -------------------------------------------------
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
  }
  // Harbor water.
  for (const w of world.water) {
    ctx.fillStyle = '#1d5f8a';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      const wy = w.y + 30 + i * 60;
      ctx.moveTo(w.x + 20, wy);
      ctx.lineTo(w.x + w.w - 20, wy);
      ctx.stroke();
    }
  }
  // Park grass texture: a few darker patches.
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.ellipse(2400 + i * 90, 420 + (i % 3) * 130, 90, 46, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Roads ---------------------------------------------------------------------
  ctx.fillStyle = '#3a3a40';
  for (const rx of ROADS_X) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, CITY.H);
  for (const ry of ROADS_Y) ctx.fillRect(0, ry - ROAD_W / 2, CITY.W, ROAD_W);
  // Sidewalk edges.
  ctx.strokeStyle = '#565660';
  ctx.lineWidth = 4;
  for (const rx of ROADS_X) {
    ctx.beginPath(); ctx.moveTo(rx - ROAD_W / 2, 0); ctx.lineTo(rx - ROAD_W / 2, CITY.H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + ROAD_W / 2, 0); ctx.lineTo(rx + ROAD_W / 2, CITY.H); ctx.stroke();
  }
  for (const ry of ROADS_Y) {
    ctx.beginPath(); ctx.moveTo(0, ry - ROAD_W / 2); ctx.lineTo(CITY.W, ry - ROAD_W / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ry + ROAD_W / 2); ctx.lineTo(CITY.W, ry + ROAD_W / 2); ctx.stroke();
  }
  // Center dashes.
  ctx.fillStyle = '#c8a83a';
  for (const rx of ROADS_X) {
    for (let y = 20; y < CITY.H; y += 56) {
      if (inView(cam, rx, y)) ctx.fillRect(rx - 2, y, 4, 26);
    }
  }
  for (const ry of ROADS_Y) {
    for (let x = 20; x < CITY.W; x += 56) {
      if (inView(cam, x, ry)) ctx.fillRect(x, ry - 2, 26, 4);
    }
  }

  // --- Trees ----------------------------------------------------------------------
  for (const t of world.trees) {
    if (!inView(cam, t.x, t.y)) continue;
    ctx.fillStyle = '#2e6b2a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3c8a37';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }

  // --- Buildings ------------------------------------------------------------------
  for (const b of world.buildings) {
    if (!inView(cam, b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
    ctx.fillStyle = b.top;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    // Windows.
    ctx.fillStyle = night > 0.4 ? '#ffd76a' : 'rgba(255,255,255,0.28)';
    const cols = Math.max(1, Math.floor(b.w / 26));
    const rows = Math.max(1, Math.floor(b.h / 26));
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        if (((c * 7 + r * 13 + b.x) % 5) < 2) continue;
        ctx.fillRect(b.x + 8 + c * 26, b.y + 8 + r * 26, 12, 12);
      }
    }
    // Neon strip on downtown towers.
    if (b.neon) {
      ctx.fillStyle = b.neonColor;
      ctx.fillRect(b.x, b.y - 3, b.w, 5);
    }
  }

  // --- Street lamps ----------------------------------------------------------------
  for (const lamp of world.lamps) {
    if (!inView(cam, lamp.x, lamp.y)) continue;
    ctx.fillStyle = '#222';
    ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
  }

  // --- Skid marks ------------------------------------------------------------------
  for (const s of world.skids) {
    ctx.strokeStyle = `rgba(15,15,15,${Math.max(0, s.life * 0.5)})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(s.angle) * 14, s.y + Math.sin(s.angle) * 14);
    ctx.stroke();
  }

  drawPickups(ctx, game);
  drawMarker(ctx, game);
  drawCars(ctx, game);
  drawPeds(ctx, game);
  drawPlayer(ctx, game);
  drawParticles(ctx, game);

  // --- Roadblock barricade ----------------------------------------------------------
  if (world.roadblock) {
    const rb = world.roadblock;
    ctx.save();
    ctx.translate(rb.x, rb.y);
    ctx.rotate(rb.angle + Math.PI / 2);
    ctx.fillStyle = '#e67e22';
    ctx.fillRect(-70, -8, 140, 16);
    ctx.fillStyle = '#fff';
    for (let i = -60; i < 70; i += 24) ctx.fillRect(i, -8, 12, 16);
    ctx.restore();
  }

  // --- Night: darkness, then light --------------------------------------------------
  if (night > 0.02) {
    ctx.fillStyle = `rgba(8,10,38,${(0.52 * night).toFixed(3)})`;
    ctx.fillRect(cam.x - 10, cam.y - 10, cam.w + 20, cam.h + 20);
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, color, a) => {
      if (!inView(cam, x, y, r)) return;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, color.replace('A', String(a)));
      g.addColorStop(1, color.replace('A', '0'));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    for (const lamp of world.lamps) glow(lamp.x, lamp.y, 90, 'rgba(255,214,106,A)', 0.5 * night);
    for (const b of world.buildings) {
      if (b.neon) glow(b.x + b.w / 2, b.y, 130, 'rgba(255,45,120,A)', 0.35 * night);
    }
    // Headlight cones.
    for (const car of world.cars) {
      if (!inView(cam, car.x, car.y, 160)) continue;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const gx = car.x + fx * 70;
      const gy = car.y + fy * 70;
      const g2 = ctx.createRadialGradient(gx, gy, 4, gx, gy, 110);
      g2.addColorStop(0, `rgba(255,240,180,${0.4 * night})`);
      g2.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(gx, gy, 110, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();

  // --- HUD + screens (screen space) ---------------------------------------------------
  drawHUD(ctx, game, W, H);
  drawMinimap(ctx, game, W, H);
  if (game.screen === 'title') drawTitle(ctx, game, W, H);
  if (game.screen === 'pause') drawPause(ctx, W, H);
  if (game.screen === 'busted') drawEndCard(ctx, W, H, 'BUSTED', 'The VPD took 20% of your cash. Rosa will want to hear about this.');
  if (game.screen === 'wasted') drawEndCard(ctx, W, H, 'WASTED', "You woke up at St. Mary's Hospital. The city waits for no one.");
  drawDialogue(ctx, game, W, H);
  drawBanner(ctx, game, W, H);
}

function drawPickups(ctx, game) {
  const world = game.world;
  for (const p of world.pickups) {
    if (p.taken) continue;
    const bob = Math.sin((game.time * 2 + p.bob) * 1.4) * 3;
    const color = { cash: '#2ecc71', health: '#e74c3c', armor: '#3498db', bat: '#d35400' }[p.kind];
    const label = { cash: '$', health: '+', armor: 'A', bat: 'B' }[p.kind];
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(p.x, p.y + bob, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, p.y + bob + 1);
  }
}

function drawMarker(ctx, game) {
  const m = game.mission;
  if (!m || !m.target) return;
  const t = m.target;
  const pulse = 1 + Math.sin(game.time * 5) * 0.15;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#ffe600';
  ctx.fillRect(-9 * pulse, -9 * pulse, 18 * pulse, 18 * pulse);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(-9 * pulse, -9 * pulse, 18 * pulse, 18 * pulse);
  ctx.restore();
  // Vertical beam so the target is visible from afar.
  ctx.fillStyle = 'rgba(255,230,0,0.18)';
  ctx.fillRect(t.x - 4, t.y - 260, 8, 260);
  ctx.fillStyle = '#ffe600';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(t.label, t.x, t.y - 34);
}

function drawCars(ctx, game) {
  const world = game.world;
  for (const car of world.cars) {
    if (car.hp <= 0 && car.driver !== 'player') continue;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const len = car.kind === 'van' ? 54 : car.kind === 'bike' ? 34 : 46;
    const wid = car.kind === 'bike' ? 12 : 22;
    if (car.hp < 35) {
      ctx.fillStyle = 'rgba(40,40,40,0.7)';
      ctx.beginPath(); ctx.arc(-len / 2, 0, 12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-len / 2, -wid / 2, len, wid, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Windshield + roof.
    ctx.fillStyle = 'rgba(180,220,255,0.85)';
    ctx.fillRect(len / 6, -wid / 2 + 3, 10, wid - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-6, -wid / 2 + 3, 14, wid - 6);
    // Headlights.
    ctx.fillStyle = '#fff7ae';
    ctx.fillRect(len / 2 - 2, -wid / 2 + 2, 3, 4);
    ctx.fillRect(len / 2 - 2, wid / 2 - 6, 3, 4);
    if (car.driver === 'police' || car.driver === 'block') {
      const flash = Math.floor(game.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2d2d' : '#2d7dff';
      ctx.fillRect(-4, -wid / 2 - 3, 8, 5);
      ctx.fillStyle = flash ? '#2d7dff' : '#ff2d2d';
      ctx.fillRect(-4, wid / 2 - 2, 8, 5);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 3);
    }
    ctx.restore();
  }
}

function drawPeds(ctx, game) {
  const world = game.world;
  for (const ped of world.peds) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = '#888';
      ctx.beginPath(); ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.state === 'cop' ? '#1f3a5f' : ped.color;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath(); ctx.arc(4, 0, 6, 0, Math.PI * 2); ctx.fill();
    if (ped.state === 'cop') {
      ctx.fillStyle = '#12263f';
      ctx.fillRect(-2, -8, 10, 5);
    }
    if (ped.state === 'rival') {
      ctx.strokeStyle = '#c0392b';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawPlayer(ctx, game) {
  const p = game.world.player;
  if (p.inCar) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#27ae60';
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#145a32';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath(); ctx.arc(5, 0, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#27ae60';
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(4, -6); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill();
  if (p.hasBat) {
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(20, -14); ctx.stroke();
  }
  ctx.restore();
}

function drawParticles(ctx, game) {
  for (const pt of game.world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHUD(ctx, game, W, H) {
  if (game.screen === 'title') return;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // Cash + bars, top-left.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, 12, 220, 74);
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`$${game.cash.toLocaleString()}`, 22, 40);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(22, 50, 140 * Math.max(0, game.world.player.hp) / 100, 10);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(22, 50, 140, 10);
  ctx.fillStyle = '#3498db';
  ctx.fillRect(22, 66, 140 * Math.max(0, game.world.player.armor) / 100, 8);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(22, 66, 140, 8);
  // Wanted stars, top-right.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W - 190, 12, 178, 34);
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < game.wanted ? '#ffd700' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', W - 168 + i * 34, 38);
  }
  // Speed + radio, bottom-left.
  const p = game.world.player;
  const speed = p.inCar ? Math.round(Math.hypot(p.inCar.vx, p.inCar.vy) * 0.55) : 0;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(12, H - 62, 260, 50);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(p.inCar ? `${speed} mph` : 'On foot', 22, H - 34);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#ffd76a';
  ctx.fillText(game.radioStation ? `♪ ${game.radioStation}` : '♪ Radio off (R)', 22, H - 18);
  // Objective, bottom-center.
  if (game.mission) {
    const m = game.mission;
    const d = Math.round(Math.hypot(m.target.x - p.x, m.target.y - p.y));
    const timer = m.timed ? `  —  ${Math.max(0, Math.ceil(game.missionTimer))}s` : '';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const label = `${m.def.name}: ${m.objective}${timer}`;
    ctx.font = 'bold 16px sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillRect(W / 2 - tw / 2 - 14, H - 46, tw + 28, 32);
    ctx.fillStyle = '#ffe600';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, H - 23);
    // Waypoint arrow at the screen edge.
    const dx = m.target.x - p.x;
    const dy = m.target.y - p.y;
    const dd = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const ax = W / 2 + Math.cos(ang) * 130;
    const ay = H / 2 + Math.sin(ang) * 90;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffe600';
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${d}m`, ax, ay + 26);
  }
  // Context prompt.
  if (game.prompt) {
    ctx.font = 'bold 16px sans-serif';
    const tw = ctx.measureText(game.prompt).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W / 2 - tw / 2 - 12, H - 96, tw + 24, 30);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(game.prompt, W / 2, H - 75);
  }
  // Toasts (pickup / near-miss feedback).
  ctx.textAlign = 'center';
  game.toasts = game.toasts.filter((t) => t.life > 0);
  game.toasts.forEach((t, i) => {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(t.text, W / 2, 110 + i * 24);
  });
  ctx.globalAlpha = 1;
}

function drawMinimap(ctx, game, W, H) {
  if (game.screen === 'title') return;
  const mw = 200;
  const mh = 138;
  const mx = W - mw - 12;
  const my = 56;
  const sx = mw / CITY.W;
  const sy = mh / CITY.H;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  for (const d of DISTRICTS) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(mx + d.x0 * sx, my + d.y0 * sy, (d.x1 - d.x0) * sx, (d.y1 - d.y0) * sy);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (const rx of ROADS_X) {
    ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + mh); ctx.stroke();
  }
  for (const ry of ROADS_Y) {
    ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke();
  }
  const p = game.world.player;
  if (game.mission) {
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(mx + game.mission.target.x * sx, my + game.mission.target.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const u of game.world.police) {
    if (!u.car) continue;
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(mx + u.car.x * sx, my + u.car.y * sy, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2ecc71';
  ctx.beginPath();
  ctx.arc(mx + p.x * sx, my + p.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('VELMORA', mx, my + mh + 14);
}

function drawTitle(ctx, game, W, H) {
  ctx.fillStyle = 'rgba(8,8,18,0.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe600';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('CONCRETE', W / 2, H / 2 - 110);
  ctx.fillStyle = '#ff2d78';
  ctx.fillText('EMPIRE', W / 2, H / 2 - 44);
  ctx.fillStyle = '#fff';
  ctx.font = '17px sans-serif';
  ctx.fillText('Vic rolled into Velmora with $40 and a busted sedan. Rosa runs the streets —', W / 2, H / 2 + 2);
  ctx.fillText('and she has work for anyone hungry enough. Do her jobs. Build your empire.', W / 2, H / 2 + 26);
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#2ecc71';
  ctx.fillText('ENTER — New Game', W / 2, H / 2 + 78);
  if (game.saveExists) {
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('C — Continue', W / 2, H / 2 + 110);
  }
  ctx.fillStyle = '#bbb';
  ctx.font = '15px sans-serif';
  ctx.fillText('WASD drive / walk  •  E enter or steal a car  •  J punch  •  B garage  •  R radio  •  P pause  •  M mute', W / 2, H / 2 + 152);
  ctx.fillText('An original game. No network requests, no files to download — everything runs offline.', W / 2, H / 2 + 178);
}

function drawPause(ctx, W, H) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText('PAUSED', W / 2, H / 2);
  ctx.font = '16px sans-serif';
  ctx.fillText('Press P to keep playing', W / 2, H / 2 + 36);
}

function drawEndCard(ctx, W, H, big, sub) {
  ctx.fillStyle = 'rgba(20,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff3b30';
  ctx.font = 'bold 56px sans-serif';
  ctx.fillText(big, W / 2, H / 2 - 10);
  ctx.fillStyle = '#fff';
  ctx.font = '17px sans-serif';
  ctx.fillText(sub, W / 2, H / 2 + 28);
  ctx.fillText('Press ENTER to get back on the streets.', W / 2, H / 2 + 58);
}

function drawDialogue(ctx, game, W, H) {
  if (!game.dialogue) return;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  const bw = Math.min(760, W - 80);
  ctx.fillRect(W / 2 - bw / 2, H - 168, bw, 62);
  ctx.strokeStyle = '#ffe600';
  ctx.lineWidth = 2;
  ctx.strokeRect(W / 2 - bw / 2, H - 168, bw, 62);
  ctx.fillStyle = '#fff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  wrapText(ctx, game.dialogue.text, W / 2 - bw / 2 + 16, H - 144, bw - 32, 22);
  ctx.fillStyle = '#aaa';
  ctx.font = '12px sans-serif';
  ctx.fillText('ENTER to continue', W / 2 - bw / 2 + 16, H - 116);
}

function drawBanner(ctx, game, W, H) {
  if (!game.banner) return;
  ctx.globalAlpha = Math.min(1, game.banner.t * 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe600';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(game.banner.text, W / 2, 150);
  if (game.banner.sub) {
    ctx.fillStyle = '#fff';
    ctx.font = '19px sans-serif';
    ctx.fillText(game.banner.sub, W / 2, 182);
  }
  ctx.globalAlpha = 1;
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lh;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}
