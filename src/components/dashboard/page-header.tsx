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

          The display role resolves to the same family as body text, so the
          separation has to come from weight and tracking instead. 700 is the
          top of Archivo's loaded range, and the negative tracking is doing
          real work: grotesques set at 2.5rem with default spacing read loose
          and unfinished, because the sidebearings were drawn for text sizes
          and do not scale down with the optical size. */}
      <div>
        <h1 className="font-display text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] text-white sm:text-[2.5rem]">
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
