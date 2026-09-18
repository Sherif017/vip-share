export default function FilterChip({
  children,
  active = false,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <span
      aria-current={active ? "true" : undefined}
      aria-disabled={!active}
      className={`inline-flex shrink-0 items-center rounded-full px-4 py-2 text-sm transition-colors ${
        active
          ? "bg-champagne text-ink"
          : "bg-surface text-muted ring-1 ring-inset ring-white/[0.06]"
      }`}
    >
      {children}
    </span>
  );
}
