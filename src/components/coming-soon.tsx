import { Hammer } from "lucide-react";
import { PageHeader } from "./page-header";

export function ComingSoon({ title, accent, phase, items }: { title: string; accent?: string; phase: string; items: string[] }) {
  return (
    <>
      <PageHeader title={title} accent={accent} />
      <div className="rounded-xl border border-dashed bg-card p-8">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <Hammer className="size-4 text-muted-foreground" /> Em construção · {phase}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
