type AdVariant = "skyscraper-left" | "skyscraper-right" | "rectangle";

interface AdBannerProps {
  variant: AdVariant;
  className?: string;
}

const VARIANT_STYLE: Record<AdVariant, { wrapper: string; label: string }> = {
  // max-h (not a fixed h) so it never forces the fixed-height app shell to
  // overflow — it just shrinks to whatever room the sidebar actually has.
  "skyscraper-left": { wrapper: "hidden h-full max-h-[600px] w-[160px] shrink-0 xl:flex xl:flex-col", label: "160 x 600" },
  "skyscraper-right": { wrapper: "hidden h-full max-h-[600px] w-[160px] shrink-0 xl:flex xl:flex-col", label: "160 x 600" },
  rectangle: { wrapper: "flex h-[250px] w-full shrink-0", label: "300 x 250" },
};

/**
 * Placeholder ad slot. Drop a real ad network's script tag (AdSense, Ezoic, etc.)
 * into this component to monetize these spots — the layout already reserves the space.
 */
export default function AdBanner({ variant, className }: AdBannerProps) {
  const style = VARIANT_STYLE[variant];
  return (
    <aside aria-label="Advertisement space" className={`${style.wrapper} ${className ?? ""}`}>
      <div className="osrs-bevel-inset flex h-full w-full flex-col items-center justify-center gap-2 border-dashed bg-osrs-panel-dark/70 text-center">
        <span className="font-display text-[11px] uppercase tracking-widest text-osrs-parchment-dark/70">
          Advertisement
        </span>
        <span className="text-[10px] text-osrs-parchment-dark/50">{style.label}</span>
      </div>
    </aside>
  );
}
