interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      {/* Every dashboard page titles itself through here, so this is the one
          place the app's heading treatment is defined.

          The display role is the upright serif, as on the marketing pages.
          Set a step larger than a sans title would be, because the serif's
          x-height is small, and at 500 with near-default tracking: a serif
          pulled as tight as a grotesque starts touching at the serifs. */}
      <div>
        <h1 className="font-display text-[2.3rem] font-medium leading-[1.05] tracking-[-0.01em] text-ds-text sm:text-[2.85rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-ds-text-muted">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
