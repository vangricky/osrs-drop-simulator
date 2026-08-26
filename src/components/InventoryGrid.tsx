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

// How long a hold (mouse or touch) has to stay still before it opens the
// Lock menu. Short enough that dragging onto it while still holding feels
// immediate once it appears.
const LONG_PRESS_MS = 700;
// Movement beyond this, before the hold has opened the menu, cancels it —
// the input is scrolling or starting a drag instead of holding in place.
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

interface ContextMenuState {
  index: number;
  x: number;
  y: number;
  // "hold" menus resolve via drag-to-select-then-release (see
  // handlePressStart below); "rightclick" ones behave like a normal
  // desktop context menu — open, then a separate click on an option.
  openedVia: "hold" | "rightclick";
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
  onContextMenu,
  onPressStart,
  suppressClickRef,
  dragBlocked,
  registerEl,
}: {
  index: number;
  slot: InventorySlot | null;
  tooltipBelow: boolean;
  onRemove: (index: number) => void;
  onSell: (index: number) => void;
  onOpen: (index: number) => void;
  onContextMenu: (index: number, x: number, y: number) => void;
  onPressStart: (index: number, x: number, y: number) => void;
  suppressClickRef: React.RefObject<number | null>;
  dragBlocked: boolean;
  registerEl: (index: number, el: HTMLDivElement | null) => void;
}) {
  const { items: allItems, containers } = useGameData();
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot-${index}`, data: { index } });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `slot-${index}`,
    data: { index },
    // Also disabled once this slot's hold has opened the Sell/Lock menu —
    // otherwise dragging a finger/cursor over to "Lock" crosses dnd-kit's
    // own activation distance and reorders the item at the same time,
    // which is exactly the "why is it dragging while I'm just trying to
    // pick a menu option" bug this guards against.
    disabled: slot === null || dragBlocked,
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
            // A hold that opened the menu still ends in a mousedown+mouseup
            // (and thus a native click) on whatever's under the pointer at
            // release — without this, releasing back over the same slot
            // (e.g. the drag-to-Lock never happened) would silently also
            // open/sell the item underneath the menu. Checked via a ref
            // rather than a prop: the click fires synchronously right after
            // the mouseup that already closed the menu, before React has
            // re-rendered this handler with a "menu's gone now" closure.
            if (suppressClickRef.current === index) return;
            if (slot.locked) return;
            if (openable) onOpen(index);
            else if (item?.tradeable) onSell(index);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(index, e.clientX, e.clientY);
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            onPressStart(index, e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
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
          title="Locked — right-click (or hold) to unlock"
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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Lock is the only option left in the hold/right-click menu now that a
  // plain click sells directly — this just tracks whether the pointer is
  // currently over that one button while the menu is open.
  const [hoveringLock, setHoveringLockState] = useState(false);
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
  // Each slot's own element, keyed by index — used to position the hold-menu
  // right next to the actual square (see contextMenu render below) and to
  // size the floating drag copy, instead of relying on raw touch/pointer
  // coordinates that can land far from the slot on some mobile browsers.
  const slotElRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const registerSlotEl = (index: number, el: HTMLDivElement | null) => {
    slotElRefs.current[index] = el;
  };

  const pressTimer = useRef<number | null>(null);
  const pressStartRef = useRef<{ index: number; x: number; y: number } | null>(null);
  const pressActiveRef = useRef(false);
  const hoveringLockRef = useRef(false);
  const suppressClickRef = useRef<number | null>(null);
  const lockButtonRef = useRef<HTMLButtonElement | null>(null);
  const globalListenersRef = useRef<{
    move: (e: MouseEvent | TouchEvent) => void;
    up: () => void;
    cancel: () => void;
  } | null>(null);

  const setHoveringLock = (hovering: boolean) => {
    hoveringLockRef.current = hovering;
    setHoveringLockState(hovering);
  };

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

  const resolveHoveringLock = (x: number, y: number): boolean => {
    const el = lockButtonRef.current;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const movePress = (x: number, y: number) => {
    if (pressActiveRef.current) {
      setHoveringLock(resolveHoveringLock(x, y));
      return;
    }
    if (!pressStartRef.current) return;
    const dx = x - pressStartRef.current.x;
    const dy = y - pressStartRef.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE) endPressSession(false);
  };

  // `commit` — apply whatever action is currently highlighted (a real
  // release ending the hold) vs. just tearing the session down (moved too
  // far before the menu opened, or the component unmounted mid-hold).
  function endPressSession(commit: boolean) {
    clearPressTimer();
    removeGlobalListeners();
    if (commit && pressActiveRef.current && pressStartRef.current && hoveringLockRef.current) {
      onToggleLock(pressStartRef.current.index);
    }
    pressActiveRef.current = false;
    pressStartRef.current = null;
    setContextMenu(null);
    setHoveringLock(false);
    // Cleared a tick later, not immediately: the native "click" that
    // follows this same mouseup fires before React re-renders, so the
    // Slot's onClick handler needs to still see this set on that pass.
    window.setTimeout(() => {
      suppressClickRef.current = null;
    }, 0);
  }

  const handlePressStart = (index: number, x: number, y: number) => {
    endPressSession(false);
    pressStartRef.current = { index, x, y };
    pressActiveRef.current = false;

    const move = (e: MouseEvent | TouchEvent) => {
      const point = "touches" in e ? e.touches[0] : (e as MouseEvent);
      if (!point) return;
      movePress(point.clientX, point.clientY);
    };
    const up = () => endPressSession(true);
    const cancel = () => endPressSession(false);
    globalListenersRef.current = { move, up, cancel };
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", cancel);

    pressTimer.current = window.setTimeout(() => {
      pressActiveRef.current = true;
      suppressClickRef.current = index;
      setContextMenu({ index, x, y, openedVia: "hold" });
      setHoveringLock(false);
    }, LONG_PRESS_MS);
  };

  const handleRightClick = (index: number, x: number, y: number) => {
    endPressSession(false);
    setContextMenu({ index, x, y, openedVia: "rightclick" });
  };

  // Redefined every render (it closes over onSell/onToggleLock), so an
  // always-current ref is what the mount-only cleanup below actually calls
  // — keeping it out of the effect's deps is deliberate, not an oversight.
  const endPressSessionRef = useRef(endPressSession);
  endPressSessionRef.current = endPressSession;
  useEffect(() => () => endPressSessionRef.current(false), []);

  // Right-click-opened menus behave like a normal desktop context menu —
  // closed by clicking away, scrolling, or Escape, with the option itself
  // selected by a separate subsequent click. Hold-opened ones manage their
  // own lifecycle entirely through the press session above (this would
  // just be redundant, though harmless, for those).
  useEffect(() => {
    if (!contextMenu || contextMenu.openedVia !== "rightclick") return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

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

  const menuSlot = contextMenu ? inventory[contextMenu.index] : null;
  // Hold-opened menus (mobile long-press) anchor to the slot's own square —
  // touch coordinates during a sustained hold have been landing the menu
  // far from the finger on real devices, so this positions it directly
  // beside the item instead of trusting the raw touch point. Right-click
  // still follows the cursor like a normal desktop context menu.
  const menuPosition = (() => {
    if (!contextMenu) return null;
    const MENU_WIDTH = 140;
    const MENU_GAP = 6;
    if (contextMenu.openedVia === "hold") {
      const rect = slotElRefs.current[contextMenu.index]?.getBoundingClientRect();
      if (!rect) return { left: Math.min(contextMenu.x, window.innerWidth - 150), top: Math.min(contextMenu.y, window.innerHeight - 100) };
      const left =
        rect.right + MENU_GAP + MENU_WIDTH <= window.innerWidth
          ? rect.right + MENU_GAP
          : Math.max(4, rect.left - MENU_GAP - MENU_WIDTH);
      const top = Math.max(4, Math.min(rect.top, window.innerHeight - 100));
      return { left, top };
    }
    return { left: Math.min(contextMenu.x, window.innerWidth - 150), top: Math.min(contextMenu.y, window.innerHeight - 100) };
  })();

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
                onContextMenu={handleRightClick}
                onPressStart={handlePressStart}
                suppressClickRef={suppressClickRef}
                dragBlocked={contextMenu?.index === i && contextMenu.openedVia === "hold"}
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
          to discard &middot; right-click or hold to lock
        </p>
      </div>

      {contextMenu &&
        menuSlot &&
        createPortal(
          <div
            className="osrs-bevel osrs-panel fixed z-50 min-w-[110px] overflow-hidden py-1 text-sm"
            style={menuPosition ?? { left: 0, top: 0 }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              ref={lockButtonRef}
              onClick={() => {
                // Hold-opened menus resolve on release (see endPressSession)
                // — this onClick only does anything for the rightclick
                // flow, where releasing the mouse just opens the menu and
                // picking the option is a separate subsequent click.
                if (contextMenu.openedVia === "hold") return;
                onToggleLock(contextMenu.index);
                setContextMenu(null);
              }}
              className={`block w-full px-4 py-2 text-left transition ${
                hoveringLock ? "bg-osrs-gold/20 text-osrs-gold" : "text-osrs-parchment hover:bg-osrs-gold/15"
              }`}
            >
              {menuSlot.locked ? "Unlock" : "Lock"}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
