/**
 * The encoder display.
 *
 * The knob is the only thing this plugin asks the host to draw, and the two commands it
 * uses need UlanziStudio 3.3.0+. Both details are load-bearing and neither was covered:
 * sending the layout switch on every repaint made a dial flash its state name for a frame,
 * and an unguarded call on an older host would take down the event handler that issued it,
 * which is the same handler that was about to move the camera.
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { forgetEncoderLayout, setEncoderAxis } from '../plugin/service/core/ui.js';

const KEYS = [
  'com.ulanzi.ulanzideck.pixy.encoder___4_1___dial1',
  'com.ulanzi.ulanzideck.pixy.encoder___4_2___dial2',
];
const [KEY, OTHER] = KEYS;

// Which keys have had their layout applied is module state, and there is no way to reset it
// wholesale short of forgetting each one. Left alone it leaks from one test into the next,
// which is exactly the kind of pass that turns into a false alarm later.
afterEach(() => {
  for (const context of KEYS) forgetEncoderLayout(context);
});

/** A host that records what it was told, and can refuse a command like an old one does. */
function fakeHost({ refuses = [] } = {}) {
  const calls = [];
  const refuse = (name) => {
    if (refuses.includes(name)) throw new Error(`${name} is not a known command`);
  };
  return {
    calls,
    setFeedbackLayout(context, layout) {
      calls.push({ cmd: 'setFeedbackLayout', context, layout });
      refuse('setFeedbackLayout');
    },
    setFeedback(context, payload) {
      calls.push({ cmd: 'setFeedback', context, payload });
      refuse('setFeedback');
    },
    /** The calls of one kind only. */
    of(cmd) {
      return calls.filter((call) => call.cmd === cmd);
    },
  };
}


test('the knob is told which axis it is on', () => {
  const host = fakeHost();
  setEncoderAxis(host, KEY, 'pan', 'images/gradient-arrow-horizontal.png');

  const feedback = host.of('setFeedback').at(-1);
  assert.deepEqual(feedback.payload, {
    icon: 'images/gradient-arrow-horizontal.png',
    title: 'PAN',
  });
});

test('the layout is applied once per key, not on every repaint', () => {
  // Switching the layout is what makes the host rebuild the key, and until the feedback
  // that follows arrives it has nothing to draw but the name of the state. That was the
  // flash: something else on the deck was touched, the dial was repainted, and the layout
  // switch started the cycle again.
  const host = fakeHost();

  setEncoderAxis(host, KEY, 'pan', 'a.png');
  setEncoderAxis(host, KEY, 'tilt', 'b.png');
  setEncoderAxis(host, KEY, 'zoom', 'c.png');

  assert.equal(host.of('setFeedbackLayout').length, 1, 'the layout went out once');
  assert.equal(host.of('setFeedback').length, 3, 'the content went out every time');
  assert.deepEqual(host.of('setFeedbackLayout')[0].layout, '$UA1');
});

test('each key gets its own layout', () => {
  const host = fakeHost();
  setEncoderAxis(host, KEY, 'pan', 'a.png');
  setEncoderAxis(host, OTHER, 'pan', 'a.png');
  forgetEncoderLayout(OTHER);

  assert.equal(host.of('setFeedbackLayout').length, 2, 'one per key, not one per plugin');
});

test('a key the host remounts gets its layout again', () => {
  // Otherwise "once per key" means once per context, and the layout never reaches a key
  // the host rebuilt from scratch. This is the call app.js makes on add and on clear.
  const host = fakeHost();

  setEncoderAxis(host, KEY, 'pan', 'a.png');
  setEncoderAxis(host, KEY, 'tilt', 'b.png');
  assert.equal(host.of('setFeedbackLayout').length, 1, 'not applied twice while the key is up');

  forgetEncoderLayout(KEY);
  setEncoderAxis(host, KEY, 'pan', 'a.png');

  assert.equal(host.of('setFeedbackLayout').length, 2, 'the layout went out again');
});

test('forgetting a key that was never drawn changes nothing', () => {
  assert.doesNotThrow(() => forgetEncoderLayout('never-seen'));
});

test('a host without the display commands does not break the deck', () => {
  // An unknown command throws inside the SDK. Unguarded, it would take down the handler
  // that issued it - which is also the handler that was about to move the camera, so a
  // knob on an old host would stop moving rather than merely stop showing an icon.
  const host = fakeHost({ refuses: ['setFeedbackLayout', 'setFeedback'] });

  assert.doesNotThrow(() => setEncoderAxis(host, KEY, 'pan', 'a.png'));
  assert.equal(host.of('setFeedback').length, 0, 'nothing was sent after the layout failed');
});

test('a host that accepts the layout but refuses the content still gets the layout once', () => {
  // The two failures are different. Once the layout is on the key, retrying it is what
  // caused the flash, so a host that only refuses setFeedback must not be sent it again.
  const host = fakeHost({ refuses: ['setFeedback'] });

  setEncoderAxis(host, KEY, 'pan', 'a.png');
  setEncoderAxis(host, KEY, 'tilt', 'b.png');

  assert.equal(host.of('setFeedbackLayout').length, 1);
  assert.equal(host.of('setFeedback').length, 2, 'both attempts were made');
});

test('a refused layout is retried, because it never reached the key', () => {
  // The mirror of the case above: nothing was applied, so the next readout has to try
  // again rather than assume the knob is ready for content it has never been given.
  const host = fakeHost({ refuses: ['setFeedbackLayout'] });

  setEncoderAxis(host, KEY, 'pan', 'a.png');
  setEncoderAxis(host, KEY, 'tilt', 'b.png');

  assert.equal(host.of('setFeedbackLayout').length, 2, 'retried, because it never landed');
});

test('a context with no axis still produces a title rather than throwing', () => {
  const host = fakeHost();
  assert.doesNotThrow(() => setEncoderAxis(host, KEY, undefined, 'a.png'));
});