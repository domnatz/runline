import type { ReactNode } from "react";

export function PageHeading({ title, detail, actions }: {
  title: string;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
      <div className="min-w-0">
        <h1 className="rl-page-title">{title}</h1>
        {detail && <p className="mt-1 text-sm text-neutral-600">{detail}</p>}
      </div>
      {actions}
    </header>
  );
}
