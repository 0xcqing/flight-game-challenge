// Every tuning number and colour for SKYLINE in one place. The playfield is a fixed 1280x720
// logical area; the renderer scales it to the window, so no rule below depends on the screen size.
// The world is measured in metres; speeds are kept in knots and altitudes shown in feet.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const AIRCRAFT = {
  /** Altitude, in metres, the menu's cruising aircraft starts at. */
  cruiseAltitude: 340,
  /** The furthest the nose can swing up or down, and how fast it gets there. */
  maxPitch: 0.52,
  pitchRate: 0.8,
  /** With the stick released the nose eases back toward level, slowly, so an attitude holds. */
  pitchReturn: 0.9,
  /** The furthest the wings can bank, and how fast they roll. */
  maxRoll: 1.05,
  rollRate: 1.9,
  rollReturn: 1.6,
  /** How sharply a banked aircraft turns its nose, in radians per second at full bank. */
  turnRate: 0.95,
  /** How fast the throttle spools up while Space is held and down when it is released. */
  throttleRate: 0.72,
  /** Airspeed, in knots, at idle and at full throttle. */
  idleSpeed: 118,
  maxSpeed: 342,
  /** How quickly airspeed chases its throttle target. */
  speedResponse: 0.9,
  knotsToMetres: 0.514444,
  metresToFeet: 3.28084,
};

/** The runway is fixed in the world; the aircraft approaches it from the south, flying north (+Z). */
export const RUNWAY = {
  x: 0,
  zStart: 2000,
  zEnd: 3200,
  width: 34,
  /** Where a fresh flight begins: this high above the ground, this far before the threshold. */
  approachAltitude: 135,
  approachDistance: 560,
};

/** The chase camera: behind and above the aircraft, looking slightly down and partly into its roll. */
export const CAMERA = {
  focal: 720,
  near: 1.2,
  back: 18,
  rise: 7,
  lookDown: 0.12,
  rollFactor: 0.25,
  /** Where the aircraft silhouette sits on screen, as a fraction of the field height. */
  planeY: 0.745,
  planeScale: 1.12,
};

/** The ground grid drawn under the aircraft, in metres. */
export const TERRAIN = {
  grid: 100,
  behind: 2600,
  ahead: 2600,
  side: 2200,
};

export const PALETTE = {
  backdrop: '#0a1422',
  skyTop: '#123a63',
  skyMid: '#2f6c9e',
  skyLow: '#9cc3dc',
  haze: '#d8e8f1',
  mountainFar: '#8198b4',
  mountainNear: '#48697b',
  groundNear: '#38624a',
  groundFar: '#79957a',
  gridMinor: 'rgba(190, 224, 198, 0.16)',
  gridMajor: 'rgba(214, 242, 220, 0.34)',
  runway: '#31353d',
  runwayLine: 'rgba(240, 246, 252, 0.94)',
  runwayEdge: 'rgba(246, 249, 253, 0.88)',
  runwayApproach: 'rgba(255, 206, 120, 0.95)',
  body: '#1b2430',
  bodyEdge: '#a7cdea',
  canopy: '#6fd0ff',
  lightRed: '#ff5a5a',
  lightGreen: '#4dff88',
  exhaust: '#ffb85a',
  panel: 'rgba(9, 16, 27, 0.62)',
  panelStrong: 'rgba(7, 13, 24, 0.86)',
  panelEdge: 'rgba(130, 195, 255, 0.34)',
  text: '#eaf3ff',
  muted: '#9fb6cc',
  accent: '#5fd0ff',
  good: '#6dffb0',
  warn: '#ffcf5a',
  bad: '#ff6b6b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const TITLE = 'SKYLINE';
export const SUBTITLE = 'A  F L I G H T  C H A L L E N G E';
