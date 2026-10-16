import type * as React from "react";

/** Título no padrão do original: segunda parte em verde (ex.: "Entradas e <saídas>"). */
export function PageHeader({
  eyebrow,
  title,
  accent,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  accent?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-eyebrow uppercase text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-title text-balance">
          {title} {accent && <em className="font-normal not-italic text-primary">{accent}</em>}
        </h1>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
