export function LoadingState({ error }: { error?: string | null }) {
  if (error)
    return (
      <div className="mx-auto mt-20 max-w-md rounded-xl border bg-card p-6 text-center">
        <div className="text-[15px] font-semibold">Não foi possível carregar os dados</div>
        <p className="mt-1 text-[13px] text-muted-foreground">{error}</p>
      </div>
    );
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="h-14 w-72 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-[132px] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
