/**
 * Leaving.
 *
 * Two things have to be undone when the host goes away: the helper process, and the
 * uncaught exceptions nothing else will see. Both are easy to omit and both show up as
 * the plugin holding the camera after Ulanzi Studio is closed, which reads as a driver
 * problem rather than as a plugin that forgot to tidy up.
 */

/**
 * Installs the handlers that keep the service alive and let the camera go.
 *
 * `uncaughtException` is the load-bearing one. The SDK parses every inbound frame before
 * anything else sees it, so a malformed frame throws inside the SDK, out of the callback
 * that would have handled it. Without this handler the service dies on the first bad
 * frame and the deck goes silent for the rest of the session with nothing in the log.
 *
 * `release` is asked for rather than a bridge, because the helper is created on first use
 * and there may be nothing to stop: a plugin that never moved the camera must not leave a
 * process behind.
 *
 * @param {object} options
 * @param {() => void} options.release  drop the helper and any queued movement
 * @param {(msg: string, level?: string) => void} options.log
 */
export function installShutdownHandlers({ release, log }) {
  const releaseOnce = () => {
    try {
      release();
    } catch (error) {
      log(`could not release the camera: ${error.message}`, 'warn');
    }
  };

  process.on('uncaughtException', (error) => {
    log(`uncaught exception, carrying on: ${error?.message || error}`, 'error');
  });
  process.on('unhandledRejection', (reason) => {
    log(`unhandled rejection, carrying on: ${reason?.message || reason}`, 'error');
  });

  process.on('exit', releaseOnce);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      releaseOnce();
      process.exit(0);
    });
  }

  return releaseOnce;
}