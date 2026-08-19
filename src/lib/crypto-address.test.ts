import { describe, it, expect } from 'vitest';
import {
  validateAddress,
  validateAddressRule,
  resolveAddressRule,
  guessAddressFamilies,
  isAddressFamily,
  isAddressCharset,
  ADDRESS_MAX_LENGTH,
  type AddressRule,
} from './crypto-address';

/*
 * Real, public addresses. Contrived strings of the right length would pass a
 * rule written against the same wrong assumption that produced them, which is
 * the one thing these tests exist to prevent.
 */
const EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // ENS: vitalik.eth
const TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT TRC-20 contract
const SOLANA = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'; // SPL Token program

describe('validateAddress - the named families accept their own chains', () => {
  it('accepts a real EVM address', () => {
    expect(validateAddress({ family: 'evm' }, EVM)).toBeNull();
  });

  it('accepts a real Tron address', () => {
    expect(validateAddress({ family: 'tron' }, TRON)).toBeNull();
  });

  it('accepts a real Solana address', () => {
    expect(validateAddress({ family: 'solana' }, SOLANA)).toBeNull();
  });

  it('accepts an EVM address in either case, since both are valid on chain', () => {
    expect(validateAddress({ family: 'evm' }, EVM.toLowerCase())).toBeNull();
    expect(validateAddress({ family: 'evm' }, '0x' + EVM.slice(2).toUpperCase())).toBeNull();
  });
});

/*
 * The whole point of the feature. Each of these is a transfer that succeeds
 * on chain and is unrecoverable.
 */
describe('validateAddress - cross-chain paste is rejected', () => {
  it('refuses an EVM address on Tron', () => {
    expect(validateAddress({ family: 'tron' }, EVM, 'Tron')).toMatch(/starts with "T"/);
  });

  it('refuses a Tron address on EVM', () => {
    expect(validateAddress({ family: 'evm' }, TRON, 'ERC-20')).toMatch(/starts with "0x"/);
  });

  it('refuses an EVM address on Solana', () => {
    // No prefix to fail on, so this one is caught by the charset: '0' is not
    // in base58, which is exactly why base58 omits it.
    expect(validateAddress({ family: 'solana' }, EVM, 'Solana')).toMatch(/not valid/);
  });

  it('refuses a Solana address on Tron for length even when it starts with T', () => {
    expect(validateAddress({ family: 'tron' }, SOLANA, 'Tron')).toMatch(/exactly 34 characters/);
  });
});

describe('validateAddress - malformed input', () => {
  const evm: AddressRule = { family: 'evm' };

  it('rejects an empty address', () => {
    expect(validateAddress(evm, '')).toMatch(/Enter a wallet address/);
    expect(validateAddress(evm, '   ')).toMatch(/Enter a wallet address/);
  });

  it('trims surrounding whitespace rather than rejecting it', () => {
    expect(validateAddress(evm, `  ${EVM}\n`)).toBeNull();
  });

  it('rejects whitespace inside the address with a specific message', () => {
    const split = `${EVM.slice(0, 20)} ${EVM.slice(20)}`;
    expect(validateAddress(evm, split)).toMatch(/contains a space/);
  });

  it('rejects an EVM address one character short', () => {
    expect(validateAddress(evm, EVM.slice(0, -1), 'ERC-20')).toMatch(/exactly 42 characters/);
  });

  it('rejects a non-hex character in an EVM address', () => {
    const bad = EVM.slice(0, -1) + 'z';
    expect(validateAddress(evm, bad, 'ERC-20')).toMatch(/"z" is not valid/);
  });

  it('rejects base58 look-alike characters that base58 deliberately omits', () => {
    // 'O' and '0' are the pair base58 exists to disambiguate.
    const bad = 'O' + SOLANA.slice(1);
    expect(validateAddress({ family: 'solana' }, bad, 'Solana')).toMatch(/not valid/);
  });

  it('rejects anything beyond the absolute maximum length', () => {
    expect(validateAddress({ family: 'none' }, 'a'.repeat(ADDRESS_MAX_LENGTH + 1))).toMatch(
      /too long/
    );
  });
});

describe('validateAddress - the none family', () => {
  it('accepts anything within the absolute length bounds', () => {
    expect(validateAddress({ family: 'none' }, EVM)).toBeNull();
    expect(validateAddress({ family: 'none' }, TRON)).toBeNull();
    expect(validateAddress({ family: 'none' }, 'some-unusual-chain-address-0000')).toBeNull();
  });

  it('still enforces the minimum, so an obvious mistake is caught', () => {
    expect(validateAddress({ family: 'none' }, 'abc')).toMatch(/too short/);
  });
});

describe('validateAddress - custom rules', () => {
  // bech32, as a chain the presets do not cover.
  const bech32: AddressRule = {
    family: 'custom',
    prefix: 'bc1',
    charset: 'base32',
    minLength: 42,
    maxLength: 62,
  };

  it('accepts an address matching a custom rule', () => {
    expect(validateAddress(bech32, 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBeNull();
  });

  it('enforces the custom prefix', () => {
    expect(
      validateAddress(bech32, 'tb1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', 'Bitcoin')
    ).toMatch(/starts with "bc1"/);
  });

  it('reports a length range rather than an exact length when they differ', () => {
    expect(validateAddress(bech32, 'bc1qar0srrr', 'Bitcoin')).toMatch(/between 42 and 62/);
  });

  it('falls back to permissive defaults when a custom rule is underspecified', () => {
    expect(validateAddress({ family: 'custom' }, 'abcdefgh1234')).toBeNull();
  });
});

/*
 * A row switched from custom to a named family keeps its old custom columns.
 * Reading them back would enforce a rule the operator believes they replaced.
 */
describe('resolveAddressRule ignores stale custom columns on a named family', () => {
  it('uses the preset, not the leftover prefix', () => {
    const stale: AddressRule = {
      family: 'tron',
      prefix: 'bc1',
      charset: 'base32',
      minLength: 60,
      maxLength: 62,
    };
    const resolved = resolveAddressRule(stale);
    expect(resolved.prefix).toBe('T');
    expect(resolved.charset).toBe('base58');
    expect(validateAddress(stale, TRON)).toBeNull();
  });
});

describe('validateAddressRule - catching an operator misconfiguring a network', () => {
  it('accepts the named families without further checks', () => {
    expect(validateAddressRule({ family: 'evm' })).toBeNull();
    expect(validateAddressRule({ family: 'none' })).toBeNull();
  });

  it('accepts a well-formed custom rule', () => {
    expect(
      validateAddressRule({
        family: 'custom',
        prefix: 'bc1',
        charset: 'base32',
        minLength: 42,
        maxLength: 62,
      })
    ).toBeNull();
  });

  it('requires lengths on a custom rule', () => {
    expect(validateAddressRule({ family: 'custom', prefix: 'x', charset: 'hex' })).toMatch(
      /minimum and maximum length/
    );
  });

  it('refuses an inverted length range', () => {
    expect(
      validateAddressRule({ family: 'custom', charset: 'hex', minLength: 50, maxLength: 20 })
    ).toMatch(/cannot exceed the maximum/);
  });

  it('refuses lengths outside the absolute bounds', () => {
    expect(
      validateAddressRule({ family: 'custom', charset: 'hex', minLength: 2, maxLength: 40 })
    ).toMatch(/between 8 and 200/);
    expect(
      validateAddressRule({ family: 'custom', charset: 'hex', minLength: 10, maxLength: 500 })
    ).toMatch(/between 8 and 200/);
  });

  it('refuses a non-hex prefix on a hex charset', () => {
    expect(
      validateAddressRule({
        family: 'custom',
        prefix: 'zz',
        charset: 'hex',
        minLength: 10,
        maxLength: 40,
      })
    ).toMatch(/not a hexadecimal character/);
  });
});

describe('guessAddressFamilies', () => {
  it('identifies an EVM address', () => {
    expect(guessAddressFamilies(EVM)).toEqual(['evm']);
  });

  /*
   * Honest about the overlap rather than pretending to a certainty it does not
   * have: a Tron address is a 34-character base58 string, which is also a
   * structurally valid Solana address.
   */
  it('reports both families for a Tron address, which is also valid base58 for Solana', () => {
    expect(guessAddressFamilies(TRON)).toEqual(['tron', 'solana']);
  });

  it('identifies a Solana address that is too long to be Tron', () => {
    expect(guessAddressFamilies(SOLANA)).toEqual(['solana']);
  });

  it('returns nothing for a string that is no known format', () => {
    expect(guessAddressFamilies('not-an-address')).toEqual([]);
  });
});

describe('type guards', () => {
  it('isAddressFamily accepts only the five families', () => {
    expect(isAddressFamily('evm')).toBe(true);
    expect(isAddressFamily('custom')).toBe(true);
    expect(isAddressFamily('none')).toBe(true);
    expect(isAddressFamily('bitcoin')).toBe(false);
    expect(isAddressFamily(undefined)).toBe(false);
  });

  it('isAddressCharset accepts only the four charsets', () => {
    expect(isAddressCharset('base58')).toBe(true);
    expect(isAddressCharset('utf8')).toBe(false);
  });
});
