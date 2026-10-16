import { initials } from "@/lib/format";
import { avatarColor, cn } from "@/lib/utils";

const ACCOUNT_COLORS = ["#8f3b37", "#b3602b", "#1d6b52", "#3b5bb3", "#6d4bb3"];

export function AccountAvatar({ name, index = 0, className }: { name: string; index?: number; className?: string }) {
  return (
    <span
      className={cn("grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold text-white", className)}
      style={{ background: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length] }}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

export function ContactAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn("grid size-5 shrink-0 place-items-center rounded-[5px] text-[9px] font-bold text-white", className)}
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
    </span>
  );
}
