/**
 * A dedicated Web Worker whose only job is to be an accurate tick source for
 * the Pet Drop Sim's auto-roll loop. Chrome (and other browsers) throttle
 * setInterval/setTimeout on the main thread down to about once per second
 * once a tab is backgrounded, REGARDLESS of the requested interval — so a
 * main-thread interval auto-rolling at "20x" would silently collapse to
 * roughly "1x" the moment the player switched tabs while it ran, which is
 * exactly the kind of thing you'd do with an idle auto-roller. Workers run
 * on a separate thread and aren't subject to that same background-tab
 * throttling, so the interval keeps its real requested rate regardless of
 * whether the page is visible.
 *
 * Protocol: {type: "start", intervalMs} begins ticking at that rate
 * (replacing any existing interval), {type: "stop"} stops it. Each tick
 * posts back the string "tick" — the actual roll logic (which needs game
 * data this worker doesn't have) stays on the main thread; this only
 * decides *when*.
 */
let timer: ReturnType<typeof setInterval> | undefined;

self.onmessage = (e: MessageEvent<{ type: "start"; intervalMs: number } | { type: "stop" }>) => {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
  if (e.data.type === "start") {
    timer = setInterval(() => self.postMessage("tick"), e.data.intervalMs);
  }
};
