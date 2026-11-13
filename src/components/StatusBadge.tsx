import { Check, CircleHelp, X } from "lucide-react";
import type { Status } from "@/lib/types";

// The small coloured pill that shows whether an idea is planned,
// supported, contradicted, etc.

const styles: Record<Status, { label: string; className: string; icon?: React.ReactNode }> = {
  untested: {
    label: "Untested",
    className: "bg-slate-50 text-slate-500 border-slate-200",
  },
  planned: {
    label: "Planned",
    className: "bg-slate-50 text-slate-600 border-slate-300",
  },
  supported: {
    label: "Supported",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: <Check className="size-2.5" strokeWidth={3} />,
  },
  contradicted: {
    label: "Contradicted",
    className: "bg-rose-50 text-rose-700 border-rose-200",
    icon: <X className="size-2.5" strokeWidth={3} />,
  },
  inconclusive: {
    label: "Unclear",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <CircleHelp className="size-2.5" strokeWidth={2.5} />,
  },
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: Status;
  size?: "sm" | "md";
}) {
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wide ${s.className} ${
        size === "sm" ? "px-1.5 py-px text-[8.5px]" : "px-2 py-0.5 text-[10px]"
      }`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}
