/**
 * A stand-in for the camera helper.
 *
 * `PixyController.exe` is the only thing that can reach IAMCameraControl, and it needs a
 * camera. Neither is available to a test, so this records the commands that were issued and
 * answers them from a script, which is enough to prove the right command reached the right
 * action with the right arguments - the part that is actually written here.
 *
 * An answer of `{ ok: false }` reproduces what a helper says when the driver refuses, and
 * an Error rejects the way a timeout or a missing executable does.
 */

export function fakeBridge(answers = {}) {
  const requests = [];
  let closed = false;

  return {
    requests,
    get closed() {
      return closed;
    },

    request(payload) {
      requests.push(payload);
      const answer = answers[payload.cmd];
      if (answer instanceof Error) return Promise.reject(answer);
      if (answer && answer.ok === false) return Promise.resolve(answer);
      return Promise.resolve({ ok: true, ...(answer && typeof answer === 'object' ? answer : {}) });
    },

    close() {
      closed = true;
    },

    /** The commands issued so far, in order. */
    commands() {
      return requests.map((request) => request.cmd);
    },

    /** The last command issued for one name. */
    last(cmd) {
      return [...requests].reverse().find((request) => request.cmd === cmd);
    },
  };
}

/** A camera that fails every command, to exercise the error paths. */
export function failingBridge(message = 'camera bridge timed out after 4000ms') {
  return fakeBridge(new Proxy({}, {
    get: () => new Error(message),
  }));
}