import { useEffect, useRef, useState } from "react";

/**
 * Generic "repeat an action on an interval while toggled on" driver, backed
 * by a dedicated Web Worker rather than a plain setInterval on the main
 * thread. Browsers throttle main-thread timers down to ~once/sec once a tab
 * is backgrounded, REGARDLESS of the requested interval — exactly the kind
 * of thing that happens when someone tabs away while an automated loop like
 * this runs unattended. A worker's timers aren't subject to that same
 * throttling, so the real interval holds whether or not the tab is visible.
 * The worker only decides *when* to tick — it has none of the game data
 * needed to actually do anything, so `onTick` still runs on the main thread
 * in response to each tick message.
 *
 * Shared by the Pet Drop Simulator's Auto Roll, the main game's Auto Kill,
 * and Auto Open — anywhere that needs "keep doing X every N ms until
 * toggled off" without duplicating this worker-lifecycle boilerplate three
 * times over.
 *
 * `onTick` returning `false` stops the ticker after that tick (e.g. "the pet
 * dropped" or "inventory is full") — a return value rather than callers
 * closing over this hook's own `setRunning` deliberately, since a closure
 * capturing a value this same hook call is about to return is a real
 * temporal-dead-zone footgun in practice even though it happens to be safe
 * here (the closure only ever runs later, well after this hook call
 * finishes) — a linter can't prove that, and would rather not have to.
 */
export function useAutoTicker(onTick: () => void | boolean, intervalMs: number) {
  const [running, setRunning] = useState(false);

  // Always call the latest onTick — without this, the worker effect below
  // would need onTick in its own dependency array, tearing down and
  // recreating the interval on every render that passes a new closure
  // (which is every render, for an inline arrow function).
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  });

  const workerRef = useRef<Worker | null>(null);
  useEffect(() => {
    const worker = new Worker(new URL("../workers/tickWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;
    if (!running) {
      worker.onmessage = null;
      worker.postMessage({ type: "stop" });
      return;
    }
    worker.onmessage = () => {
      if (onTickRef.current() === false) setRunning(false);
    };
    worker.postMessage({ type: "start", intervalMs });
    return () => {
      worker.onmessage = null;
      worker.postMessage({ type: "stop" });
    };
  }, [running, intervalMs]);

  return { running, setRunning };
}
