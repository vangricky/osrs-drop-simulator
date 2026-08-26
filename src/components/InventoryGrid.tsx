import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { useEffect, useRef, useState } from "react";
import { useGameData } from "../hooks/useGameData";
import type { InventorySlot } from "../hooks/useGameState";
import { formatGp } from "../utils/dropLogic";
import IconImg from "./IconImg";

// How long a hold (mouse or touch) has to stay still before it opens the
// Sell/Lock menu. Short enough that dragging to an option while still
// holding feels immediate once it appears.
const LONG_PRESS_MS = 700;
// Movement beyond this, before the hold has opened the menu, cancels it —
// the input is scrolling or starting a drag instead of holding in place.
const LONG_PRESS_MOVE_TOLERANCE = 10;

type MenuAction = "sell" | "lock";

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
      ref={setDropRef}
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
            // open the container underneath the menu. Checked via a ref
            // rather than a prop: the click fires synchronously right after
            // the mouseup that already closed the menu, before React has
            // re-rendered this handler with a "menu's gone now" closure.
            if (suppressClickRef.current === index) return;
            if (openable && !slot.locked) onOpen(index);
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
      {slot && slot.locked ? (
        <span
          title="Locked — right-click (or hold) to unlock"
          className="osrs-bevel pointer-events-none absolute -right-1 -top-1 z-20 flex h-4 w-4 items-center justify-center bg-osrs-panel-dark text-[9px] text-osrs-parchment-dark"
        >
          &#128274;
        </span>
      ) : (
        slot &&
        item?.tradeable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSell(index);
            }}
            title={`Sell for ${formatGp(item.value * slot.quantity)} gp`}
            className="osrs-bevel absolute -right-1 -top-1 z-20 hidden h-4 w-4 items-center justify-center bg-osrs-gold text-[9px] font-bold text-osrs-panel-dark group-hover:flex"
          >
            $
          </button>
        )
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
  const [hoveredAction, setHoveredActionState] = useState<MenuAction | null>(null);

  const pressTimer = useRef<number | null>(null);
  const pressStartRef = useRef<{ index: number; x: number; y: number } | null>(null);
  const pressActiveRef = useRef(false);
  const hoveredActionRef = useRef<MenuAction | null>(null);
  const suppressClickRef = useRef<number | null>(null);
  const menuButtonRefs = useRef<Partial<Record<MenuAction, HTMLButtonElement | null>>>({});
  const globalListenersRef = useRef<{
    move: (e: MouseEvent | TouchEvent) => void;
    up: () => void;
    cancel: () => void;
  } | null>(null);

  const setHoveredAction = (action: MenuAction | null) => {
    hoveredActionRef.current = action;
    setHoveredActionState(action);
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

  const resolveHoveredAction = (x: number, y: number): MenuAction | null => {
    for (const action of ["sell", "lock"] as MenuAction[]) {
      const el = menuButtonRefs.current[action];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return action;
    }
    return null;
  };

  const movePress = (x: number, y: number) => {
    if (pressActiveRef.current) {
      setHoveredAction(resolveHoveredAction(x, y));
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
    if (commit && pressActiveRef.current && pressStartRef.current) {
      const { index } = pressStartRef.current;
      const action = hoveredActionRef.current;
      if (action === "sell") onSell(index);
      else if (action === "lock") onToggleLock(index);
    }
    pressActiveRef.current = false;
    pressStartRef.current = null;
    setContextMenu(null);
    setHoveredAction(null);
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
      setHoveredAction(null);
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
    setActiveIndex(e.active.data.current?.index ?? null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveIndex(null);
    const from = e.active.data.current?.index;
    const to = e.over?.data.current?.index;
    if (typeof from === "number" && typeof to === "number") {
      onMove(from, to);
    }
  };

  const activeSlot = activeIndex !== null ? inventory[activeIndex] : null;
  const filledCount = inventory.filter(Boolean).length;
  const sellableValue = inventory.reduce((sum, slot) => {
    if (!slot || slot.locked) return sum;
    const item = allItems[slot.itemId];
    if (!item?.tradeable) return sum;
    return sum + item.value * slot.quantity;
  }, 0);

  const menuSlot = contextMenu ? inventory[contextMenu.index] : null;
  const menuItem = menuSlot ? allItems[menuSlot.itemId] : null;

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
          onDragEnd={handleDragEnd}
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
              />
            ))}
          </div>
          <DragOverlay modifiers={[snapCenterToCursor]}>
            {activeSlot ? (
              <div className="osrs-bevel-inset flex aspect-square items-center justify-center bg-osrs-panel-dark/80">
                <SlotContent slot={activeSlot} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <p className="mt-3 text-center text-xs text-osrs-parchment-dark/50">
          Drag to reorganize &middot; $ to sell &middot; &#127873; click to open &middot; double-click to discard
          &middot; right-click or hold (drag to choose) to lock
        </p>
      </div>

      {contextMenu && menuSlot && (
        <div
          className="osrs-bevel osrs-panel fixed z-50 min-w-[130px] overflow-hidden py-1 text-sm"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 150),
            top: Math.min(contextMenu.y, window.innerHeight - 100),
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menuItem?.tradeable && !menuSlot.locked && (
            <button
              ref={(el) => {
                menuButtonRefs.current.sell = el;
              }}
              onClick={() => {
                // Hold-opened menus resolve on release (see endPressSession)
                // — this onClick only does anything for the rightclick
                // flow, where releasing the mouse just opens the menu and
                // picking an option is a separate subsequent click.
                if (contextMenu.openedVia === "hold") return;
                onSell(contextMenu.index);
                setContextMenu(null);
              }}
              className={`block w-full px-4 py-2 text-left transition ${
                hoveredAction === "sell" ? "bg-osrs-gold/20 text-osrs-gold" : "text-osrs-parchment hover:bg-osrs-gold/15"
              }`}
            >
              Sell
            </button>
          )}
          <button
            ref={(el) => {
              menuButtonRefs.current.lock = el;
            }}
            onClick={() => {
              if (contextMenu.openedVia === "hold") return;
              onToggleLock(contextMenu.index);
              setContextMenu(null);
            }}
            className={`block w-full px-4 py-2 text-left transition ${
              hoveredAction === "lock" ? "bg-osrs-gold/20 text-osrs-gold" : "text-osrs-parchment hover:bg-osrs-gold/15"
            }`}
          >
            {menuSlot.locked ? "Unlock" : "Lock"}
          </button>
        </div>
      )}
    </div>
  );
}
