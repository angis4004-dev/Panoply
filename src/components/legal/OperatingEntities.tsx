import { LEGAL_ENTITIES, PLATFORM_ENTITY } from '@/lib/legal-entities';

/**
 * Corporate disclosure block, rendered identically on Terms, Privacy and the
 * Disclaimer.
 *
 * Shared rather than copied into each page: three hand-maintained copies of a
 * registered address is three chances for them to disagree, and a legal page
 * that contradicts another legal page is worse than one that says nothing.
 *
 * The two entities are not presented as an equal pair. Which company holds a
 * user's money is the fact this block exists to convey, so the fund-holding
 * entity is called out in a closing line rather than left for the reader to
 * infer from two similar-looking cards.
 */
export function OperatingEntities() {
  return (
    <section>
      <h2>Operating entities</h2>
      <p>
        Aegis is operated by two companies, split by function. Their registered details are set out
        below.
      </p>

      {/* <dl> rather than a table: this is four label/value pairs per entity,
          not tabular data, and a table would need a horizontal scroll
          container to survive 375px. */}
      <div className="mt-4 space-y-4">
        {LEGAL_ENTITIES.map((entity) => (
          <div
            key={entity.jurisdiction}
            className="rounded-lg border border-[#212A35] bg-[#122131]/40 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-[#8B95A5]">
              {entity.role}
            </p>
            <p className="mt-1 font-semibold text-[#E7ECF2]">{entity.name}</p>

            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="shrink-0 text-[#8B95A5] sm:w-32">Incorporated in</dt>
                <dd className="text-[#C5CCD6]">{entity.jurisdiction}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="shrink-0 text-[#8B95A5] sm:w-32">Registration</dt>
                <dd className="text-[#C5CCD6]">{entity.registration}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="shrink-0 text-[#8B95A5] sm:w-32">Registered office</dt>
                <dd className="text-[#C5CCD6]">{entity.address}</dd>
              </div>
              <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="shrink-0 text-[#8B95A5] sm:w-32">Activity</dt>
                <dd className="text-[#C5CCD6]">{entity.activity}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <p className="mt-4">
        Client funds are held and administered by <strong>{PLATFORM_ENTITY.name}</strong>,
        incorporated in {PLATFORM_ENTITY.jurisdiction}. Contractual counterparty and the entity
        responsible for your account balance is {PLATFORM_ENTITY.name} unless stated otherwise in
        writing.
      </p>
    </section>
  );
}
