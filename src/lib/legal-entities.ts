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

/**
 * Stands in for a legal entity name that has not been supplied yet.
 *
 * Deliberately loud and deliberately not a plausible company name. A legal
 * entity name in a Terms of Service is a legal record; a guessed one is worse
 * than an obviously missing one, because a guess ships silently. The
 * corporate-disclosure block renders this verbatim, so it is visible on the
 * page rather than buried in a comment, and `hasCompleteEntityNames` below
 * lets a build or test assert it never reaches production.
 */
export const ENTITY_NAME_REQUIRED = '[LEGAL NAME REQUIRED]';

export interface LegalEntity {
  /** Registered legal name. */
  name: string;
  /** What this entity does, in the reader's terms - not a job title. */
  role: string;
  /** Country of incorporation. */
  jurisdiction: string;
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
  name: ENTITY_NAME_REQUIRED,
  role: 'Technology and education',
  jurisdiction: 'United Arab Emirates',
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
  name: ENTITY_NAME_REQUIRED,
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
 * False while any entity name is still a placeholder.
 *
 * Exists so the gap is assertable rather than a thing someone has to remember
 * to look for before a release.
 */
export const hasCompleteEntityNames = (): boolean =>
  LEGAL_ENTITIES.every((entity) => entity.name !== ENTITY_NAME_REQUIRED);
