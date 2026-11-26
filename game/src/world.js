// The flight model and its state, with no drawing and no browser in it: the aircraft's attitude,
// the throttle, the airspeed, the wind-like motion over the terrain and the moment the wheels (or
// the belly) meet the ground. step() advances one fixed step and returns what happened as bit flags,
// so the caller can react without the world knowing about screens or sound.
//
// Coordinates: X is east, Z is north (heading 0 flies toward +Z), Y is altitude in metres. The
// runway lies flat on the ground (Y = 0) and points north. All derived display values (feet, fpm)
// are computed here so the renderer stays a pure painter.
import { AIRCRAFT, RUNWAY } from './config.js';

export const EVENT_LANDED = 1;
export const EVENT_CRASH = 2;

const KNOTS_TO_MS = AIRCRAFT.knotsToMetres;
const MS_TO_FPM = AIRCRAFT.metresToFeet * 60;
const TWO_PI = Math.PI * 2;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

/** Wraps an angle to [-PI, PI], the shortest way round. */
function wrapAngle(angle) {
  let a = (angle + Math.PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
}

function fpmFrom(speedKnots, pitch) {
  return speedKnots * KNOTS_TO_MS * Math.sin(pitch) * MS_TO_FPM;
}

export function createWorld(random) {
  const runway = { x: RUNWAY.x, zStart: RUNWAY.zStart, zEnd: RUNWAY.zEnd, width: RUNWAY.width };
  const aircraft = {
    x: 0,
    altitude: AIRCRAFT.cruiseAltitude,
    z: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    airspeed: 200,
    throttle: 0.6,
    verticalSpeed: 0,
    onGround: false,
    landed: false,
    crashed: false,
  };
  const state = {
    aircraft,
    runway,
    time: 0,
    altitudeFeet: 0,
    distanceToThreshold: 0,
    alignment: 0,
    touchdown: null,
    seed: 0,
  };

  /** Refreshes the values the HUD reads, from the aircraft and the runway. */
  function refresh() {
    const a = aircraft;
    state.altitudeFeet = a.altitude * AIRCRAFT.metresToFeet;
    const lateral = a.x - runway.x;
    const along = Math.max(0, runway.zStart - a.z);
    state.distanceToThreshold = Math.hypot(lateral, along);
    state.alignment = wrapAngle(a.heading);
  }

  /** Puts the aircraft over open country, banked into a gentle cruise: the menu's backdrop. */
  function reset() {
    Object.assign(aircraft, {
      x: -40,
      altitude: AIRCRAFT.cruiseAltitude,
      z: 120,
      heading: 2.7,
      pitch: 0.03,
      roll: 0.28,
      airspeed: 218,
      throttle: 0.62,
      verticalSpeed: 0,
      onGround: false,
      landed: false,
      crashed: false,
    });
    state.time = 0;
    state.touchdown = null;
    refresh();
  }

  /** Puts the aircraft on final approach, lined up short of the runway. */
  function startFlight() {
    Object.assign(aircraft, {
      x: runway.x - 7,
      altitude: RUNWAY.approachAltitude,
      z: runway.zStart - RUNWAY.approachDistance,
      heading: 0.025,
      pitch: -0.05,
      roll: -0.03,
      airspeed: 152,
      throttle: 0.4,
      verticalSpeed: fpmFrom(152, -0.05),
      onGround: false,
      landed: false,
      crashed: false,
    });
    state.time = 0;
    state.touchdown = null;
    refresh();
  }

  /**
   * One fixed step. `controls` holds `pitch` and `roll` (-1..1, +1 = nose up / roll right) and
   * `throttle` (whether Space is held). With `options.demo` set the aircraft flies on unharmed and
   * never meets the ground, which is what the menu uses.
   */
  function step(dt, controls, options) {
    const demo = Boolean(options && options.demo);
    const a = aircraft;
    const pitchInput = clamp(controls.pitch || 0, -1, 1);
    const rollInput = clamp(controls.roll || 0, -1, 1);
    let events = 0;

    if (controls.throttle) a.throttle = clamp(a.throttle + AIRCRAFT.throttleRate * dt, 0, 1);
    else if (!demo) a.throttle = clamp(a.throttle - AIRCRAFT.throttleRate * 0.8 * dt, 0, 1);

    if (pitchInput !== 0) a.pitch += pitchInput * AIRCRAFT.pitchRate * dt;
    else a.pitch -= a.pitch * Math.min(1, AIRCRAFT.pitchReturn * dt);
    a.pitch = clamp(a.pitch, -AIRCRAFT.maxPitch, AIRCRAFT.maxPitch);

    if (rollInput !== 0) a.roll += rollInput * AIRCRAFT.rollRate * dt;
    else a.roll -= a.roll * Math.min(1, AIRCRAFT.rollReturn * dt);
    a.roll = clamp(a.roll, -AIRCRAFT.maxRoll, AIRCRAFT.maxRoll);

    const targetSpeed = AIRCRAFT.idleSpeed + a.throttle * (AIRCRAFT.maxSpeed - AIRCRAFT.idleSpeed);
    a.airspeed += (targetSpeed - a.airspeed) * Math.min(1, AIRCRAFT.speedResponse * dt);

    // A banked wing turns the nose; a faster aircraft carves a wider arc.
    const turnAuthority = clamp(a.airspeed / 160, 0.55, 1.4);
    a.heading = wrapAngle(a.heading + Math.sin(a.roll) * AIRCRAFT.turnRate * turnAuthority * dt);

    const speed = a.airspeed * KNOTS_TO_MS;
    const climb = speed * Math.sin(a.pitch);
    const forward = Math.max(0, speed * Math.cos(a.pitch));
    a.verticalSpeed = climb * MS_TO_FPM;

    if (!a.onGround) {
      a.x += Math.sin(a.heading) * forward * dt;
      a.z += Math.cos(a.heading) * forward * dt;
      a.altitude += climb * dt;
    }

    if (demo) {
      if (a.altitude < 180) a.altitude = 180;
    } else {
      state.time += dt;
      if (!a.onGround && a.altitude <= 0) {
        a.altitude = 0;
        a.onGround = true;
        const centerError = a.x - runway.x;
        const onRunway =
          Math.abs(centerError) <= runway.width / 2 + 3 && a.z >= runway.zStart - 5 && a.z <= runway.zEnd;
        const aligned = Math.abs(wrapAngle(a.heading)) <= 0.6;
        const gentle = a.verticalSpeed >= -1800;
        const slow = a.airspeed <= 260;
        state.touchdown = { speed: a.airspeed, vsi: a.verticalSpeed, center: centerError, time: state.time };
        if (onRunway && aligned && gentle && slow) {
          a.landed = true;
          a.crashed = false;
          events |= EVENT_LANDED;
        } else {
          a.crashed = true;
          a.landed = false;
          events |= EVENT_CRASH;
        }
      }
    }

    refresh();
    return events;
  }

  /** The finished flight, as the end screen reports it. */
  function result() {
    const a = aircraft;
    const t =
      state.touchdown || { speed: a.airspeed, vsi: a.verticalSpeed, center: a.x - runway.x, time: state.time };
    return {
      landed: a.landed,
      crashed: a.crashed,
      speed: Math.round(t.speed),
      vsi: Math.round(t.vsi),
      center: Math.round(t.center),
      time: t.time,
      seed: state.seed,
    };
  }

  state.seed = Math.floor(random() * 4294967296);
  reset();

  return { state, reset, startFlight, step, result, refresh };
}
