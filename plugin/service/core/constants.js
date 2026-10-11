export const PLUGIN_UUID = 'com.ulanzi.ulanzideck.pixy';

/**
 * The three axes the PIXY head can be driven on.
 *
 * Kept as an array as well as an object because the cycling encoder walks the axes in
 * order, and walking an object would put the order at the mercy of key insertion.
 */
export const AXIS = Object.freeze({
  PAN: 'pan',
  TILT: 'tilt',
  ZOOM: 'zoom',
});

export const AXES = Object.freeze([AXIS.PAN, AXIS.TILT, AXIS.ZOOM]);

/**
 * Which way each axis counts in the driver's units.
 *
 * The three axes are not consistent with each other. A positive tilt moves the head up and
 * a positive zoom moves it in, but a positive pan moves the head to its **left**. Every
 * place that drives an axis multiplies by this, so a key that moves right and its encoder
 * rotated right move the same way - which is not something that can be relied on by
 * accident, and is asserted by the test that pairs each button with its encoder.
 *
 * Measured on the camera on 2026-10-11: pan was reversed against both the buttons and the
 * encoders, tilt and zoom were correct. See PROJECT_CONTEXT.md section 49.
 */
export const AXIS_POLARITY = Object.freeze({
  [AXIS.PAN]: -1,
  [AXIS.TILT]: 1,
  [AXIS.ZOOM]: 1,
});

export const ACTION = Object.freeze({
  PAN_LEFT: `${PLUGIN_UUID}.panleft`,
  PAN_RIGHT: `${PLUGIN_UUID}.panright`,
  TILT_UP: `${PLUGIN_UUID}.tiltup`,
  TILT_DOWN: `${PLUGIN_UUID}.tiltdown`,
  ZOOM_IN: `${PLUGIN_UUID}.zoomin`,
  ZOOM_OUT: `${PLUGIN_UUID}.zoomout`,
  CENTER: `${PLUGIN_UUID}.center`,
  ENCODER: `${PLUGIN_UUID}.encoder`,
  PAN_ENCODER: `${PLUGIN_UUID}.panencoder`,
  TILT_ENCODER: `${PLUGIN_UUID}.tiltencoder`,
  ZOOM_ENCODER: `${PLUGIN_UUID}.zoomencoder`,
  START: `${PLUGIN_UUID}.start`,
  PRESET_1: `${PLUGIN_UUID}.preset1`,
  PRESET_2: `${PLUGIN_UUID}.preset2`,
  PRESET_3: `${PLUGIN_UUID}.preset3`,
  PRESET_4: `${PLUGIN_UUID}.preset4`,
  PRESET_5: `${PLUGIN_UUID}.preset5`,
  MODE_STANDARD: `${PLUGIN_UUID}.modestandard`,
  MODE_TRACKING: `${PLUGIN_UUID}.modetracking`,
  MODE_PRIVACY: `${PLUGIN_UUID}.modeprivacy`,
});

/**
 * Encoder icons, one per axis.
 *
 * The deck shows the axis on the knob itself, so the icon is what tells the user which
 * of the three a rotation is about to move: the title is the same word repeated on the
 * key, and on a bare D200X there is no other place that tells pan from tilt.
 */
export const ENCODER_ICONS = Object.freeze({
  [AXIS.PAN]: 'images/gradient-arrow-horizontal.png',
  [AXIS.TILT]: 'images/gradient-arrow-vertical.png',
  [AXIS.ZOOM]: 'images/gradient-arrow-enlarge.png',
});

/**
 * Default movement step, per axis, in UVC units.
 *
 * Zoom needs a smaller step than pan for the same physical amount of movement: the PIXY
 * zoom range is narrow, so a step that looks reasonable on pan walks straight past the
 * useful part of it. The controller clamps every value to the hardware range, so these
 * are the request sizes, not the sizes the head ends up moving.
 *
 * Measured on the camera, see PROJECT_CONTEXT.md section 43: Pan 10 -> 20, Tilt -9 -> 36
 * at 45, Zoom 150 -> 145. Zoom tops out at 150, which is why its step is half as large.
 */
export const DEFAULT_MOVE_STEP = 10;
export const DEFAULT_ZOOM_STEP = 5;

export const DEFAULT_STEP_SIZE = 1;

/**
 * Largest step a setting may ask for.
 *
 * Deliberately not the list the property inspector offers. A step of 45 has been driven on
 * the real camera and works, and a value typed or restored from an older profile is not
 * the user's mistake to correct: refusing it silently, in favour of a step of 1, is how a
 * key that used to cover the desk in three presses ends up needing two hundred.
 */
export const MAX_STEP_SIZE = 100;

/**
 * How long a position key must be held before it stores instead of recalling.
 *
 * Bounded because both ends of the range are wrong in a way the user cannot see: too
 * short and a normal press saves over the position it was meant to recall, too long and
 * the store feels broken. The bounds are what the property inspector offers.
 */
export const LONG_PRESS_MS = Object.freeze({ MIN: 300, MAX: 2000, DEFAULT: 500 });

export const CAMERA_MODES = Object.freeze(['standard', 'tracking', 'privacy']);

export const PRESET_COUNT = 5;

/**
 * Encoder rotations arrive in bursts - one event per notch, several notches per flick -
 * and each one used to become its own command to the camera. Coalescing over a short
 * window turns a flick into one movement of the summed delta, which is what keeps the
 * head from stuttering through the intermediate positions.
 */
export const ENCODER_FLUSH_MS = 80;

/**
 * How long the bridge waits for a camera answer before giving up on it.
 *
 * The controller talks to the camera over DirectShow, and a driver that stops answering
 * produces silence, not an error. Without a deadline the first such request never settles,
 * the in-flight slot never frees, and every later command on the deck is silently dropped
 * for the rest of the session: the deck looks alive and does nothing.
 */
export const BRIDGE_TIMEOUT_MS = 4000;

/** How long the bridge is given to close on its own after a quit before it is killed. */
export const BRIDGE_QUIT_GRACE_MS = 500;