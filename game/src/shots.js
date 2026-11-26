// The screenshot scenes behind ?shot=start|play|end. Unlike the old Block Dodger shots these do not
// replay a whole game: a flight has no short fixed outcome, so each scene places the aircraft at a
// telling moment of a real approach and lets the renderer paint it. The same seed gives the same
// frame, and the live game itself starts from exactly the same approach state as ?shot=play.
import { AIRCRAFT, RUNWAY } from './config.js';
import { SCREEN_END, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function verticalSpeed(speedKnots, pitch) {
  return speedKnots * AIRCRAFT.knotsToMetres * Math.sin(pitch) * AIRCRAFT.metresToFeet * 60;
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the screen
 * to draw and the result object the end screen reports (null where nothing has ended).
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  const a = state.aircraft;

  if (name === 'play') {
    Object.assign(a, {
      x: state.runway.x - 7,
      altitude: RUNWAY.approachAltitude,
      z: state.runway.zStart - RUNWAY.approachDistance,
      heading: 0.03,
      pitch: -0.05,
      roll: -0.04,
      airspeed: 152,
      throttle: 0.42,
      verticalSpeed: verticalSpeed(152, -0.05),
      onGround: false,
      landed: false,
      crashed: false,
    });
    state.touchdown = null;
    world.refresh();
    return { screen: SCREEN_PLAY, result: null };
  }

  if (name === 'end') {
    Object.assign(a, {
      x: state.runway.x + 3,
      altitude: 0,
      z: state.runway.zStart + 70,
      heading: 0.015,
      pitch: 0,
      roll: 0,
      airspeed: 58,
      throttle: 0,
      verticalSpeed: 0,
      onGround: true,
      landed: true,
      crashed: false,
    });
    state.time = 41;
    state.touchdown = { speed: 138, vsi: -380, center: 3, time: 41 };
    world.refresh();
    return { screen: SCREEN_END, result: world.result() };
  }

  // start: the menu's banked cruise over open country.
  Object.assign(a, {
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
  state.touchdown = null;
  world.refresh();
  return { screen: SCREEN_TITLE, result: null };
}
