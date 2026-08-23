import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { containers, items as allItems } from "../data/npcData";
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

function SlotContent({ slot }: { slot: InventorySlot }) {
  const item = allItems[slot.itemId];
  if (!item) return null;
  return (
    <>
      <IconImg src={item.iconUrl} alt={item.name} className="h-8 w-8 sm:h-9 sm:w-9" />
      {slot.quantity > 1 && (
        <span className="pointer-events-none absolute bottom-0.5 left-0.5 text-[10px] font-bold text-osrs-gold drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
          {slot.quantity >= 100000 ? `${Math.floor(slot.quantity / 1000)}K` : slot.quantity.toLocaleString()}
        </span>
      )}
      <div className="pointer-events-none absolute -top-9 left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-none bg-osrs-panel-dark px-2 py-1 text-[11px] text-osrs-parchment shadow-lg ring-1 ring-osrs-border-light group-hover:block">
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
  onRemove,
  onSell,
  onOpen,
}: {
  index: number;
  slot: InventorySlot | null;
  onRemove: (index: number) => void;
  onSell: (index: number) => void;
  onOpen: (index: number) => void;
}) {
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
          <SlotContent slot={slot} />
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
      <div className="flex items-center justify-between border-b-2 border-osrs-border-dark px-3 py-2">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-osrs-gold">Inventory</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-osrs-parchment-dark/70">{filledCount}/28</span>
          <button
            onClick={onSellAll}
            disabled={sellableValue === 0}
            title={sellableValue > 0 ? `Sell everything for ${formatGp(sellableValue)} gp` : undefined}
            className="osrs-bevel bg-osrs-green/20 px-2 py-1 text-[11px] font-semibold text-osrs-green transition hover:bg-osrs-green/30 active:osrs-bevel-inset disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sell all{sellableValue > 0 ? ` (${formatGp(sellableValue)})` : ""}
          </button>
          <button
            onClick={onClear}
            className="osrs-bevel bg-osrs-panel-dark/50 px-2 py-1 text-[11px] font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
          >
            Discard all
          </button>
        </div>
      </div>

      <div className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-4 gap-1.5">
            {inventory.map((slot, i) => (
              <Slot key={i} index={i} slot={slot} onRemove={onRemove} onSell={onSell} onOpen={onOpen} />
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
        <p className="mt-3 text-center text-[11px] text-osrs-parchment-dark/50">
          Drag to reorganize &middot; $ to sell &middot; &#127873; click to open &middot; double-click to discard
        </p>
      </div>
    </div>
  );
}
