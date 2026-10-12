/**
 * The property inspector panel, loaded and driven the way the host drives it.
 *
 * `shared.js` is a classic script running in a WebView, which is why it had no coverage:
 * it cannot be imported, and it needs `$UD`, `Utils` and a document. All three are cheap
 * to fake, so it is run here in a VM context and driven through the same frames the host
 * sends.
 *
 * It earns that, because two of the three bugs this project has shipped were in this file
 * and neither showed up as a failure anywhere: the panels were write-only, so every
 * setting read as "reverted" when the panel was opened again, and a whole-form save
 * quietly wrote the markup's defaults over whatever the host was holding.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.join(HERE, '..', 'plugin', 'property-inspector', 'shared.js');

/** One named control, with the value it currently holds. */
function field(name, value) {
  return { name, value, defaultValue: value };
}

/** The smallest DOM that shared.js touches. */
function fakeDom(fields) {
  const form = {
    classList: { remove() {} },
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
  };
  const wrapper = { classList: { remove() {} } };
  const body = { appendChild() {} };

  return {
    readyState: 'complete',
    body,
    querySelector(selector) {
      if (selector === '#property-inspector') return form;
      if (selector === '.uspi-wrapper') return wrapper;
      return null;
    },
    getElementById: () => null,
    createElement: () => ({ style: {} }),
    addEventListener() {},
    fields,
    form,
    /** Delivers an event to the panel, as a user interaction would. */
    fire(type) {
      form.listeners[type]({ preventDefault() {} });
    },
  };
}

/** The two SDK objects shared.js uses. */
function fakeUd() {
  const sent = [];
  const handlers = {};
  return {
    sent,
    requested: 0,
    connect(uuid) {
      sent.push(['connect', uuid]);
    },
    getSettings() {
      this.requested += 1;
      sent.push(['getSettings']);
    },
    setSettings(settings) {
      sent.push(['setSettings', { ...settings }]);
    },
    onConnected(fn) { handlers.connected = fn; },
    onDidReceiveSettings(fn) { handlers.settings = fn; },
    onParamFromApp(fn) { handlers.param = fn; },
    /** The host announces the socket is up. */
    open() { handlers.connected(); },
    /** The host answers a settings request. */
    answer(settings) { handlers.settings({ settings }); },
    /** The host sends the copy that follows a panel being opened for a moved key. */
    moved(param) { handlers.param({ param }); },
  };
}

function fakeUtils(fields) {
  return {
    debounce: (fn) => fn,
    getFormValue: () => Object.fromEntries(fields.map((f) => [f.name, f.value])),
    setFormValue: (settings) => {
      for (const f of fields) {
        if (settings[f.name] !== undefined) f.value = settings[f.name];
      }
    },
  };
}

/**
 * Loads shared.js against a fake page.
 *
 * @returns {{ud: object, dom: object, fire: Function}}
 */
async function openPanel(names) {
  const fields = names.map((name) => field(name, ''));
  const dom = fakeDom(fields);
  const ud = fakeUd();
  const sandbox = {
    document: dom,
    window: { addEventListener() {}, location: { search: '' } },
    $UD: ud,
    Utils: fakeUtils(fields),
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  const context = createContext(sandbox);
  runInContext(await readFile(SHARED, 'utf8'), context, { filename: 'shared.js' });
  return { ud, dom, fields, fire: dom.fire };
}

/** What the panel last sent, or null. */
const settingsSent = (ud) => {
  const last = ud.sent.filter(([kind]) => kind === 'setSettings').at(-1);
  return last ? last[1] : null;
};

test('the panel asks the host for its settings once it is connected', async () => {
  // Without this the panel is write-only. It shows the markup defaults forever, which is
  // what made a saved pan direction look like it had reverted every time it was opened.
  const { ud } = await openPanel(['panDirection', 'stepSize']);
  assert.equal(ud.requested, 0, 'nothing is requested before the socket is up');

  ud.open();
  assert.equal(ud.requested, 1, 'the panel asks');
});

test('the panel shows what the host has stored', async () => {
  const { ud, fields } = await openPanel(['panDirection', 'stepSize']);
  ud.open();
  ud.answer({ panDirection: 'inverted', stepSize: '20' });

  const shown = Object.fromEntries(fields.map((f) => [f.name, f.value]));
  assert.deepEqual(shown, { panDirection: 'inverted', stepSize: '20' });
});

test('opening and closing the panel does not change the stored settings', async () => {
  // The whole point. The user picks a value, leaves, comes back, and the panel must not
  // write anything: it read the host's value and nothing was edited.
  const { ud, fire } = await openPanel(['panDirection', 'stepSize']);
  ud.open();
  ud.answer({ panDirection: 'inverted', stepSize: '20' });

  fire('input');

  assert.equal(settingsSent(ud), null, 'a panel that was only looked at sends nothing');
});

test('editing one field does not reset the others', async () => {
  // The bug that destroyed data. A whole-form save sends the markup's `selected` value
  // for every field the host did not supply, so touching the step size put the pan
  // direction back to Normal with nothing to show for it.
  const { ud, fields, fire } = await openPanel(['panDirection', 'stepSize']);
  ud.open();
  ud.answer({ panDirection: 'inverted', stepSize: '20' });

  fields.find((f) => f.name === 'stepSize').value = '30';
  fire('input');

  assert.deepEqual(settingsSent(ud), { panDirection: 'inverted', stepSize: '30' });
});

test('a panel that never received its settings does not write defaults over them', async () => {
  // The panel is opened before the host answers, or the answer never comes. Whatever is on
  // screen is the markup's default, and saving it wholesale is exactly the data loss above.
  const { ud, fields, fire } = await openPanel(['panDirection', 'stepSize']);
  ud.open();

  fields.find((f) => f.name === 'panDirection').value = 'inverted';
  fire('input');

  const sent = settingsSent(ud);
  assert.equal(sent.panDirection, 'inverted', 'the edit is saved');
  assert.ok(!('stepSize' in sent), 'and nothing the host never said is invented');
});

test('the copy the host sends for a moved key hydrates the panel too', async () => {
  // Two events carry the same payload and mean the same thing; the panel listened to one.
  const { ud, fields } = await openPanel(['panDirection']);
  ud.open();
  ud.moved({ panDirection: 'inverted' });

  assert.equal(fields.find((f) => f.name === 'panDirection').value, 'inverted');
});

test('a change and a change back both reach the host', async () => {
  // Both frames are needed: the host owns the stored value, so it has to be told about
  // the second edit too. Sending only the first would leave the host and the panel
  // disagreeing about what is set, which is the exact confusion this file exists to remove.
  const { ud, fields, fire } = await openPanel(['panDirection']);
  ud.open();
  ud.answer({ panDirection: 'normal' });

  fields.find((f) => f.name === 'panDirection').value = 'inverted';
  fire('input');
  assert.deepEqual(settingsSent(ud), { panDirection: 'inverted' }, 'the first edit is sent');

  fields.find((f) => f.name === 'panDirection').value = 'normal';
  fire('input');
  assert.deepEqual(settingsSent(ud), { panDirection: 'normal' }, 'and so is the undo');
});

test('a field set to the value the host already holds sends nothing', async () => {
  const { ud, fire } = await openPanel(['panDirection', 'stepSize']);
  ud.open();
  ud.answer({ panDirection: 'inverted', stepSize: '20' });

  fire('input');

  assert.equal(settingsSent(ud), null, 'nothing was edited, so nothing is sent');
});

test('every panel in the manifest loads this script', async () => {
  // The panels differ only in their markup, so a panel that grew its own script back would
  // drift from the other three with nothing saying so.
  const manifest = JSON.parse(
    await readFile(path.join(HERE, '..', 'plugin', 'manifest.json'), 'utf8')
  );
  const panels = new Set(
    manifest.Actions.map((action) => action.PropertyInspectorPath).filter(Boolean)
  );

  assert.ok(panels.size >= 4, 'the panels were found');
  for (const panel of panels) {
    const html = await readFile(path.join(HERE, '..', 'plugin', panel), 'utf8');
    assert.ok(html.includes('../shared.js'), `${panel} loads ../shared.js`);
    assert.ok(!html.includes('./inspector.js'), `${panel} has no script of its own`);
  }
});
test('every panel preselects the step the service will really use', async () => {
  // The two numbers live in two files and nothing related them: the `selected` option in
  // the markup, and the default the service falls back on. They agreed by coincidence for
  // months. When the user asked for a step of 1 everywhere, the code moved and the three
  // move panels still said 10 and 5 - and all 146 tests still passed, because each file was
  // correct taken on its own.
  const manifest = JSON.parse(
    await readFile(path.join(HERE, '..', 'plugin', 'manifest.json'), 'utf8')
  );
  const { defaultsFor } = await import('../plugin/service/actions/index.js');

  const parPanneau = new Map();
  for (const action of manifest.Actions) {
    const panneau = action.PropertyInspectorPath;
    if (!panneau) continue;
    if (!parPanneau.has(panneau)) parPanneau.set(panneau, []);
    parPanneau.get(panneau).push(action.UUID);
  }

  let reliees = 0;
  for (const [panneau, uuids] of parPanneau) {
    const html = await readFile(path.join(HERE, '..', 'plugin', panneau), 'utf8');
    const select = html.match(/<select[^>]*name="stepSize">([\s\S]*?)<\/select>/);
    if (!select) continue; // ce panneau ne regle pas le pas

    const choisi = select[1].match(/<option value="(\d+)"\s+selected>/);
    assert.ok(choisi, `${panneau} a une option stepSize marquee selected`);

    for (const uuid of uuids) {
      const defaut = defaultsFor(uuid).stepSize;
      if (defaut === undefined) continue; // cette action ne deplace rien
      assert.equal(
        Number(choisi[1]),
        defaut,
        `${panneau} affiche ${choisi[1]}, mais ${uuid} bougera de ${defaut}`
      );
      reliees += 1;
    }
  }

  assert.ok(reliees >= 6, `les panneaux et les actions ont ete relies (${reliees})`);
});
