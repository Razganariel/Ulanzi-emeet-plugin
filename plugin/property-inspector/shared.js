/**
 * Shared property inspector bootstrap.
 *
 * The three panels - move, zoom, encoder, positions - differ only in the fields their
 * markup declares. Written out per panel the same forty lines sat in three files, which is
 * how two of them ended up carrying a `defaultSettings` constant that nothing read: the
 * visible default was whatever the markup's `selected` attribute said, and the constant
 * above it said something else.
 *
 * A property inspector runs in a WebView with no console the user can reach, so anything
 * thrown here leaves the panel simply inert. The banner below is the only thing that turns
 * that into something reportable.
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
   * Connects the panel, fills it from the saved settings, and saves as it is edited.
   *
   * Settings are merged into what the panel already knows rather than replaced by it: the
   * host answers one panel at a time, and the visible fields are all this plugin has, so a
   * full replace is only ever a full copy of this same form.
   */
  function boot() {
    let settings = {};

    const form = document.querySelector(FORM_ID);
    if (!form) {
      reportFatal('Form not found', FORM_ID);
      return;
    }

    try {
      $UD.connect();

      // Enter inside a field submits the form, and a submitted form in a WebView
      // navigates, losing the panel and everything typed into it.
      form.addEventListener('submit', (event) => event.preventDefault());

      form.addEventListener('input', Utils.debounce(save, 150));

      $UD.onConnected(() => {
        form.classList.remove('hidden');
        const wrapper = document.querySelector('.uspi-wrapper');
        if (wrapper) wrapper.classList.remove('hidden');
      });

      $UD.onDidReceiveSettings((message) => {
        if (!message || !message.settings) return;
        settings = { ...settings, ...message.settings };
        Utils.setFormValue(settings, form);
      });
    } catch (err) {
      reportFatal('Property inspector failed to start', err);
      throw err;
    }

    function save() {
      settings = { ...settings, ...Utils.getFormValue(form) };
      $UD.setSettings(settings);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();