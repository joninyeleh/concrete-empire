// Drawing only: the world state and the current screen in, pixels out. The camera
// follows the player across the city; the view is 1280x720 scaled to the window.
// Dusk mood: lit windows, neon signs on downtown towers, headlight cones, a violet
// wash and a vignette. No assets — every pixel is drawn from the state.

import {
  BLOCK, CAR, COLORS, GRID, PLACES, ROAD, VIEW, WORLD_H, WORLD_W,
  blockAt, districtAt, placeCenter, roadLine,
} from './config.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_DONE = 'done';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MAP = { w: 224, h: 168, margin: 16 };

function hash2(x, y) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let vignette = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.w, height / VIEW.h);
    view.x = (width - VIEW.w * view.scale) / 2;
    view.y = (height - VIEW.h * view.scale) / 2;
    vignette = context.createRadialGradient(
      VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.42, VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.95,
    );
    vignette.addColorStop(0, 'rgba(8,10,18,0)');
    vignette.addColorStop(1, 'rgba(8,10,18,0.42)');
  }

  const fonts = new Map();
  function font(size, bold) {
    const key = `${bold ? 'b' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }
  function text(value, x, y, size, color, align, bold) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }
  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  // ---- City ----------------------------------------------------------------

  function drawGround(game) {
    const cam = game.camera;
    const x0 = Math.max(0, cam.x - 40);
    const y0 = Math.max(0, cam.y - 40);
    const x1 = Math.min(WORLD_W, cam.x + VIEW.w + 40);
    const y1 = Math.min(WORLD_H, cam.y + VIEW.h + 40);
    context.fillStyle = COLORS.ground;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);

    // Block interiors: parks and plazas read as green and stone; the rest is sidewalk.
    for (const block of game.world.city.blocks) {
      if (block.x + BLOCK < x0 || block.x > x1 || block.y + BLOCK < y0 || block.y > y1) continue;
      if (block.district === 'park') {
        context.fillStyle = COLORS.parkGrass;
        context.fillRect(block.x, block.y, BLOCK, BLOCK);
      } else if (block.district === 'plaza') {
        context.fillStyle = COLORS.plazaStone;
        context.fillRect(block.x, block.y, BLOCK, BLOCK);
      } else {
        context.fillStyle = COLORS.sidewalk;
        context.fillRect(block.x, block.y, BLOCK, BLOCK);
      }
      // Trees.
      for (const tree of block.trees) {
        context.fillStyle = COLORS.tree;
        context.beginPath();
        context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = COLORS.treeTop;
        context.beginPath();
        context.arc(tree.x - 3, tree.y - 3, tree.r * 0.6, 0, Math.PI * 2);
        context.fill();
      }
      // Plaza fountain.
      if (block.district === 'plaza') {
        context.fillStyle = '#5d8fb0';
        context.beginPath();
        context.arc(block.x + BLOCK / 2, block.y + BLOCK / 2, 26, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#8fc4dd';
        context.beginPath();
        context.arc(block.x + BLOCK / 2, block.y + BLOCK / 2, 16, 0, Math.PI * 2);
        context.fill();
      }
    }

    // Roads: asphalt, centre dashes, crosswalks at every intersection.
    context.fillStyle = COLORS.road;
    for (let i = 0; i <= 6; i += 1) {
      const v = roadLine(i);
      if (v > x0 - ROAD && v < x1 + ROAD) context.fillRect(v - ROAD / 2, y0, ROAD, y1 - y0);
      const h = roadLine(i);
      if (h > y0 - ROAD && h < y1 + ROAD) context.fillRect(x0, h - ROAD / 2, x1 - x0, ROAD);
    }
    context.fillStyle = COLORS.roadLine;
    for (let i = 0; i <= 6; i += 1) {
      const v = roadLine(i);
      if (v > x0 && v < x1) {
        for (let y = y0; y < y1; y += 44) context.fillRect(v - 2, y, 4, 24);
      }
      const h = roadLine(i);
      if (h > y0 && h < y1) {
        for (let x = x0; x < x1; x += 44) context.fillRect(x, h - 2, 24, 4);
      }
    }
    context.fillStyle = COLORS.crosswalk;
    for (let i = 0; i <= 6; i += 1) {
      for (let j = 0; j <= 6; j += 1) {
        const cx = roadLine(i);
        const cy = roadLine(j);
        if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
        for (let k = -3; k <= 3; k += 1) {
          context.fillRect(cx - ROAD / 2 + 6, cy + k * 12 - 3, 14, 6);
          context.fillRect(cx + ROAD / 2 - 20, cy + k * 12 - 3, 14, 6);
        }
      }
    }
  }

  function drawBuildings(game) {
    const cam = game.camera;
    const x0 = cam.x - 60;
    const y0 = cam.y - 60;
    const x1 = cam.x + VIEW.w + 60;
    const y1 = cam.y + VIEW.h + 60;
    for (const b of game.world.city.buildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      // Shadow, then the body, then a darker roofline.
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.fillRect(b.x + 4, b.y + 4, b.w - 8, 10);
      // Lit windows: deterministic per building, so the city never flickers.
      const step = 26;
      for (let wy = b.y + 18; wy < b.y + b.h - 12; wy += step) {
        for (let wx = b.x + 12; wx < b.x + b.w - 12; wx += step) {
          if (hash2(wx, wy) < 0.42) {
            context.fillStyle = COLORS.windowLit;
            context.fillRect(wx, wy, 7, 9);
          }
        }
      }
      // Downtown towers carry a neon sign on their south face.
      const block = blockAt(b.x + b.w / 2, b.y + b.h / 2);
      if (block && districtAt(block.col, block.row) === 'downtown' && hash2(b.x, b.y) < 0.55) {
        const neon = COLORS.neon[Math.floor(hash2(b.y, b.x) * COLORS.neon.length)];
        const sx = b.x + b.w / 2 - 4;
        const sy = b.y + b.h - 6;
        context.fillStyle = neon;
        context.globalAlpha = 0.16;
        context.fillRect(sx - 6, sy - 4, 20, 14);
        context.globalAlpha = 0.45;
        context.fillRect(sx - 2, sy - 2, 12, 10);
        context.globalAlpha = 1;
        context.fillRect(sx, sy, 8, 6);
      }
    }
    // Streetlights at intersections: a small pole and a pool of light.
    context.fillStyle = 'rgba(255,214,120,0.07)';
    for (let i = 0; i <= 6; i += 1) {
      for (let j = 0; j <= 6; j += 1) {
        const cx = roadLine(i);
        const cy = roadLine(j);
        if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
        context.beginPath();
        context.arc(cx + ROAD / 2 - 4, cy - ROAD / 2 + 4, 44, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  // ---- Entities --------------------------------------------------------------

  function drawSkids(game) {
    context.strokeStyle = 'rgba(12,12,14,0.5)';
    context.lineWidth = 4;
    context.lineCap = 'round';
    for (const s of game.world.skids) {
      context.globalAlpha = Math.min(1, s.life / 6) * 0.7;
      context.beginPath();
      context.moveTo(s.x1, s.y1);
      context.lineTo(s.x2, s.y2);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function drawPickups(game) {
    for (const p of game.world.pickups) {
      const bob = Math.sin(game.time * 3 + p.x) * 2;
      const y = p.y + bob;
      if (p.kind === 'cash') {
        context.fillStyle = '#2f9e44';
        context.beginPath();
        context.arc(p.x, y, 11, 0, Math.PI * 2);
        context.fill();
        text('$', p.x, y + 5, 14, '#ffffff', 'center', true);
      } else if (p.kind === 'health') {
        context.fillStyle = '#ffffff';
        context.fillRect(p.x - 10, y - 10, 20, 20);
        context.fillStyle = '#d43a2e';
        context.fillRect(p.x - 3, y - 8, 6, 16);
        context.fillRect(p.x - 8, y - 3, 16, 6);
      } else if (p.kind === 'armor') {
        context.fillStyle = '#2e6bff';
        context.beginPath();
        context.arc(p.x, y, 11, 0, Math.PI * 2);
        context.fill();
        text('A', p.x, y + 5, 13, '#ffffff', 'center', true);
      } else {
        // Bat: a wooden club.
        context.strokeStyle = '#a8763e';
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(p.x - 8, y + 8);
        context.lineTo(p.x + 8, y - 8);
        context.stroke();
        context.fillStyle = '#ffd23e';
        context.beginPath();
        context.arc(p.x, y, 13, 0, Math.PI * 2);
        context.stroke();
      }
    }
  }

  function drawMarker(game) {
    const m = game.mission;
    if (!m || !m.target) return;
    const pulse = 1 + Math.sin(game.time * 4) * 0.15;
    const { x, y } = m.target;
    // A soft glow and a rotating dashed ring, so the marker reads at any pulse phase.
    context.save();
    context.globalAlpha = 0.22 + 0.08 * Math.sin(game.time * 4);
    context.fillStyle = COLORS.marker;
    context.beginPath();
    context.arc(x, y, 42, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.save();
    context.globalAlpha = 0.9;
    context.strokeStyle = COLORS.marker;
    context.lineWidth = 2;
    context.setLineDash([8, 10]);
    context.lineDashOffset = -game.time * 40;
    context.beginPath();
    context.arc(x, y, 34, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.fillStyle = COLORS.marker;
    context.fillRect(-11 * pulse, -11 * pulse, 22 * pulse, 22 * pulse);
    context.strokeStyle = COLORS.markerRing;
    context.lineWidth = 2;
    context.strokeRect(-11 * pulse, -11 * pulse, 22 * pulse, 22 * pulse);
    context.restore();
    // A beam so the marker reads from across the block.
    context.fillStyle = 'rgba(255,210,62,0.10)';
    context.fillRect(x - 3, y - 130, 6, 130);
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Headlight cone: dusk driving reads better with one.
    context.fillStyle = 'rgba(255,220,130,0.07)';
    context.beginPath();
    context.moveTo(CAR.length / 2, -8);
    context.lineTo(CAR.length / 2 + 95, -26);
    context.lineTo(CAR.length / 2 + 95, 26);
    context.lineTo(CAR.length / 2, 8);
    context.closePath();
    context.fill();
    // Body, roof, windshield, rear window.
    context.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(-CAR.length / 2 + 3, -CAR.width / 2 + 3, CAR.length, CAR.width, 7);
    context.fill();
    context.fillStyle = car.hp <= 0 ? '#3a3a3a' : car.color;
    roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
    context.fill();
    context.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(-6, -CAR.width / 2 + 3, 14, CAR.width - 6, 4);
    context.fill();
    context.fillStyle = '#bcd6e8';
    context.fillRect(CAR.length / 2 - 13, -CAR.width / 2 + 4, 5, CAR.width - 8);
    context.fillRect(-CAR.length / 2 + 5, -CAR.width / 2 + 4, 4, CAR.width - 8);
    // Headlights and tail lights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(CAR.length / 2 - 2, -CAR.width / 2 + 2, 3, 4);
    context.fillRect(CAR.length / 2 - 2, CAR.width / 2 - 6, 3, 4);
    context.fillStyle = '#ff3b30';
    context.fillRect(-CAR.length / 2 - 1, -CAR.width / 2 + 2, 3, 4);
    context.fillRect(-CAR.length / 2 - 1, CAR.width / 2 - 6, 3, 4);
    if (car.kind === 'police') {
      const phase = Math.floor(time * 6 + car.flash) % 2 === 0;
      context.fillStyle = phase ? COLORS.policeLightA : COLORS.policeLightB;
      context.fillRect(-4, -CAR.width / 2 + 2, 8, 5);
      context.fillStyle = phase ? COLORS.policeLightB : COLORS.policeLightA;
      context.fillRect(-4, CAR.width / 2 - 7, 8, 5);
    }
    if (car.kind === 'taxi') {
      context.fillStyle = '#20242c';
      context.fillRect(-8, -CAR.width / 2 - 2, 10, 4);
    }
    context.restore();
  }

  function drawPed(ped, time) {
    if (ped.state === 'down') {
      context.save();
      context.translate(ped.x, ped.y);
      context.rotate(ped.angle + Math.PI / 2);
      context.fillStyle = ped.color;
      context.beginPath();
      context.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    const bob = Math.sin(time * 9 + ped.x) * 1.5;
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(ped.x, ped.y + 9, 9, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(ped.x, ped.y + bob * 0.3, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8c39a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4 + bob * 0.3, 5, 0, Math.PI * 2);
    context.fill();
    if (ped.kind === 'cop') {
      context.fillStyle = '#dfe6f2';
      context.beginPath();
      context.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4 - 3, 5, Math.PI, 0);
      context.fill();
    } else if (ped.kind === 'rival') {
      context.strokeStyle = '#ff2e2e';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 5, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawPlayer(game) {
    const player = game.world.player;
    if (player.inCar) return;
    const blink = player.hurtTimer > 0 && Math.floor(game.time * 12) % 2 === 0;
    if (blink) return;
    context.fillStyle = 'rgba(0,0,0,0.35)';
    context.beginPath();
    context.ellipse(player.x, player.y + 10, 10, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = COLORS.player;
    context.strokeStyle = COLORS.playerOutline;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(player.x, player.y, 13, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#1c1a14';
    context.beginPath();
    context.arc(player.x + Math.cos(player.angle) * 6, player.y + Math.sin(player.angle) * 6, 5, 0, Math.PI * 2);
    context.fill();
    // Punch swipe.
    if (player.punchAnim > 0) {
      context.strokeStyle = 'rgba(255,255,255,0.85)';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(player.x, player.y, 26, player.angle - 0.9, player.angle + 0.9);
      context.stroke();
    }
    if (game.batTimer > 0) {
      context.strokeStyle = '#a8763e';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(player.x + 8, player.y - 8);
      context.lineTo(player.x + 18, player.y - 18);
      context.stroke();
    }
  }

  function drawParticles(game) {
    for (const p of game.world.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  // ---- HUD -----------------------------------------------------------------

  function drawStars(game) {
    const x = 20;
    const y = 30;
    for (let i = 0; i < 5; i += 1) {
      const lit = i < game.wanted;
      const flash = lit && game.wanted >= 3 && Math.floor(game.time * 4) % 2 === 0;
      text('★', x + i * 26, y, 26, lit ? (flash ? '#ff5a3c' : '#ffd23e') : 'rgba(255,255,255,0.25)', 'left', true);
    }
    text(game.wanted === 0 ? 'CLEAN' : `WANTED ${game.wanted}`, x + 138, y, 15, game.wanted === 0 ? '#9fe8a8' : '#ff8a7a', 'left', true);
  }

  function drawBars(game) {
    // Health.
    context.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(20, 44, 170, 16, 4);
    context.fill();
    context.fillStyle = game.world.player.hp > 30 ? '#57c84d' : '#e5484d';
    roundRect(22, 46, 166 * clamp(game.world.player.hp / 100, 0, 1), 12, 3);
    context.fill();
    text(`HP ${Math.max(0, Math.ceil(game.world.player.hp))}`, 196, 57, 13, '#ffffff', 'left', true);
    // Armor, when worn.
    if (game.armor > 0) {
      context.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(20, 64, 170, 10, 4);
      context.fill();
      context.fillStyle = '#4f8ef7';
      roundRect(22, 66, 166 * clamp(game.armor / 60, 0, 1), 6, 3);
      context.fill();
      text('ARMOR', 196, 73, 12, '#9db8f5', 'left', true);
    }
    // Cash.
    text(`$${game.cash.toLocaleString('en-US')}`, 20, 96, 26, '#7be495', 'left', true);
    if (game.batTimer > 0) {
      text(`BAT ${Math.ceil(game.batTimer)}s`, 20, 120, 15, '#e8c98a', 'left', true);
    }
  }

  function drawMinimap(game) {
    const mx = VIEW.w - MAP.w - MAP.margin;
    const my = MAP.margin;
    const sx = MAP.w / WORLD_W;
    const sy = MAP.h / WORLD_H;
    context.fillStyle = 'rgba(10,12,18,0.82)';
    roundRect(mx - 6, my - 6, MAP.w + 12, MAP.h + 12, 8);
    context.fill();
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 1;
    context.stroke();
    // Roads.
    context.strokeStyle = '#5a6068';
    context.lineWidth = 3;
    for (let i = 0; i <= 6; i += 1) {
      const v = roadLine(i) * sx + mx;
      context.beginPath();
      context.moveTo(v, my);
      context.lineTo(v, my + MAP.h);
      context.stroke();
      const h = roadLine(i) * sy + my;
      context.beginPath();
      context.moveTo(mx, h);
      context.lineTo(mx + MAP.w, h);
      context.stroke();
    }
    // Blocks, tinted by district.
    for (const block of game.world.city.blocks) {
      context.fillStyle = block.district === 'park' ? '#2f5d33' : block.district === 'downtown' ? '#39445a' : '#33302c';
      context.fillRect(mx + block.x * sx, my + block.y * sy, BLOCK * sx, BLOCK * sy);
    }
    // Cars, police, mission marker, player.
    for (const car of game.world.cars) {
      context.fillStyle = car.driver === 'cop' ? '#ff3b30' : 'rgba(255,255,255,0.75)';
      context.fillRect(mx + car.x * sx - 1.5, my + car.y * sy - 1.5, 3, 3);
    }
    if (game.mission && game.mission.target) {
      const pulse = 4 + Math.sin(game.time * 5) * 1.5;
      context.fillStyle = COLORS.marker;
      context.save();
      context.translate(mx + game.mission.target.x * sx, my + game.mission.target.y * sy);
      context.rotate(Math.PI / 4);
      context.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      context.restore();
    }
    const player = game.world.player;
    const px = player.inCar ? player.inCar.x : player.x;
    const py = player.inCar ? player.inCar.y : player.y;
    context.fillStyle = COLORS.player;
    context.beginPath();
    context.arc(mx + px * sx, my + py * sy, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.stroke();
    text(CITY_LABEL, mx + MAP.w, my + MAP.h + 20, 12, 'rgba(255,255,255,0.6)', 'right', true);
  }

  const CITY_LABEL = 'VELMORA';

  function drawObjective(game) {
    if (!game.mission) return;
    const y = VIEW.h - 66;
    context.fillStyle = 'rgba(10,12,18,0.72)';
    const label = game.missionTimer > 0 ? `${game.mission.objective}  —  ${Math.ceil(game.missionTimer)}s` : game.mission.objective;
    const w = context.measureText(label).width;
    context.font = font(16, true);
    const tw = context.measureText(label).width;
    roundRect(VIEW.w / 2 - tw / 2 - 18, y - 24, tw + 36, 34, 8);
    context.fill();
    text(label, VIEW.w / 2, y, 16, game.missionTimer > 0 && game.missionTimer < 10 ? '#ff8a7a' : '#ffffff', 'center', true);
    text(game.mission.title.toUpperCase(), VIEW.w / 2, y - 32, 12, COLORS.marker, 'center', true);
  }

  function drawSpeed(game) {
    const player = game.world.player;
    if (!player.inCar) return;
    const speed = Math.round(Math.sqrt(player.inCar.vx ** 2 + player.inCar.vy ** 2) * 0.12);
    text(`${speed}`, VIEW.w - 30, VIEW.h - 30, 40, '#ffffff', 'right', true);
    text('mph', VIEW.w - 30, VIEW.h - 8, 13, 'rgba(255,255,255,0.6)', 'right', true);
    // Car condition.
    context.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(VIEW.w - 190, VIEW.h - 66, 160, 10, 4);
    context.fill();
    context.fillStyle = player.inCar.hp > 40 ? '#57c84d' : '#e5484d';
    roundRect(VIEW.w - 188, VIEW.h - 64, 156 * clamp(player.inCar.hp / 100, 0, 1), 6, 3);
    context.fill();
    text('CAR', VIEW.w - 196, VIEW.h - 56, 11, 'rgba(255,255,255,0.7)', 'right', true);
  }

  function drawPopups(game) {
    let y = 150;
    for (const p of game.popups) {
      const age = game.time - p.at;
      if (age > 2.2) continue;
      context.globalAlpha = age < 1.6 ? 1 : 1 - (age - 1.6) / 0.6;
      text(p.text, VIEW.w / 2, y - age * 26, 20, p.color, 'center', true);
      y += 0;
    }
    context.globalAlpha = 1;
  }

  function drawPrompt(game) {
    if (!game.prompt) return;
    text(game.prompt, VIEW.w / 2, VIEW.h - 108, 17, '#ffe9a8', 'center', true);
  }

  function wrapText(value, maxWidth, size) {
    context.font = font(size, false);
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawDialogue(game) {
    const d = game.dialogue;
    if (!d) return;
    const w = 760;
    const x = (VIEW.w - w) / 2;
    const lines = wrapText(d.text, w - 48, 18);
    const h = 64 + lines.length * 24;
    const y = VIEW.h - h - 140;
    context.fillStyle = 'rgba(12,14,22,0.92)';
    roundRect(x, y, w, h, 10);
    context.fill();
    context.strokeStyle = COLORS.marker;
    context.lineWidth = 2;
    context.stroke();
    text(d.speaker, x + 24, y + 30, 16, COLORS.marker, 'left', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], x + 24, y + 58 + i * 24, 18, '#f2f0e8', 'left', false);
    }
    text('Enter — continue', x + w - 24, y + h - 14, 12, 'rgba(255,255,255,0.5)', 'right', false);
  }

  function drawWaypointArrow(game) {
    const m = game.mission;
    if (!m || !m.target) return;
    const player = game.world.player;
    const px = player.inCar ? player.inCar.x : player.x;
    const py = player.inCar ? player.inCar.y : player.y;
    const dx = m.target.x - px;
    const dy = m.target.y - py;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 320) return; // the marker itself is on screen
    const angle = Math.atan2(dy, dx);
    const cx = VIEW.w / 2 + Math.cos(angle) * 150;
    const cy = VIEW.h / 2 + Math.sin(angle) * 110;
    context.save();
    context.translate(cx, cy);
    context.rotate(angle);
    context.fillStyle = COLORS.marker;
    context.beginPath();
    context.moveTo(18, 0);
    context.lineTo(-10, -12);
    context.lineTo(-4, 0);
    context.lineTo(-10, 12);
    context.closePath();
    context.fill();
    context.restore();
    text(`${Math.round(d / 40)}m`, cx, cy + 30, 13, COLORS.marker, 'center', true);
  }

  // ---- Screens ---------------------------------------------------------------

  function drawTitle(game) {
    // The city keeps living behind the menu.
    const grad = context.createLinearGradient(0, 0, 0, VIEW.h);
    grad.addColorStop(0, 'rgba(10,12,20,0.25)');
    grad.addColorStop(0.55, 'rgba(10,12,20,0.55)');
    grad.addColorStop(1, 'rgba(10,12,20,0.88)');
    context.fillStyle = grad;
    context.fillRect(0, 0, VIEW.w, VIEW.h);
    // Neon logo.
    context.save();
    context.shadowColor = '#ff2ea6';
    context.shadowBlur = 34;
    text('CONCRETE', VIEW.w / 2, 218, 92, '#ffe600', 'center', true);
    context.restore();
    context.save();
    context.shadowColor = '#00e5ff';
    context.shadowBlur = 34;
    text('EMPIRE', VIEW.w / 2, 308, 92, '#00e5ff', 'center', true);
    context.restore();
    text('V E L M O R A  —  A  C I T Y  T H A T  O W E S  Y O U  M O N E Y', VIEW.w / 2, 348, 17, '#ff9ecf', 'center', true);
    const story = game.story || [];
    for (let i = 0; i < story.length; i += 1) {
      text(story[i], VIEW.w / 2, 402 + i * 26, 18, '#e8e4d8', 'center', false);
    }
    const y = 520;
    text('ENTER — New Game', VIEW.w / 2, y, 22, '#ffffff', 'center', true);
    if (game.saveExists) text('C — Continue your empire', VIEW.w / 2, y + 36, 22, '#7be495', 'center', true);
    text('WASD move · Shift sprint · E enter / steal car · J punch · P pause · M mute', VIEW.w / 2, y + 84, 15, 'rgba(255,255,255,0.55)', 'center', false);
    text('5 jobs · Wanted 0–5 stars · Progress saves on this machine', VIEW.w / 2, y + 110, 15, 'rgba(255,255,255,0.55)', 'center', false);
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 560;
    const h = 150 + lines.length * 30;
    const x = (VIEW.w - w) / 2;
    const y = (VIEW.h - h) / 2;
    context.fillStyle = 'rgba(12,14,22,0.92)';
    roundRect(x, y, w, h, 12);
    context.fill();
    context.strokeStyle = accent || COLORS.marker;
    context.lineWidth = 2;
    context.stroke();
    text(title, VIEW.w / 2, y + 62, 44, accent || COLORS.marker, 'center', true);
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.w / 2, y + 104 + i * 30, 18, '#e8e4d8', 'center', false);
    }
    text(prompt, VIEW.w / 2, y + h - 26, 16, 'rgba(255,255,255,0.6)', 'center', false);
  }

  /** Paint one frame for the whole game object. */
  function draw(game) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#14161f';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;
    const shakeY = game.shake > 0 ? (Math.random() - 0.5) * game.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x - game.camera.x * view.scale + shakeX * view.scale, view.y - game.camera.y * view.scale + shakeY * view.scale);
    drawGround(game);
    drawBuildings(game);
    drawSkids(game);
    drawPickups(game);
    drawMarker(game);
    for (const car of game.world.cars) drawCar(car, game.time);
    for (const ped of game.world.peds) drawPed(ped, game.time);
    drawPlayer(game);
    drawParticles(game);
    // Dusk wash over the world, then the vignette in screen space.
    context.fillStyle = COLORS.duskSky;
    context.globalAlpha = 0.16;
    context.fillRect(game.camera.x - 20, game.camera.y - 20, VIEW.w + 40, VIEW.h + 40);
    context.globalAlpha = 1;
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.fillStyle = vignette;
    context.fillRect(0, 0, VIEW.w, VIEW.h);

    if (game.screen === SCREEN_TITLE) {
      drawTitle(game);
      return;
    }
    drawStars(game);
    drawBars(game);
    drawMinimap(game);
    drawObjective(game);
    drawSpeed(game);
    drawWaypointArrow(game);
    drawPopups(game);
    drawPrompt(game);
    drawDialogue(game);
    if (game.screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(8,10,16,0.55)';
      context.fillRect(0, 0, VIEW.w, VIEW.h);
      drawPanel('PAUSED', ['The city waits for no one. Except now.'], 'P — resume', '#ffffff');
    } else if (game.screen === SCREEN_BUSTED) {
      context.fillStyle = 'rgba(8,10,16,0.6)';
      context.fillRect(0, 0, VIEW.w, VIEW.h);
      drawPanel('BUSTED!', [`The Velmora PD took $${game.bustedLoss} off you.`, 'Rosa is already arranging bail.'], 'Enter — back on the streets', '#ff5a3c');
    } else if (game.screen === SCREEN_WASTED) {
      context.fillStyle = 'rgba(8,10,16,0.6)';
      context.fillRect(0, 0, VIEW.w, VIEW.h);
      drawPanel('WASTED', [`The ambulance took $${game.bustedLoss}.`, 'Rosa says the next job pays double. It does not.'], 'Enter — back on the streets', '#ff5a3c');
    } else if (game.screen === SCREEN_DONE) {
      context.fillStyle = 'rgba(8,10,16,0.6)';
      context.fillRect(0, 0, VIEW.w, VIEW.h);
      drawPanel('EMPIRE BOSS', [`All five jobs done. Velmora is yours, ${game.cash.toLocaleString('en-US')} richer.`, 'Rosa pours two drinks. One of them is yours.'], 'Enter — keep running the city (free roam)', COLORS.marker);
    }
    if (game.showControls) {
      text('WASD move · Shift sprint · E enter / steal car · J punch · Space handbrake · P pause · M mute', 20, VIEW.h - 16, 14, 'rgba(255,255,255,0.5)', 'left', false);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
