import type { ReactNode } from "react";

export default function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-cream sm:text-3xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
