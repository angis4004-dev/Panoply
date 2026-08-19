/**
 * What a wallet address is allowed to look like, per network.
 *
 * Pure functions over plain values - no database, no network catalog import.
 * That is what lets the rules be tested directly instead of only through an
 * API call, and it keeps this file usable from both the admin console (where
 * an operator publishes a custody address) and the trader app (where someone
 * saves a payout address).
 *
 * The problem this exists to solve is one specific, expensive mistake: a
 * correctly-formed address pasted against the wrong chain. An Ethereum address
 * entered as a Tron payout is not a typo the network will bounce - the
 * transfer succeeds, into an address nobody holds the key for, and the money
 * is gone. A length check does not catch it. A per-chain format check does.
 *
 * ## Why there is no admin-supplied regular expression
 *
 * The obvious way to let an operator add a chain the code has never heard of
 * is to let them type a pattern. It is also a way to hand an unprivileged
 * request a means of hanging the server: a pattern like `(a+)+$` against a
 * 200-character input backtracks for longer than anyone will wait, and the
 * validation runs on every address submission from then on. Detecting that
 * class of pattern reliably is not something a heuristic does well.
 *
 * So a custom network is described instead: an optional literal prefix, a
 * character set, and a length range. Every chain address format the platform
 * is likely to meet is expressible that way - EVM is `0x` + 40 hex, Tron is
 * `T` + 33 base58, Solana is 32-44 base58, bech32 is `bc1` + base32 - and
 * matching is a linear scan that cannot backtrack.
 */

/** The character sets real chain addresses are drawn from. */
export type AddressCharset = 'hex' | 'base58' | 'base32' | 'alphanumeric';

/**
 * How a network's addresses are checked.
 *
 * The three named families are presets so an operator adding USDT-on-Tron does
 * not have to know that Tron addresses are base58. `custom` is the escape
 * hatch for a chain this file has not been taught, and `none` disables format
 * checking entirely for a network where the operator would rather take the
 * risk than be blocked.
 */
export type AddressFamily = 'evm' | 'tron' | 'solana' | 'custom' | 'none';

export interface AddressRule {
  family: AddressFamily;
  /** Literal string the address must begin with. Case-sensitive. */
  prefix?: string;
  charset?: AddressCharset;
  /** Total address length, prefix included. */
  minLength?: number;
  maxLength?: number;
}

/**
 * Bitcoin's base58 alphabet: no 0, O, I or l, because those are the pairs a
 * human transcribes wrongly. Solana and Tron both use it.
 */
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** bech32, as used by native SegWit and Cosmos-family chains. */
const BASE32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const HEX = '0123456789abcdefABCDEF';
const ALPHANUMERIC = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const CHARSET_LABELS: Record<AddressCharset, string> = {
  hex: 'hexadecimal characters (0-9, a-f)',
  base58: 'base58 characters (no 0, O, I or l)',
  base32: 'bech32 characters',
  alphanumeric: 'letters and numbers',
};

/**
 * Membership as a Set per charset, built once.
 *
 * String.includes on a 58-character string per address character is fine at
 * this scale, but the sets make the hot path a hash lookup and cost nothing.
 */
const CHARSET_SETS: Record<AddressCharset, Set<string>> = {
  hex: new Set(HEX),
  base58: new Set(BASE58),
  base32: new Set(BASE32),
  alphanumeric: new Set(ALPHANUMERIC),
};

/**
 * The presets.
 *
 * EVM covers every chain running the Ethereum address scheme - Ethereum
 * itself, BNB Chain, Polygon, Arbitrum, Base and the rest - which is why the
 * family is named for the machine rather than for a chain. It also means a
 * network row for BEP20 and one for ERC20 share this rule, and an address
 * valid on one is structurally valid on the other. That is a true statement
 * about the chains, not a gap here: the same key really does control both
 * addresses, so a trader who picks the wrong one of those two still receives
 * their funds.
 */
const PRESETS: Record<'evm' | 'tron' | 'solana', Required<Omit<AddressRule, 'family'>>> = {
  evm: { prefix: '0x', charset: 'hex', minLength: 42, maxLength: 42 },
  tron: { prefix: 'T', charset: 'base58', minLength: 34, maxLength: 34 },
  // No prefix, and a range rather than a fixed length: a Solana address is a
  // base58-encoded 32-byte key, and leading zero bytes shorten the encoding.
  solana: { prefix: '', charset: 'base58', minLength: 32, maxLength: 44 },
};

/** Absolute bounds, applied whatever the family - including `none`. */
export const ADDRESS_MIN_LENGTH = 8;
export const ADDRESS_MAX_LENGTH = 200;

export const ADDRESS_FAMILY_LABELS: Record<AddressFamily, string> = {
  evm: 'EVM (Ethereum, BNB Chain, Polygon, Arbitrum, Base)',
  tron: 'Tron (TRC-10 / TRC-20)',
  solana: 'Solana (SPL)',
  custom: 'Custom - defined below',
  none: 'No format check',
};

export function isAddressFamily(value: unknown): value is AddressFamily {
  return (
    value === 'evm' ||
    value === 'tron' ||
    value === 'solana' ||
    value === 'custom' ||
    value === 'none'
  );
}

export function isAddressCharset(value: unknown): value is AddressCharset {
  return value === 'hex' || value === 'base58' || value === 'base32' || value === 'alphanumeric';
}

/**
 * Turn a stored rule into the concrete constraints to apply.
 *
 * Named families ignore whatever prefix and charset happen to be stored
 * alongside them. A row switched from `custom` to `tron` keeps its old custom
 * columns - reading them back would apply a rule the operator believes they
 * replaced.
 */
export function resolveAddressRule(rule: AddressRule): Required<Omit<AddressRule, 'family'>> & {
  family: AddressFamily;
} {
  if (rule.family === 'evm' || rule.family === 'tron' || rule.family === 'solana') {
    return { family: rule.family, ...PRESETS[rule.family] };
  }

  if (rule.family === 'none') {
    return {
      family: 'none',
      prefix: '',
      charset: 'alphanumeric',
      minLength: ADDRESS_MIN_LENGTH,
      maxLength: ADDRESS_MAX_LENGTH,
    };
  }

  return {
    family: 'custom',
    prefix: rule.prefix ?? '',
    charset: rule.charset ?? 'alphanumeric',
    minLength: rule.minLength ?? ADDRESS_MIN_LENGTH,
    maxLength: rule.maxLength ?? ADDRESS_MAX_LENGTH,
  };
}

/**
 * Whether a network definition is coherent, checked when an admin saves it.
 *
 * Separate from address validation because the failure is a different
 * person's problem: this one is an operator misconfiguring a network, and it
 * has to be caught at save time. A network whose rule can never match any
 * string would otherwise reject every address a trader ever enters, and the
 * trader would have no idea why.
 */
export function validateAddressRule(rule: AddressRule): string | null {
  if (!isAddressFamily(rule.family)) return 'Choose a valid address format.';
  if (rule.family !== 'custom') return null;

  const { prefix, charset, minLength, maxLength } = rule;

  if (prefix !== undefined && prefix.length > 8) {
    return 'The address prefix must be 8 characters or fewer.';
  }
  if (charset !== undefined && !isAddressCharset(charset)) {
    return 'Choose a valid character set.';
  }
  if (minLength === undefined || maxLength === undefined) {
    return 'A custom format needs a minimum and maximum length.';
  }
  if (!Number.isInteger(minLength) || !Number.isInteger(maxLength)) {
    return 'Address lengths must be whole numbers.';
  }
  if (minLength < ADDRESS_MIN_LENGTH || maxLength > ADDRESS_MAX_LENGTH) {
    return `Address lengths must be between ${ADDRESS_MIN_LENGTH} and ${ADDRESS_MAX_LENGTH}.`;
  }
  if (minLength > maxLength) {
    return 'The minimum length cannot exceed the maximum.';
  }
  // There is deliberately no "prefix longer than minLength" check. It cannot
  // happen: the prefix is capped at 8 characters and minLength has a floor of
  // ADDRESS_MIN_LENGTH, which is also 8. Keeping a guard for it would be a
  // branch no test could ever reach.
  if (prefix !== undefined && charset !== undefined) {
    const members = CHARSET_SETS[charset];
    for (const character of prefix) {
      if (!members.has(character)) {
        // Legitimate: Tron's 'T' is base58, bech32's 'bc1' is not all base32.
        // Only worth reporting for a set where it is certainly a mistake.
        if (charset === 'hex' && !HEX.includes(character)) {
          return `The prefix contains "${character}", which is not a hexadecimal character.`;
        }
      }
    }
  }
  return null;
}

/**
 * Whether an address satisfies a network's rule.
 *
 * Returns a message written for the person who typed it, naming what was
 * expected. "Invalid address" tells someone staring at an address they can see
 * with their own eyes is an address precisely nothing.
 *
 * `networkName` is only used to phrase the message.
 */
export function validateAddress(
  rule: AddressRule,
  address: string,
  networkName = 'this network'
): string | null {
  const value = address.trim();

  if (!value) return 'Enter a wallet address.';
  if (value.length < ADDRESS_MIN_LENGTH) return 'That address is too short to be valid.';
  if (value.length > ADDRESS_MAX_LENGTH) return 'That address is too long to be valid.';
  // Whitespace inside an address is always a paste accident, and a trailing
  // newline from a copied line is the common one. Caught before the charset
  // check so the message says what actually happened.
  if (/\s/.test(value)) return 'That address contains a space. Remove it and try again.';

  const resolved = resolveAddressRule(rule);
  if (resolved.family === 'none') return null;

  if (resolved.prefix && !value.startsWith(resolved.prefix)) {
    return `A ${networkName} address starts with "${resolved.prefix}". Check you have not pasted an address for a different network.`;
  }

  if (value.length < resolved.minLength || value.length > resolved.maxLength) {
    const expected =
      resolved.minLength === resolved.maxLength
        ? `exactly ${resolved.minLength} characters`
        : `between ${resolved.minLength} and ${resolved.maxLength} characters`;
    return `A ${networkName} address is ${expected}. This one is ${value.length}.`;
  }

  const members = CHARSET_SETS[resolved.charset];
  const body = value.slice(resolved.prefix.length);
  for (const character of body) {
    if (!members.has(character)) {
      return `"${character}" is not valid in a ${networkName} address, which uses ${CHARSET_LABELS[resolved.charset]}.`;
    }
  }

  return null;
}

/**
 * Which of the known families a given address could belong to.
 *
 * Used to tell someone who has picked the wrong network what they appear to
 * have pasted - "that looks like an EVM address" is the sentence that ends the
 * support conversation. Best-effort and deliberately not authoritative: the
 * families overlap, and a 34-character base58 string beginning with T is a
 * valid Solana address as well as a Tron one.
 */
export function guessAddressFamilies(address: string): AddressFamily[] {
  const value = address.trim();
  const families: AddressFamily[] = [];
  for (const family of ['evm', 'tron', 'solana'] as const) {
    if (validateAddress({ family }, value) === null) families.push(family);
  }
  return families;
}
