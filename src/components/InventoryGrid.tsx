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
import { useState } from "react";
import { useGameData } from "../hooks/useGameData";
import type { InventorySlot } from "../hooks/useGameState";
import { formatGp } from "../utils/dropLogic";
import IconImg from "./IconImg";

interface InventoryGridProps {
  inventory: (InventorySlot | null)[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onSell: (index: number) => void;
  onSellAll: () => void;
  onClear: () => void;
  onOpen: (index: number) => void;
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
}: {
  index: number;
  slot: InventorySlot | null;
  tooltipBelow: boolean;
  onRemove: (index: number) => void;
  onSell: (index: number) => void;
  onOpen: (index: number) => void;
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
          onClick={() => openable && onOpen(index)}
          className={`flex h-full w-full items-center justify-center ${isDragging ? "opacity-30" : ""} ${openable ? "cursor-pointer" : ""}`}
          style={{ touchAction: "none" }}
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
      {slot && item?.tradeable && (
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
      )}
    </div>
  );
}

export default function InventoryGrid({ inventory, onMove, onRemove, onSell, onSellAll, onClear, onOpen }: InventoryGridProps) {
  const { items: allItems } = useGameData();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
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
    if (!slot) return sum;
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
            title={sellableValue > 0 ? `Sell everything for ${formatGp(sellableValue)} gp` : undefined}
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
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-4 gap-2">
            {inventory.map((slot, i) => (
              <Slot key={i} index={i} slot={slot} tooltipBelow={i < 4} onRemove={onRemove} onSell={onSell} onOpen={onOpen} />
            ))}
          </div>
          <DragOverlay>
            {activeSlot ? (
              <div className="osrs-bevel-inset flex aspect-square items-center justify-center bg-osrs-panel-dark/80">
                <SlotContent slot={activeSlot} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <p className="mt-3 text-center text-xs text-osrs-parchment-dark/50">
          Drag to reorganize &middot; $ to sell &middot; &#127873; click to open &middot; double-click to discard
        </p>
      </div>
    </div>
  );
}
