interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ title, message, confirmLabel = "Confirm", onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div
        className="osrs-bevel osrs-panel w-full max-w-sm p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 font-display text-lg font-bold text-osrs-red">{title}</h2>
        <p className="mb-5 text-sm text-osrs-parchment-dark/80">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="osrs-bevel flex-1 bg-osrs-panel-dark/60 py-2 font-display text-sm font-bold uppercase tracking-wide text-osrs-parchment transition hover:bg-osrs-panel-dark active:osrs-bevel-inset"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="osrs-bevel flex-1 bg-gradient-to-b from-osrs-red/30 to-osrs-red/10 py-2 font-display text-sm font-bold uppercase tracking-wide text-osrs-red transition hover:from-osrs-red/40 hover:to-osrs-red/20 active:osrs-bevel-inset"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
