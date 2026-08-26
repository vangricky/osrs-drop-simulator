import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGameData } from "../hooks/useGameData";
import type { InventorySlot } from "../hooks/useGameState";
import { formatGp } from "../utils/dropLogic";
import IconImg from "./IconImg";

// How long a hold (mouse or touch) has to stay still before it toggles the
// slot's lock — no menu in between, the hold IS the action.
const LONG_PRESS_MS = 500;
// Movement beyond this, before the hold fires, cancels it — the input is
// scrolling or starting a drag instead of holding in place.
const LONG_PRESS_MOVE_TOLERANCE = 10;

interface InventoryGridProps {
  inventory: (InventorySlot | null)[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onSell: (index: number) => void;
  onSellAll: () => void;
  onClear: () => void;
  onOpen: (index: number) => void;
  onToggleLock: (index: number) => void;
}

function SlotContent({ slot, tooltipBelow }: { slot: InventorySlot; tooltipBelow?: boolean }) {
  const { items: allItems } = useGameData();
  const item = allItems[slot.itemId];
  if (!item) return null;
  return (
    <>
      <IconImg src={item.iconUrl} alt={item.name} className="h-9 w-9 sm:h-10 sm:w-10" />
      {slot.quantity > 1 && (
        <span className="pointer-events-none absolute bottom-0.5 left-0.5 text-[10px] font-bold text-osrs-gold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          {slot.quantity >= 100000 ? `${Math.floor(slot.quantity / 1000)}K` : slot.quantity.toLocaleString()}
        </span>
      )}
      {/* First-row slots have no grid content above them inside the
          scrollable inventory panel, so a tooltip positioned above the
          slot pokes past the panel's top edge and gets clipped by its
          overflow-y-auto. Render those below the slot instead. */}
      <div
        className={`pointer-events-none absolute left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-none bg-osrs-panel-dark px-2 py-1 text-[11px] text-osrs-parchment shadow-lg ring-1 ring-osrs-border-light group-hover:block ${
          tooltipBelow ? "top-full mt-2" : "-top-9"
        }`}
      >
        {item.name}
        {slot.quantity > 1 ? ` (${slot.quantity.toLocaleString()})` : ""}
        {item.tradeable && <span className="text-osrs-gold"> · {formatGp(item.value * slot.quantity)} gp</span>}
        {slot.locked && <span className="text-osrs-parchment-dark/60"> · locked</span>}
      </div>
    </>
  );
}

function Slot({
  index,
  slot,
  tooltipBelow,
  onRemove,
  onSell,
  onOpen,
  onRightClick,
  onPressStart,
  suppressClickRef,
  registerEl,
}: {
  index: number;
  slot: InventorySlot | null;
  tooltipBelow: boolean;
  onRemove: (index: number) => void;
  onSell: (index: number) => void;
  onOpen: (index: number) => void;
  onRightClick: (index: number) => void;
  onPressStart: (index: number, x: number, y: number) => void;
  suppressClickRef: React.RefObject<number | null>;
  registerEl: (index: number, el: HTMLDivElement | null) => void;
}) {
  const { items: allItems, containers } = useGameData();
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot-${index}`, data: { index } });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `slot-${index}`,
    data: { index },
    disabled: slot === null,
  });
  const item = slot ? allItems[slot.itemId] : null;
  const openable = slot ? Boolean(containers[slot.itemId]) : false;

  return (
    <div
      ref={(el) => {
        setDropRef(el);
        registerEl(index, el);
      }}
      className={`osrs-bevel-inset group relative flex aspect-square items-center justify-center bg-osrs-panel-dark/50 ${
        isOver ? "ring-2 ring-osrs-gold" : ""
      } ${openable ? "ring-1 ring-osrs-gold/50" : ""}`}
    >
      {slot && (
        <div
          ref={setDragRef}
          {...listeners}
          {...attributes}
          onDoubleClick={() => onRemove(index)}
          onClick={() => {
            // A hold that fired the auto-lock still ends in a mousedown+mouseup
            // (and thus a native click) on release — without this, that click
            // would silently also open/sell the item right after locking it.
            // Checked via a ref rather than a prop: the click fires
            // synchronously right after the mouseup, before React has
            // re-rendered this handler with an up-to-date closure.
            if (suppressClickRef.current === index) return;
            if (slot.locked) return;
            if (openable) onOpen(index);
            else if (item?.tradeable) onSell(index);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onRightClick(index);
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            onPressStart(index, e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            // Deliberately NOT also invoking dnd-kit's own TouchSensor
            // activator here (it's on this same prop, spread from
            // `{...listeners}` above, and this handler replaces it) — wiring
            // both up left TouchSensor's delay-based activation stuck
            // "listening" after a long hold with no movement (exactly this
            // gesture), never cleanly resolving and leaving the slot
            // permanently marked as dragging. PointerSensor (a separate
            // `onPointerDown`, untouched by this handler) already covers
            // touch-drag activation via the browser's own touch-to-pointer
            // event translation, so nothing is actually lost here.
            const t = e.touches[0];
            onPressStart(index, t.clientX, t.clientY);
          }}
          className={`flex h-full w-full items-center justify-center ${isDragging ? "opacity-30" : ""} ${openable ? "cursor-pointer" : ""}`}
          style={{ touchAction: "none", WebkitTouchCallout: "none" }}
        >
          <SlotContent slot={slot} tooltipBelow={tooltipBelow} />
        </div>
      )}
      {slot && openable && (
        <span
          title="Click to open"
          className="osrs-bevel pointer-events-none absolute -left-1 -top-1 z-20 flex h-4 w-4 items-center justify-center bg-osrs-panel-dark text-[9px] text-osrs-gold"
        >
          &#127873;
        </span>
      )}
      {slot && slot.locked && (
        <span
          title="Locked — hold (or right-click) to unlock"
          className="osrs-bevel pointer-events-none absolute -right-1 -top-1 z-20 flex h-4 w-4 items-center justify-center bg-osrs-panel-dark text-[9px] text-osrs-parchment-dark"
        >
          &#128274;
        </span>
      )}
    </div>
  );
}

export default function InventoryGrid({
  inventory,
  onMove,
  onRemove,
  onSell,
  onSellAll,
  onClear,
  onOpen,
  onToggleLock,
}: InventoryGridProps) {
  const { items: allItems } = useGameData();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Where the dragged item's floating copy should render, tracked from
  // dnd-kit's own (touch-safe) coordinate stream rather than its built-in
  // DragOverlay — that component positions itself via a `position: fixed`
  // node measured/placed by dnd-kit internally, which on real mobile Safari
  // was landing well above the actual finger position. Driving a plain
  // fixed-position div ourselves from dragOrigin+delta guarantees it's
  // exactly where dnd-kit says the pointer is, on every input type.
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dragDelta, setDragDelta] = useState({ x: 0, y: 0 });
  const [dragSize, setDragSize] = useState<{ width: number; height: number } | null>(null);
  // Each slot's own element, keyed by index — used to size the floating
  // drag copy above.
  const slotElRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const registerSlotEl = (index: number, el: HTMLDivElement | null) => {
    slotElRefs.current[index] = el;
  };

  const pressTimer = useRef<number | null>(null);
  const pressStartRef = useRef<{ index: number; x: number; y: number } | null>(null);
  // Set once the hold has actually toggled the lock, so the still-held
  // finger/mouse doesn't need tracking anymore — just waiting for release.
  const firedRef = useRef(false);
  const suppressClickRef = useRef<number | null>(null);
  const globalListenersRef = useRef<{
    move: (e: MouseEvent | TouchEvent) => void;
    up: () => void;
    cancel: () => void;
  } | null>(null);

  const clearPressTimer = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const removeGlobalListeners = () => {
    const l = globalListenersRef.current;
    if (!l) return;
    window.removeEventListener("mousemove", l.move);
    window.removeEventListener("touchmove", l.move);
    window.removeEventListener("mouseup", l.up);
    window.removeEventListener("touchend", l.up);
    window.removeEventListener("touchcancel", l.cancel);
    globalListenersRef.current = null;
  };

  // Only called on the actual release (or a cancelled hold) — NOT the
  // moment the lock toggles, since the finger/mouse is typically still down
  // well past that point. Clearing suppressClickRef here, right as the
  // trailing native "click" is about to fire from this same release, is
  // what keeps that click from also selling/opening the item underneath.
  const endPressSession = () => {
    clearPressTimer();
    removeGlobalListeners();
    const wasFired = firedRef.current;
    pressStartRef.current = null;
    firedRef.current = false;
    if (wasFired) {
      // Cleared a tick later, not immediately: the native "click" that
      // follows this same release fires before React re-renders, so the
      // Slot's onClick handler needs to still see this set on that pass.
      window.setTimeout(() => {
        suppressClickRef.current = null;
      }, 0);
    }
  };

  const movePress = (x: number, y: number) => {
    // Once the lock has fired there's nothing left to track — just wait
    // for release, however long that takes.
    if (firedRef.current) return;
    if (!pressStartRef.current) return;
    const dx = x - pressStartRef.current.x;
    const dy = y - pressStartRef.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) endPressSession();
  };

  const handlePressStart = (index: number, x: number, y: number) => {
    if (pressStartRef.current) {
      // A duplicate press-start for the exact same still-held gesture —
      // real touchscreens fire a compatibility "mousedown" partway through
      // an ongoing touch hold (our own onMouseDown/onTouchStart both call
      // this), and restarting the session here would arm a brand new
      // LONG_PRESS_MS timer that goes on to fire a second, unwanted toggle
      // before the finger ever lifts. Ignore it and let the original
      // session run its course.
      if (pressStartRef.current.index === index) return;
      // A genuinely different press arrived while another was still
      // "active" — shouldn't happen with a single pointer, but tear down
      // the stale one defensively rather than leaving two timers running.
      endPressSession();
    }
    pressStartRef.current = { index, x, y };
    firedRef.current = false;

    const move = (e: MouseEvent | TouchEvent) => {
      const point = "touches" in e ? e.touches[0] : (e as MouseEvent);
      if (!point) return;
      movePress(point.clientX, point.clientY);
    };
    const up = () => endPressSession();
    globalListenersRef.current = { move, up, cancel: up };
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);

    pressTimer.current = window.setTimeout(() => {
      firedRef.current = true;
      suppressClickRef.current = index;
      onToggleLock(index);
      // Deliberately not calling endPressSession() here — the finger/mouse
      // is still down, so the click-suppression must stay armed until the
      // real release (handled by the `up` listener above).
    }, LONG_PRESS_MS);
  };

  const handleRightClick = (index: number) => {
    endPressSession();
    onToggleLock(index);
  };

  // Redefined every render (it closes over onToggleLock), so an
  // always-current ref is what the mount-only cleanup below actually calls
  // — keeping it out of the effect's deps is deliberate, not an oversight.
  const endPressSessionRef = useRef(endPressSession);
  useEffect(() => {
    endPressSessionRef.current = endPressSession;
  });
  useEffect(() => () => endPressSessionRef.current(), []);

  const sensors = useSensors(
    // Mouse (and any browser that resolves touch through the Pointer Events
    // API cleanly) — a small movement threshold so a plain click/tap still
    // reaches onClick/onDoubleClick instead of being eaten as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Real touchscreens need their own sensor: PointerSensor alone tends to
    // lose the race against the browser's native scroll/swipe gesture on a
    // scrollable panel like this one, even with touch-action: none on the
    // handle, so a press-and-drag often just scrolls the page instead of
    // picking the item up. TouchSensor's short hold delay is dnd-kit's own
    // recommended way to disambiguate "starting to scroll" from "starting
    // to drag" on touch — short enough to still feel responsive, long
    // enough that a normal tap/scroll never triggers it.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    const index = e.active.data.current?.index ?? null;
    setActiveIndex(index);
    setDragOrigin(getEventCoordinates(e.activatorEvent) ?? null);
    setDragDelta({ x: 0, y: 0 });
    const rect = typeof index === "number" ? slotElRefs.current[index]?.getBoundingClientRect() : null;
    setDragSize(rect ? { width: rect.width, height: rect.height } : null);
  };

  const handleDragMove = (e: DragMoveEvent) => {
    setDragDelta(e.delta);
  };

  const resetDragOverlay = () => {
    setActiveIndex(null);
    setDragOrigin(null);
    setDragSize(null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const from = e.active.data.current?.index;
    const to = e.over?.data.current?.index;
    resetDragOverlay();
    if (typeof from === "number" && typeof to === "number") {
      onMove(from, to);
    }
  };

  const activeSlot = activeIndex !== null ? inventory[activeIndex] : null;
  const dragPoint = dragOrigin ? { x: dragOrigin.x + dragDelta.x, y: dragOrigin.y + dragDelta.y } : null;
  const filledCount = inventory.filter(Boolean).length;
  const sellableValue = inventory.reduce((sum, slot) => {
    if (!slot || slot.locked) return sum;
    const item = allItems[slot.itemId];
    if (!item?.tradeable) return sum;
    return sum + item.value * slot.quantity;
  }, 0);

  return (
    <div className="osrs-bevel osrs-panel flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2.5 border-b-2 border-osrs-border-dark px-3.5 py-2.5">
        <h2 className="font-display text-base font-bold uppercase tracking-wide text-osrs-gold">Inventory</h2>
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-osrs-parchment-dark/70">{filledCount}/28</span>
          <button
            onClick={onSellAll}
            disabled={sellableValue === 0}
            title={sellableValue > 0 ? `Sell everything unlocked for ${formatGp(sellableValue)} gp` : undefined}
            className="osrs-bevel bg-osrs-green/20 px-3 py-1.5 text-xs font-semibold text-osrs-green transition hover:bg-osrs-green/30 active:osrs-bevel-inset disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sell all{sellableValue > 0 ? ` (${formatGp(sellableValue)})` : ""}
          </button>
          <button
            onClick={onClear}
            className="osrs-bevel bg-osrs-panel-dark/50 px-3 py-1.5 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
          >
            Discard all
          </button>
        </div>
      </div>

      <div className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto p-3.5">
        <DndContext
          sensors={sensors}
          // The default rectIntersection strategy compares overlap area
          // between the dragged rect and every droppable rect — in a dense,
          // uniform grid like this one that's ambiguous (adjacent cells'
          // rects overlap it almost equally while the pointer is between
          // them), so it was resolving to the wrong neighboring slot and
          // swapping items other than the ones actually under the cursor.
          // closestCenter picks the droppable whose center is nearest the
          // dragged item's center instead, which is unambiguous per-cell.
          collisionDetection={closestCenter}
          // Without this, dnd-kit tracks wherever within the cell you first
          // touched it and preserves that same offset for the rest of the
          // drag — on a small touch target that reads as "the item is stuck
          // below my finger," and worse, the drop target is computed from
          // that same offset rect, not from where the finger actually ends
          // up. snapCenterToCursor re-centers the dragged rect (and thus
          // both collision detection and the overlay below) on the current
          // pointer position instead, regardless of the initial grab point.
          modifiers={[snapCenterToCursor]}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={resetDragOverlay}
        >
          <div className="grid grid-cols-4 gap-2">
            {inventory.map((slot, i) => (
              <Slot
                key={i}
                index={i}
                slot={slot}
                tooltipBelow={i < 4}
                onRemove={onRemove}
                onSell={onSell}
                onOpen={onOpen}
                onRightClick={handleRightClick}
                onPressStart={handlePressStart}
                suppressClickRef={suppressClickRef}
                registerEl={registerSlotEl}
              />
            ))}
          </div>
        </DndContext>
        {activeSlot &&
          dragPoint &&
          dragSize &&
          createPortal(
            <div
              className="osrs-bevel-inset pointer-events-none fixed z-50 flex items-center justify-center bg-osrs-panel-dark/80"
              style={{
                left: dragPoint.x - dragSize.width / 2,
                top: dragPoint.y - dragSize.height / 2,
                width: dragSize.width,
                height: dragSize.height,
              }}
            >
              <SlotContent slot={activeSlot} />
            </div>,
            document.body,
          )}
        <p className="mt-3 text-center text-xs text-osrs-parchment-dark/50">
          Drag to reorganize &middot; click to sell/open &middot; &#127873; opens a container &middot; double-click
          to discard &middot; hold or right-click to lock/unlock
        </p>
      </div>
    </div>
  );
}
