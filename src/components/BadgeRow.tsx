import { topBadges, sortBadges } from "../data/badges";
import IconImg from "./IconImg";

interface BadgeRowProps {
  badges: string[];
  /** compact: one per family, tiny icons (for leaderboard rows). */
  compact?: boolean;
}

export default function BadgeRow({ badges, compact = true }: BadgeRowProps) {
  const shown = compact ? topBadges(badges) : sortBadges(badges);
  if (shown.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 align-middle">
      {shown.map((b) => (
        <span key={b.id} title={`${b.name}: ${b.description}`}>
          <IconImg src={b.icon} alt={b.name} className={compact ? "h-4 w-4" : "h-7 w-7"} />
        </span>
      ))}
    </span>
  );
}
