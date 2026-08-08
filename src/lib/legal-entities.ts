/**
 * The companies behind Aegis.
 *
 * Single source of truth for corporate disclosure. Terms, Privacy, the
 * Disclaimer and the site footer all render from here, so the operating
 * entities cannot drift between pages - and updating a registered address
 * means editing one file rather than hunting four.
 *
 * Aegis is operated by two entities split by function. That split is the
 * disclosure: a reader needs to know which company holds their money, and it
 * is not the same one that provides the software.
 */

export interface LegalEntity {
  /**
   * Registered legal name, or null while it has not been supplied.
   *
   * Null is a supported state, not a placeholder: the disclosure renders
   * without a name rather than with an invented one. A registration number is
   * itself a legal identifier, so "a company incorporated in Saint Lucia under
   * registration 2025-00579" identifies the entity precisely and can be
   * checked against the register. A guessed company name could not.
   *
   * Set both to real names and every surface picks them up with no other
   * change.
   */
  name: string | null;
  /** What this entity does, in the reader's terms - not a job title. */
  role: string;
  /** Country of incorporation, as it reads in a labelled field. */
  jurisdiction: string;
  /**
   * The same country as it reads mid-sentence, where some names need an
   * article: "incorporated in *the* United Arab Emirates", but "incorporated
   * in Saint Lucia". Omit when the plain name already reads correctly.
   */
  jurisdictionInProse?: string;
  /** Registration or licence number, labelled as the register issues it. */
  registration: string;
  /** Registered address, as filed. */
  address: string;
  /** The entity's own description of its activity. */
  activity: string;
}

/**
 * The technology and education company.
 *
 * NOTE: the activity line below states that this entity operates TradeLocker
 * and Bybit. Bybit is a third-party exchange - if the actual relationship is
 * integration, order routing, or education rather than operation, this wording
 * asserts something about a company that is not ours to describe. Raised and
 * left as supplied pending confirmation.
 */
export const TECHNOLOGY_ENTITY: LegalEntity = {
  name: null,
  role: 'Technology and education',
  jurisdiction: 'United Arab Emirates',
  jurisdictionInProse: 'the United Arab Emirates',
  registration: 'Licence 35886',
  address: 'Office No. 80 2906F Marina Plaza, Dubai Marina, Dubai, United Arab Emirates',
  activity:
    'A technology and education company. Operates the following trading platforms: TradeLocker and Bybit.',
};

/**
 * The platform operator - the entity that holds and administers client funds.
 *
 * This is the one a reader most needs identified, which is why the disclosure
 * component labels it explicitly rather than listing both entities neutrally.
 */
export const PLATFORM_ENTITY: LegalEntity = {
  name: null,
  role: 'Platform operator',
  jurisdiction: 'Saint Lucia',
  registration: 'Reg. 2025-00579',
  address:
    'Ground Floor, The Sotheby Building, Rodney Village, Rodney Bay, Gros-Islet, Saint Lucia',
  activity:
    'The designated entity for operating additional trading platforms currently being integrated.',
};

/** Both entities, in the order they are disclosed. */
export const LEGAL_ENTITIES: LegalEntity[] = [TECHNOLOGY_ENTITY, PLATFORM_ENTITY];

/**
 * A short phrase identifying an entity, with or without its registered name.
 *
 * With a name: "Example Ltd (Saint Lucia, Reg. 2025-00579)".
 * Without:     "a company incorporated in Saint Lucia (Reg. 2025-00579)".
 *
 * Both forms are accurate and both identify the company against its register,
 * so no caller has to branch on whether the name is known yet.
 */
export function describeEntity(entity: LegalEntity): string {
  const where = entity.jurisdictionInProse ?? entity.jurisdiction;
  return entity.name
    ? `${entity.name} (${entity.jurisdiction}, ${entity.registration})`
    : `a company incorporated in ${where} (${entity.registration})`;
}

/**
 * False while any registered name is still missing.
 *
 * The disclosure is accurate without the names, so this is not a release
 * blocker - it is here so "have the names landed yet" is a question the code
 * can answer rather than something to remember to check.
 */
export const hasCompleteEntityNames = (): boolean =>
  LEGAL_ENTITIES.every((entity) => entity.name !== null);
