interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      {/* Every dashboard page titles itself through here, so this is the one
          place the app picks up the display face the marketing site already
          uses. Weight 400 rather than 700: Instrument Serif ships a single
          weight, and asking for bold makes the browser fake it. */}
      <div>
        <h1 className="font-display text-[2rem] font-normal leading-[1.1] tracking-[-0.01em] text-white sm:text-[2.5rem]">
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
