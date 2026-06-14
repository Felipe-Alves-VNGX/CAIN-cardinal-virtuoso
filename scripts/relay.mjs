/* ----------------------------------------------------------------------------
 * RELAY — real-time player→GM awareness for queued requests/contraband.
 * socketlib is optional: when absent, the queue still persists on the player's
 * own User flag and the GM sees it via the updateUser re-render. socketlib only
 * adds a live toast so the GM doesn't have to be looking at the review window.
 * -------------------------------------------------------------------------- */
const MOD = "cain-cardinal-virtuoso";
let _socket = null;

/* GM-side handler: a player notified us of a new pending item. */
function onNotifyGM({ fromUserId, label } = {}) {
  if (!game.user.isGM) return;
  const who = game.users.get(fromUserId)?.name ?? "An operative";
  ui.notifications.info(`KIM // ${who}: ${label ?? "new pending item for review."}`);
}

Hooks.once("socketlib.ready", () => {
  try {
    _socket = socketlib.registerModule(MOD);
    _socket.register("notifyGM", onNotifyGM);
    console.log(`${MOD} | relay socket registered`);
  } catch (e) {
    console.warn(`${MOD} | socketlib registration failed`, e);
  }
});

/* Fallback transport when socketlib isn't installed. */
Hooks.once("ready", () => {
  if (typeof socketlib !== "undefined") return;
  game.socket.on(`module.${MOD}`, (data) => {
    if (data?.t === "notifyGM") onNotifyGM(data.payload ?? {});
  });
});

/* Called by KIM after a player enqueues a request/contraband. Best-effort. */
export function relayNotifyGM(payload) {
  try {
    if (_socket) return _socket.executeForAllGMs("notifyGM", payload);
    if (typeof game !== "undefined" && game.socket)
      game.socket.emit(`module.${MOD}`, { t: "notifyGM", payload });
  } catch (e) {
    console.warn(`${MOD} | relayNotifyGM failed`, e);
  }
}
