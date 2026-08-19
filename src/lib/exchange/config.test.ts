import { describe, it, expect } from 'vitest';
import { describeExchangeConfig, exchangeConfigFromEnv } from './config';

/*
 * This module decides whether the platform can move real money. Every test
 * here is a way that could happen by accident.
 */

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

const LIVE = {
  EXCHANGE_MODE: 'binance',
  EXCHANGE_NETWORK: 'mainnet',
  EXCHANGE_ALLOW_LIVE_TRADING: 'true',
  EXCHANGE_API_KEY: 'key',
  EXCHANGE_API_SECRET: 'secret',
};

describe('defaults', () => {
  it('is paper with nothing configured', () => {
    const config = exchangeConfigFromEnv(env({}));
    expect(config.mode).toBe('paper');
    expect(config.isLive).toBe(false);
  });

  it('falls back to paper for an unrecognised mode rather than guessing', () => {
    expect(exchangeConfigFromEnv(env({ EXCHANGE_MODE: 'kraken' })).mode).toBe('paper');
  });

  it('defaults a real venue to testnet', () => {
    const config = exchangeConfigFromEnv(env({ EXCHANGE_MODE: 'binance' }));
    expect(config.network).toBe('testnet');
    expect(config.isLive).toBe(false);
  });
});

describe('going live needs all three keys', () => {
  it('is live when every condition is met', () => {
    const config = exchangeConfigFromEnv(env(LIVE));
    expect(config.isLive).toBe(true);
    expect(config.network).toBe('mainnet');
    expect(config.liveRefusedReason).toBeNull();
  });

  /*
   * The case the third key exists for. Someone setting up credentials sets
   * mode and network; neither of those reads as "start trading real money".
   */
  it('refuses without the explicit opt-in, and says so', () => {
    const { EXCHANGE_ALLOW_LIVE_TRADING: _omitted, ...rest } = LIVE;
    const config = exchangeConfigFromEnv(env(rest));
    expect(config.isLive).toBe(false);
    expect(config.network).toBe('testnet');
    expect(config.liveRefusedReason).toMatch(/EXCHANGE_ALLOW_LIVE_TRADING/);
  });

  it('refuses when credentials are missing, and says so', () => {
    const config = exchangeConfigFromEnv(env({ ...LIVE, EXCHANGE_API_SECRET: '' }));
    expect(config.isLive).toBe(false);
    expect(config.liveRefusedReason).toMatch(/EXCHANGE_API_SECRET/);
  });

  it('refuses on testnet even with the opt-in and credentials', () => {
    const config = exchangeConfigFromEnv(env({ ...LIVE, EXCHANGE_NETWORK: 'testnet' }));
    expect(config.isLive).toBe(false);
  });

  it('refuses in paper mode even with everything else set', () => {
    const config = exchangeConfigFromEnv(env({ ...LIVE, EXCHANGE_MODE: 'paper' }));
    expect(config.isLive).toBe(false);
  });

  /*
   * "false" is a non-empty string and therefore truthy in JavaScript. This
   * gate is the difference between paper and customer funds.
   */
  it('treats the string "false" and other non-affirmatives as off', () => {
    for (const value of ['false', 'no', '0', 'off', '', 'maybe']) {
      const config = exchangeConfigFromEnv(env({ ...LIVE, EXCHANGE_ALLOW_LIVE_TRADING: value }));
      expect(config.isLive).toBe(false);
    }
  });

  it('accepts an affirmative in any case', () => {
    for (const value of ['true', 'TRUE', ' Yes ', '1']) {
      expect(
        exchangeConfigFromEnv(env({ ...LIVE, EXCHANGE_ALLOW_LIVE_TRADING: value })).isLive
      ).toBe(true);
    }
  });

  /*
   * A refused live attempt must not land on mainnet-without-consent. Testnet
   * is the only safe destination.
   */
  it('lands a refused live attempt on testnet, never mainnet', () => {
    const config = exchangeConfigFromEnv(env({ ...LIVE, EXCHANGE_ALLOW_LIVE_TRADING: 'false' }));
    expect(config.network).toBe('testnet');
  });
});

describe('paper cost model', () => {
  it('defaults to the real Binance spot taker fee', () => {
    // Paper results must not be quietly better than live ones.
    expect(exchangeConfigFromEnv(env({})).paperFeeRate).toBe(0.001);
  });

  it('accepts an override within a sane range', () => {
    expect(exchangeConfigFromEnv(env({ EXCHANGE_PAPER_FEE_RATE: '0.002' })).paperFeeRate).toBe(
      0.002
    );
  });

  /*
   * A negative fee models the venue paying the platform to trade, which
   * flatters every result the paper adapter produces.
   */
  it('rejects a negative, absurd or unparseable rate and keeps the default', () => {
    for (const value of ['-0.01', '5', 'abc', '']) {
      expect(exchangeConfigFromEnv(env({ EXCHANGE_PAPER_FEE_RATE: value })).paperFeeRate).toBe(
        0.001
      );
    }
  });
});

describe('describeExchangeConfig', () => {
  it('reports status without leaking any credential material', () => {
    const described = describeExchangeConfig(exchangeConfigFromEnv(env(LIVE)));
    expect(described).toEqual({
      mode: 'binance',
      network: 'mainnet',
      isLive: true,
      hasCredentials: true,
      liveRefusedReason: null,
    });
    // Not even a masked prefix: this ends up on a console page and in
    // screenshots.
    expect(JSON.stringify(described)).not.toContain('secret');
    expect(JSON.stringify(described)).not.toContain('key');
  });

  it('reports missing credentials without inventing them', () => {
    expect(describeExchangeConfig(exchangeConfigFromEnv(env({}))).hasCredentials).toBe(false);
  });
});
