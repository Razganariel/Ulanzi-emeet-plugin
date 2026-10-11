/**
 * Shared property inspector bootstrap.
 *
 * The panels - move, zoom, encoder, positions - differ only in the fields their markup
 * declares. Written out per panel the same forty lines sat in three files, which is how two
 * of them ended up carrying a `defaultSettings` constant that nothing read: the visible
 * default was whatever the markup's `selected` attribute said, and the constant above it
 * said something else.
 *
 * A property inspector runs in a WebView with no console the user can reach, so anything
 * thrown here leaves the panel simply inert. The banner below is the only thing that turns
 * that into something reportable.
 *
 * Three rules the panels live by, each of them learned the hard way:
 *
 *  - **ask for the settings.** `connect()` does not fetch them, and the host only answers a
 *    request. A panel that never asks shows the markup's defaults and nothing else, so
 *    every setting reads as "reverted" each time it is opened.
 *  - **never write a field that has not been read.** Saving the whole form sends the markup
 *    default for every field the host did not supply, which silently destroys a stored
 *    choice the moment the user touches an unrelated field.
 *  - **write only what the user changed.** Same reason, narrower: the fields the panel did
 *    not touch are echoed back from what the host last said.
 */
(function () {
  const HOST_NOISE = /Still in CONNECTING state/;

  function reportFatal(what, err) {
    const message = `${what}: ${(err && err.message) || err}`;
    // The page hosts code injected by UlanziStudio that sends on a socket still CONNECTING.
    // Blaming the plugin for that would send the user hunting in the wrong place.
    if (HOST_NOISE.test(message)) {
      console.warn(`[pixy] ignored (Ulanzi host): ${message}`);
      return;
    }
    let box = document.getElementById('pi-error');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pi-error';
      box.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:8px 10px;' +
        'background:#7f1d1d;color:#fff;font:12px/1.4 monospace;white-space:pre-wrap';
      document.body.appendChild(box);
    }
    box.textContent = message;
  }

  window.addEventListener('error', (e) => reportFatal('JS error', e.error || e.message));

  const FORM_ID = '#property-inspector';

  /**
   * Connects the panel, fills it from the host, and saves what the user changes.
   *
   * `known` is what the host has said this panel holds. It is the baseline every save is
   * measured against, which is what keeps the markup's defaults out of the conversation.
   */
  function boot() {
    let known = {};
    let rendered = {};
    let form = null;

    try {
      form = document.querySelector(FORM_ID);
      if (!form) {
        reportFatal('Form not found', FORM_ID);
        return;
      }

      $UD.connect();

      // Enter inside a field submits the form, and a submitted form in a WebView
      // navigates, losing the panel and everything typed into it.
      form.addEventListener('submit', (event) => event.preventDefault());
      form.addEventListener('input', Utils.debounce(save, 150));

      $UD.onConnected(() => {
        form.classList.remove('hidden');
        const wrapper = document.querySelector('.uspi-wrapper');
        if (wrapper) wrapper.classList.remove('hidden');
        // The host answers a request, it does not volunteer. Without this the panel is
        // write-only: it can change a setting but can never show what it is set to.
        $UD.getSettings();
      });

      const hydrate = (incoming) => {
        if (!incoming || typeof incoming !== 'object') return;
        known = { ...known, ...incoming };
        Utils.setFormValue(known, form);
        rendered = Utils.getFormValue(form);
      };

      // Two events carry the same payload and mean the same thing: the answer to our
      // request, and the copy the host sends once a panel has been opened for a key that
      // moved. Listening to only one of them leaves the panel blank depending on how the
      // user got to it.
      $UD.onDidReceiveSettings((message) => hydrate(message && message.settings));
      $UD.onParamFromApp((message) => hydrate(message && message.param));

      rendered = Utils.getFormValue(form);
    } catch (err) {
      reportFatal('Property inspector failed to start', err);
      throw err;
    }

    /**
     * Saves the fields the user actually changed, over what the host already has.
     *
     * A whole-form save is what broke this: a field the host never supplied came back with
     * the markup's `selected` value, so editing the step size silently reset the pan
     * direction, and reopening the panel made it look like nothing had been saved at all.
     *
     * The baseline for a field is what the host holds, and only what is on screen when the
     * host never said. Measuring against the markup alone would send every field the
     * moment the panel opened, which is the same data loss by a different route.
     */
    function save() {
      const current = Utils.getFormValue(form);
      const changed = {};
      for (const name of Object.keys(current)) {
        const baseline = name in known ? known[name] : rendered[name];
        if (current[name] !== baseline) changed[name] = current[name];
      }
      if (!Object.keys(changed).length) return;

      known = { ...known, ...changed };
      $UD.setSettings(known);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();