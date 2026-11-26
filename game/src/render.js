/**
 * Canvas drawing only: the world's state and the current screen in, pixels out.
 *
 * Paints the sky gradient, clouds, terrain grid and distant hills from a chase camera, the runway on
 * final approach, and the aircraft silhouette, then draws the HUD flight instruments (airspeed,
 * altitude, vertical speed, heading, throttle, runway cue) and the menu, pause and end panels.
 * The 1280x720 playfield is scaled to fit the window and centred over the backdrop colour.
 */
import { AIRCRAFT, CAMERA, FIELD, FONT, PALETTE, SUBTITLE, TERRAIN, TITLE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_END = 'end';

const TWO_PI = Math.PI * 2;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** Wraps an angle to [-PI, PI]. */
function wrapAngle(angle) {
  let a = (angle + Math.PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
}

/** Camera basis (right R, up U, forward F) from a yaw, pitch and roll, plus the camera's position. */
function buildCamera(aircraft) {
  const heading = aircraft.heading;
  const pitch = clamp(aircraft.pitch - CAMERA.lookDown, -1.45, 1.45);
  const roll = aircraft.roll * CAMERA.rollFactor;

  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // Forward and right before the roll.
  const fx = sh * cp;
  const fy = sp;
  const fz = ch * cp;
  const r0x = ch;
  const r0y = 0;
  const r0z = -sh;
  // Up = forward x right.
  const u0x = fy * r0z - fz * r0y;
  const u0y = fz * r0x - fx * r0z;
  const u0z = fx * r0y - fy * r0x;

  // Roll around the forward axis.
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const rx = r0x * cr + u0x * sr;
  const ry = r0y * cr + u0y * sr;
  const rz = r0z * cr + u0z * sr;
  const ux = u0x * cr - r0x * sr;
  const uy = u0y * cr - r0y * sr;
  const uz = u0z * cr - r0z * sr;

  const fhx = Math.sin(heading);
  const fhz = Math.cos(heading);

  return {
    fx,
    fy,
    fz,
    rx,
    ry,
    rz,
    ux,
    uy,
    uz,
    camX: aircraft.x - fhx * CAMERA.back,
    camY: aircraft.altitude + CAMERA.rise,
    camZ: aircraft.z - fhz * CAMERA.back,
    cx: FIELD.width / 2,
    cy: FIELD.height / 2,
    focal: CAMERA.focal,
    near: CAMERA.near,
    baseRoll: roll,
  };
}

/** A world point in camera space: x right, y up, z forward (depth). */
function toCamera(cam, wx, wy, wz) {
  const px = wx - cam.camX;
  const py = wy - cam.camY;
  const pz = wz - cam.camZ;
  return {
    x: px * cam.rx + py * cam.ry + pz * cam.rz,
    y: px * cam.ux + py * cam.uy + pz * cam.uz,
    z: px * cam.fx + py * cam.fy + pz * cam.fz,
  };
}

/** Where the world horizon crosses the screen at this x (the camera's world-up tilt). */
function horizonYAt(cam, screenX) {
  const x = (screenX - cam.cx) / cam.focal;
  if (Math.abs(cam.uy) < 1e-4) return cam.cy;
  const y = -(cam.fy + cam.ry * x) / cam.uy;
  return cam.cy - cam.focal * y;
}

/** The screen point of a camera-space point (depth must be positive). */
function screenOf(cam, p) {
  return { x: cam.cx + (cam.focal * p.x) / p.z, y: cam.cy - (cam.focal * p.y) / p.z };
}

/** Camera-space polygon clipped to z >= near (Sutherland-Hodgman on one plane). */
function clipNear(cam, points) {
  const near = cam.near;
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const cur = points[i];
    const prev = points[(i + n - 1) % n];
    const curIn = cur.z >= near;
    const prevIn = prev.z >= near;
    if (curIn) {
      if (!prevIn) {
        const t = (near - prev.z) / (cur.z - prev.z);
        out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t, z: near });
      }
      out.push(cur);
    } else if (prevIn) {
      const t = (near - prev.z) / (cur.z - prev.z);
      out.push({ x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t, z: near });
    }
  }
  return out;
}

function comma(value) {
  return value.toLocaleString('en-US');
}

function mmss(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function cardinal(degrees) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function setFont(size, weight) {
    const key = `${weight}|${size}`;
    let font = fonts.get(key);
    if (font === undefined) {
      font = `${weight} ${size}px ${FONT}`;
      fonts.set(key, font);
    }
    ctx.font = font;
  }

  function text(value, x, y, size, color, align, weight) {
    setFont(size, weight || '400');
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function measure(value, size, weight) {
    setFont(size, weight || '400');
    return ctx.measureText(value).width;
  }

  function roundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function panel(x, y, width, height) {
    roundRect(x, y, width, height, 12);
    ctx.fillStyle = PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function dim(fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  // ---------------------------------------------------------------- backdrop

  function drawSky() {
    const gradient = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.42, PALETTE.skyMid);
    gradient.addColorStop(0.72, PALETTE.skyLow);
    gradient.addColorStop(1, PALETTE.haze);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawCloudPuff(x, y, scale, alpha) {
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 64 * scale, 24 * scale, 0, 0, TWO_PI);
    ctx.ellipse(x + 46 * scale, y + 9 * scale, 44 * scale, 17 * scale, 0, 0, TWO_PI);
    ctx.ellipse(x - 48 * scale, y + 11 * scale, 40 * scale, 15 * scale, 0, 0, TWO_PI);
    ctx.fill();
  }

  function drawClouds(cam, aircraft) {
    const yL = horizonYAt(cam, -600);
    const yR = horizonYAt(cam, FIELD.width + 600);
    const angle = Math.atan2(yR - yL, FIELD.width + 1200);
    const baseY = horizonYAt(cam, cam.cx);
    const span = 2800;
    const shift = aircraft.heading * 760;
    ctx.save();
    ctx.translate(cam.cx, baseY);
    ctx.rotate(angle);
    for (let i = 0; i < 16; i += 1) {
      let x = (i * 211.7 - shift) % span;
      if (x < 0) x += span;
      x -= span / 2;
      const y = -120 - ((i * 61) % 170);
      const scale = 0.55 + ((i * 47) % 100) / 130;
      const alpha = 0.32 + ((i * 29) % 40) / 110;
      drawCloudPuff(x, y, scale, alpha);
    }
    ctx.restore();
  }

  function drawGround(cam) {
    const yL = horizonYAt(cam, -600);
    const yR = horizonYAt(cam, FIELD.width + 600);
    const gradient = ctx.createLinearGradient(0, Math.min(yL, yR), 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.groundFar);
    gradient.addColorStop(1, PALETTE.groundNear);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-600, yL);
    ctx.lineTo(FIELD.width + 600, yR);
    ctx.lineTo(FIELD.width + 600, FIELD.height + 600);
    ctx.lineTo(-600, FIELD.height + 600);
    ctx.closePath();
    ctx.fill();
  }

  /** Appends a world segment to the current path, clipped to the near plane. */
  function appendSegment(cam, ax, ay, az, bx, by, bz) {
    let ca = toCamera(cam, ax, ay, az);
    let cb = toCamera(cam, bx, by, bz);
    const near = cam.near;
    if (ca.z < near && cb.z < near) return;
    if (ca.z < near) {
      const t = (near - ca.z) / (cb.z - ca.z);
      ca = { x: ca.x + (cb.x - ca.x) * t, y: ca.y + (cb.y - ca.y) * t, z: near };
    } else if (cb.z < near) {
      const t = (near - cb.z) / (ca.z - cb.z);
      cb = { x: cb.x + (ca.x - cb.x) * t, y: cb.y + (ca.y - cb.y) * t, z: near };
    }
    const a = screenOf(cam, ca);
    const b = screenOf(cam, cb);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  function drawSegment(cam, ax, ay, az, bx, by, bz, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    appendSegment(cam, ax, ay, az, bx, by, bz);
    ctx.stroke();
  }

  function drawGrid(cam, aircraft) {
    const grid = TERRAIN.grid;
    const zStart = Math.floor((aircraft.z - TERRAIN.behind) / grid) * grid;
    const zEnd = Math.ceil((aircraft.z + TERRAIN.ahead) / grid) * grid;
    const xStart = Math.floor((aircraft.x - TERRAIN.side) / grid) * grid;
    const xEnd = Math.ceil((aircraft.x + TERRAIN.side) / grid) * grid;

    const minor = [];
    const major = [];
    for (let z = zStart; z <= zEnd; z += grid) {
      const line = [aircraft.x - TERRAIN.side, 0, z, aircraft.x + TERRAIN.side, 0, z];
      (Math.round(z / grid) % 5 === 0 ? major : minor).push(line);
    }
    for (let x = xStart; x <= xEnd; x += grid) {
      const line = [x, 0, aircraft.z - TERRAIN.behind, x, 0, aircraft.z + TERRAIN.ahead];
      (Math.round(x / grid) % 5 === 0 ? major : minor).push(line);
    }

    ctx.strokeStyle = PALETTE.gridMinor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < minor.length; i += 1) {
      const s = minor[i];
      appendSegment(cam, s[0], s[1], s[2], s[3], s[4], s[5]);
    }
    ctx.stroke();

    ctx.strokeStyle = PALETTE.gridMajor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < major.length; i += 1) {
      const s = major[i];
      appendSegment(cam, s[0], s[1], s[2], s[3], s[4], s[5]);
    }
    ctx.stroke();
  }

  function drawRange(shift, base, amplitude, frequency, color, alpha) {
    ctx.beginPath();
    ctx.moveTo(-2000, 9);
    for (let x = -2000; x <= 2000; x += 28) {
      const t = x + shift;
      const h =
        base +
        amplitude *
          (0.5 + 0.26 * Math.sin(t * frequency) + 0.16 * Math.sin(t * frequency * 2.3 + 1.7) + 0.08 * Math.sin(t * frequency * 5.1 + 3.4));
      ctx.lineTo(x, -Math.max(2, h));
    }
    ctx.lineTo(2000, 9);
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawMountains(cam, aircraft) {
    const yL = horizonYAt(cam, -600);
    const yR = horizonYAt(cam, FIELD.width + 600);
    const angle = Math.atan2(yR - yL, FIELD.width + 1200);
    const baseY = horizonYAt(cam, cam.cx);
    ctx.save();
    ctx.translate(cam.cx, baseY);
    ctx.rotate(angle);
    drawRange(aircraft.heading * 850, 20, 122, 0.0032, PALETTE.mountainFar, 0.92);
    drawRange(aircraft.heading * 1220 + 180, 10, 84, 0.0048, PALETTE.mountainNear, 0.96);
    ctx.restore();
  }

  function drawRunway(cam, runway) {
    const half = runway.width / 2;
    const x0 = runway.x - half;
    const x1 = runway.x + half;
    const z0 = runway.zStart;
    const z1 = runway.zEnd;

    // Approach lights, fading in toward the threshold.
    for (let z = z0 - 40; z > z0 - 340; z -= 40) {
      const t = 1 - (z0 - z) / 340;
      drawSegment(cam, runway.x, 0, z, runway.x, 0, z - 7, PALETTE.runwayApproach, 2 + t * 2.2);
    }

    // The runway deck.
    const poly = clipNear(cam, [
      toCamera(cam, x0, 0, z0),
      toCamera(cam, x1, 0, z0),
      toCamera(cam, x1, 0, z1),
      toCamera(cam, x0, 0, z1),
    ]);
    if (poly.length >= 3) {
      ctx.beginPath();
      for (let i = 0; i < poly.length; i += 1) {
        const p = screenOf(cam, poly[i]);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = PALETTE.runway;
      ctx.fill();
    }

    // Edges, centreline dashes, threshold bars and the touchdown zone.
    drawSegment(cam, x0, 0, z0, x0, 0, z1, PALETTE.runwayEdge, 2);
    drawSegment(cam, x1, 0, z0, x1, 0, z1, PALETTE.runwayEdge, 2);
    for (let z = z0 + 46; z < z1 - 40; z += 48) {
      drawSegment(cam, runway.x, 0, z, runway.x, 0, z + 26, PALETTE.runwayLine, 2.6);
    }
    for (let i = 0; i < 8; i += 1) {
      const bx = x0 + ((i + 0.5) * runway.width) / 8;
      drawSegment(cam, bx, 0, z0 + 6, bx, 0, z0 + 26, PALETTE.runwayLine, 2);
    }
    drawSegment(cam, x0 + runway.width * 0.22, 0, z0 + 150, x0 + runway.width * 0.35, 0, z0 + 150, PALETTE.runwayLine, 4);
    drawSegment(cam, x1 - runway.width * 0.35, 0, z0 + 150, x1 - runway.width * 0.22, 0, z0 + 150, PALETTE.runwayLine, 4);
  }

  function drawAircraft(aircraft, cam) {
    const screenRoll = aircraft.roll - cam.baseRoll;
    const px = FIELD.width / 2;
    const py = FIELD.height * CAMERA.planeY;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(screenRoll);
    ctx.scale(CAMERA.planeScale, CAMERA.planeScale);

    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 9;

    // Wings: swept trapezoids either side of the fuselage.
    ctx.fillStyle = PALETTE.body;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sign * 14, -18);
      ctx.lineTo(sign * 152, 42);
      ctx.lineTo(sign * 150, 62);
      ctx.lineTo(sign * 14, 40);
      ctx.closePath();
      ctx.fill();
    }

    // Horizontal stabilisers near the tail.
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sign * 12, 66);
      ctx.lineTo(sign * 66, 88);
      ctx.lineTo(sign * 62, 100);
      ctx.lineTo(sign * 10, 86);
      ctx.closePath();
      ctx.fill();
    }

    // Fuselage: a long teardrop, nose away from the camera.
    ctx.beginPath();
    ctx.moveTo(0, -118);
    ctx.bezierCurveTo(14, -96, 20, -46, 20, -4);
    ctx.lineTo(21, 58);
    ctx.bezierCurveTo(21, 82, 12, 98, 0, 104);
    ctx.bezierCurveTo(-12, 98, -21, 82, -21, 58);
    ctx.lineTo(-20, -4);
    ctx.bezierCurveTo(-20, -46, -14, -96, 0, -118);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Rim light so the dark silhouette reads against both sky and ground.
    ctx.strokeStyle = 'rgba(167, 205, 234, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -118);
    ctx.bezierCurveTo(14, -96, 20, -46, 20, -4);
    ctx.lineTo(21, 58);
    ctx.bezierCurveTo(21, 82, 12, 98, 0, 104);
    ctx.bezierCurveTo(-12, 98, -21, 82, -21, 58);
    ctx.lineTo(-20, -4);
    ctx.bezierCurveTo(-20, -46, -14, -96, 0, -118);
    ctx.stroke();

    // Vertical fin, seen from above as a narrow blade down the spine.
    ctx.fillStyle = 'rgba(120, 160, 196, 0.5)';
    ctx.beginPath();
    ctx.moveTo(0, 38);
    ctx.lineTo(7, 72);
    ctx.lineTo(0, 94);
    ctx.lineTo(-7, 72);
    ctx.closePath();
    ctx.fill();

    // Cockpit canopy.
    ctx.fillStyle = PALETTE.canopy;
    ctx.beginPath();
    ctx.ellipse(0, -54, 10, 25, 0, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 24, 38, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Tail exhaust glow.
    ctx.fillStyle = PALETTE.exhaust;
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(sign * 6, 99, 3.2, 0, TWO_PI);
      ctx.fill();
    }

    // Wing tip navigation lights: red to port, green to starboard.
    ctx.shadowBlur = 10;
    ctx.shadowColor = PALETTE.lightRed;
    ctx.fillStyle = PALETTE.lightRed;
    ctx.beginPath();
    ctx.arc(-150, 52, 3.6, 0, TWO_PI);
    ctx.fill();
    ctx.shadowColor = PALETTE.lightGreen;
    ctx.fillStyle = PALETTE.lightGreen;
    ctx.beginPath();
    ctx.arc(150, 52, 3.6, 0, TWO_PI);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD

  function drawHud(state) {
    const aircraft = state.aircraft;

    // Airspeed, top left.
    panel(24, 24, 200, 100);
    text('AIRSPEED', 40, 50, 14, PALETTE.muted, 'left', '600');
    const speedText = String(Math.round(aircraft.airspeed));
    text(speedText, 40, 100, 46, PALETTE.text, 'left', '600');
    text('kt', 40 + measure(speedText, 46, '600') + 8, 100, 16, PALETTE.muted, 'left', '600');
    const speedFraction = clamp((aircraft.airspeed - AIRCRAFT.idleSpeed) / (AIRCRAFT.maxSpeed - AIRCRAFT.idleSpeed), 0, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(40, 112, 168, 6);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(40, 112, 168 * speedFraction, 6);

    // Altitude, top right.
    const rx = FIELD.width - 24 - 210;
    panel(rx, 24, 210, 100);
    text('ALTITUDE', rx + 18, 50, 14, PALETTE.muted, 'left', '600');
    const altitudeText = comma(Math.round(state.altitudeFeet));
    text(altitudeText, rx + 18, 100, 42, PALETTE.text, 'left', '600');
    text('ft', rx + 18 + measure(altitudeText, 42, '600') + 8, 100, 16, PALETTE.muted, 'left', '600');

    // Vertical speed, right under the altimeter.
    panel(rx, 136, 210, 78);
    text('VERT SPEED', rx + 18, 162, 13, PALETTE.muted, 'left', '600');
    const vsi = Math.round(aircraft.verticalSpeed / 10) * 10;
    const vsiText = `${vsi >= 0 ? '+' : ''}${comma(vsi)}`;
    const vsiColor = vsi < -1000 ? PALETTE.warn : PALETTE.text;
    text(vsiText, rx + 18, 202, 30, vsiColor, 'left', '600');
    text('fpm', rx + 18 + measure(vsiText, 30, '600') + 8, 202, 15, PALETTE.muted, 'left', '600');

    // Heading, top centre.
    const hw = 264;
    const hx = (FIELD.width - hw) / 2;
    panel(hx, 24, hw, 100);
    text('HEADING', hx + hw / 2, 50, 13, PALETTE.muted, 'center', '600');
    const degrees = (aircraft.heading * 180) / Math.PI;
    const normalized = ((degrees % 360) + 360) % 360;
    const display = String(Math.round(normalized) % 360).padStart(3, '0');
    text(`${display}°`, hx + hw / 2 - 20, 98, 36, PALETTE.text, 'center', '600');
    text(cardinal(normalized), hx + hw / 2 + 62, 96, 22, PALETTE.accent, 'center', '700');

    // Throttle, bottom left.
    const throttleY = FIELD.height - 24 - 80;
    panel(24, throttleY, 230, 80);
    text('THROTTLE', 40, throttleY + 26, 13, PALETTE.muted, 'left', '600');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(40, throttleY + 40, 150, 12);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(40, throttleY + 40, 150 * clamp(aircraft.throttle, 0, 1), 12);
    text(`${Math.round(aircraft.throttle * 100)}%`, 198, throttleY + 52, 18, PALETTE.text, 'right', '600');

    // Runway, bottom right.
    const rw = 256;
    const rpx = FIELD.width - 24 - rw;
    panel(rpx, throttleY, rw, 80);
    text('RUNWAY', rpx + 18, throttleY + 26, 13, PALETTE.muted, 'left', '600');
    const nm = state.distanceToThreshold / 1852;
    text(`${nm.toFixed(2)} nm`, rpx + 18, throttleY + 54, 22, PALETTE.text, 'left', '600');
    const alignDegrees = (state.alignment * 180) / Math.PI;
    const linedUp = Math.abs(alignDegrees) < 8;
    const cue = linedUp ? 'LINED UP' : alignDegrees > 0 ? 'TURN LEFT' : 'TURN RIGHT';
    text(cue, rpx + rw - 18, throttleY + 54, 14, linedUp ? PALETTE.good : PALETTE.warn, 'right', '600');

    // Flight path marker.
    const mx = FIELD.width / 2;
    const my = FIELD.height / 2 - 34;
    ctx.strokeStyle = 'rgba(180, 235, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx, my, 7, 0, TWO_PI);
    ctx.moveTo(mx - 24, my);
    ctx.lineTo(mx - 10, my);
    ctx.moveTo(mx + 10, my);
    ctx.lineTo(mx + 24, my);
    ctx.moveTo(mx, my - 17);
    ctx.lineTo(mx, my - 9);
    ctx.stroke();

    // Control hint.
    text(
      'W / S  pitch      A / D  roll      hold SPACE  throttle',
      FIELD.width / 2,
      FIELD.height - 26,
      14,
      'rgba(200, 220, 235, 0.7)',
      'center',
      '500',
    );
  }

  function drawVignette() {
    const gradient = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 200, FIELD.width / 2, FIELD.height / 2, 780);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.34)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  // ---------------------------------------------------------------- screens

  function drawTitle() {
    dim('rgba(5, 10, 20, 0.4)');
    const width = 780;
    const height = 336;
    const x = (FIELD.width - width) / 2;
    const y = 64;
    roundRect(x, y, width, height, 18);
    ctx.fillStyle = PALETTE.panelStrong;
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();

    text(TITLE, FIELD.width / 2, y + 92, 74, PALETTE.text, 'center', '700');
    text(SUBTITLE, FIELD.width / 2, y + 130, 15, PALETTE.accent, 'center', '600');

    ctx.strokeStyle = 'rgba(130, 195, 255, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 120, y + 154);
    ctx.lineTo(x + width - 120, y + 154);
    ctx.stroke();

    text('Pitch  W / S  or  ↑ / ↓          Roll  A / D  or  ← / →', FIELD.width / 2, y + 194, 19, PALETTE.muted, 'center', '500');
    text('Hold SPACE to throttle up; release to ease off.', FIELD.width / 2, y + 226, 19, PALETTE.muted, 'center', '500');
    text('Line up with the runway and touch down gently.', FIELD.width / 2, y + 258, 19, PALETTE.muted, 'center', '500');

    text('Press SPACE or click to fly', FIELD.width / 2, y + height - 30, 24, PALETTE.accent, 'center', '600');
  }

  function drawPaused() {
    dim('rgba(5, 10, 20, 0.45)');
    const width = 460;
    const height = 190;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    roundRect(x, y, width, height, 16);
    ctx.fillStyle = PALETTE.panelStrong;
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    text('PAUSED', FIELD.width / 2, y + 82, 48, PALETTE.text, 'center', '700');
    text('Press P to resume', FIELD.width / 2, y + 132, 22, PALETTE.accent, 'center', '500');
  }

  function drawEnd(result) {
    const r = result || { landed: false, crashed: true, speed: 0, vsi: 0, center: 0, time: 0 };
    const landed = Boolean(r.landed);
    const accent = landed ? PALETTE.good : PALETTE.bad;
    dim('rgba(5, 10, 20, 0.5)');
    const width = 640;
    const height = 372;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    roundRect(x, y, width, height, 18);
    ctx.fillStyle = PALETTE.panelStrong;
    ctx.fill();
    ctx.strokeStyle = landed ? 'rgba(109, 255, 176, 0.5)' : 'rgba(255, 107, 107, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    text(landed ? 'TOUCHDOWN' : 'CRASHED', FIELD.width / 2, y + 96, 56, accent, 'center', '700');
    text(
      landed ? 'A smooth landing on the runway.' : 'The flight ended on the ground.',
      FIELD.width / 2,
      y + 138,
      20,
      PALETTE.muted,
      'center',
      '500',
    );

    const rows = [
      ['Touchdown speed', `${r.speed} kt`],
      ['Descent rate', `${r.vsi >= 0 ? '+' : ''}${r.vsi} fpm`],
      ['Centerline', `${Math.abs(r.center)} m`],
      ['Flight time', mmss(r.time)],
    ];
    for (let i = 0; i < rows.length; i += 1) {
      const rowY = y + 196 + i * 34;
      text(rows[i][0], x + 70, rowY, 19, PALETTE.muted, 'left', '500');
      text(rows[i][1], x + width - 70, rowY, 20, PALETTE.text, 'right', '600');
    }

    text('Press SPACE or click to fly again', FIELD.width / 2, y + height - 32, 23, PALETTE.accent, 'center', '600');
  }

  // ---------------------------------------------------------------- frame

  /** Paint one frame: the world from the chase camera, then the HUD or a panel for the screen. */
  function draw(state, screen, result) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, FIELD.width, FIELD.height);
    ctx.clip();

    const aircraft = state.aircraft;
    const cam = buildCamera(aircraft);

    drawSky();
    drawClouds(cam, aircraft);
    drawGround(cam);
    drawGrid(cam, aircraft);
    drawMountains(cam, aircraft);
    drawRunway(cam, state.runway);
    drawAircraft(aircraft, cam);
    drawVignette();

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state);
    if (screen === SCREEN_TITLE) drawTitle();
    else if (screen === SCREEN_END) drawEnd(result);
    else if (screen === SCREEN_PAUSED) drawPaused();

    ctx.restore();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
