import { describe, it, expect } from 'vitest';
import {
  classifyHost,
  hostConfigFromEnv,
  isAdminHostConfigured,
  isAdminPath,
  isInfrastructurePath,
  normalizeHostname,
} from './host';
import {
  adminChallengeCookieName,
  adminCookieName,
  readAdminToken,
  readCookie,
  serializeAdminCookie,
  serializeClearedAdminCookie,
} from './cookie';

/**
 * Cross-subdomain session isolation, asserted at the two places it is decided:
 * which surface a request is on, and which cookie that surface reads.
 */

describe('normalizeHostname', () => {
  it('drops the port and lowercases', () => {
    expect(normalizeHostname('Admin.Example.COM:4028')).toBe('admin.example.com');
  });

  it('handles bracketed IPv6 literals', () => {
    expect(normalizeHostname('[::1]:4028')).toBe('[::1]');
  });

  it('returns empty for a missing header', () => {
    expect(normalizeHostname(null)).toBe('');
    expect(normalizeHostname(undefined)).toBe('');
    expect(normalizeHostname('   ')).toBe('');
  });
});

describe('classifyHost with an explicit ADMIN_HOST', () => {
  const config = { adminHost: 'admin.example.com', appHost: 'app.example.com' };

  it('routes the configured admin host to the admin surface', () => {
    expect(classifyHost('admin.example.com', config)).toBe('admin');
    expect(classifyHost('admin.example.com:443', config)).toBe('admin');
  });

  it('routes the trader host to the app surface', () => {
    expect(classifyHost('app.example.com', config)).toBe('app');
  });

  it('does not treat a lookalike as the admin surface', () => {
    // The failure this prevents: a wildcard DNS record, a preview deployment,
    // or an attacker-chosen Host serving the console.
    expect(classifyHost('admin.example.com.evil.test', config)).toBe('app');
    expect(classifyHost('evil-admin.example.com', config)).toBe('app');
    expect(classifyHost('admin.evil.test', config)).toBe('app');
    expect(classifyHost('xadmin.example.com', config)).toBe('app');
  });

  it('falls back to the app surface for a missing Host', () => {
    expect(classifyHost(null, config)).toBe('app');
  });
});

describe('classifyHost in development, with nothing configured', () => {
  it('accepts the admin. prefix so admin.localhost works', () => {
    expect(classifyHost('admin.localhost:4028', {})).toBe('admin');
    expect(classifyHost('admin.aegis.test', {})).toBe('admin');
  });

  it('still treats the plain host as the trader app', () => {
    expect(classifyHost('localhost:4028', {})).toBe('app');
    expect(classifyHost('app.localhost:4028', {})).toBe('app');
  });

  it('reports that the admin host is unconfigured, so production can refuse', () => {
    expect(isAdminHostConfigured({})).toBe(false);
    expect(isAdminHostConfigured({ adminHost: 'admin.example.com' })).toBe(true);
  });
});

describe('hostConfigFromEnv', () => {
  it('accepts a bare hostname or a full origin', () => {
    expect(
      hostConfigFromEnv({ ADMIN_HOST: 'admin.example.com' } as unknown as NodeJS.ProcessEnv)
        .adminHost
    ).toBe('admin.example.com');
    expect(
      hostConfigFromEnv({
        ADMIN_APP_URL: 'https://admin.example.com/',
      } as unknown as NodeJS.ProcessEnv).adminHost
    ).toBe('admin.example.com');
    expect(
      hostConfigFromEnv({
        NEXT_PUBLIC_APP_URL: 'http://localhost:4028',
      } as unknown as NodeJS.ProcessEnv).appHost
    ).toBe('localhost');
  });
});

describe('isAdminPath', () => {
  it('claims the console and its API', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/deposits')).toBe(true);
    expect(isAdminPath('/api/admin/deposits')).toBe(true);
  });

  it('does not claim trader routes that merely start with the same letters', () => {
    expect(isAdminPath('/administration')).toBe(false);
    expect(isAdminPath('/dashboard')).toBe(false);
    expect(isAdminPath('/api/deposits')).toBe(false);
  });

  it('separates framework paths, which both surfaces must serve', () => {
    expect(isInfrastructurePath('/_next/static/chunk.js')).toBe(true);
    expect(isInfrastructurePath('/favicon.ico')).toBe(true);
    expect(isInfrastructurePath('/dashboard')).toBe(false);
  });
});

describe('the admin cookie is not the trader cookie', () => {
  it('uses a distinct name in every environment', () => {
    expect(adminCookieName('development')).not.toBe('auth_session');
    expect(adminCookieName('production')).not.toBe('auth_session');
    expect(adminCookieName('production')).toBe('__Host-aegis_admin_session');
    expect(adminChallengeCookieName('production')).not.toBe(adminCookieName('production'));
  });

  it('never carries a Domain attribute, which is what keeps it host-only', () => {
    const cookie = serializeAdminCookie('t0ken', { maxAgeSeconds: 3600, nodeEnv: 'production' });
    expect(cookie).not.toMatch(/domain=/i);
    expect(serializeClearedAdminCookie('production')).not.toMatch(/domain=/i);
  });

  it('is HttpOnly, Secure, SameSite=Strict and root-pathed in production', () => {
    const cookie = serializeAdminCookie('t0ken', { maxAgeSeconds: 3600, nodeEnv: 'production' });
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=3600');
  });

  it('satisfies every condition the __Host- prefix imposes', () => {
    // If any of these ever stop holding, browsers reject the cookie outright -
    // which is the point: widening its scope breaks sign-in loudly.
    const cookie = serializeAdminCookie('t0ken', { maxAgeSeconds: 60, nodeEnv: 'production' });
    expect(cookie.startsWith('__Host-')).toBe(true);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toMatch(/domain=/i);
  });

  it('drops Secure in development so http://admin.localhost can sign in', () => {
    const cookie = serializeAdminCookie('t0ken', { maxAgeSeconds: 60, nodeEnv: 'development' });
    expect(cookie).not.toContain('Secure');
    expect(cookie.startsWith('aegis_admin_session=')).toBe(true);
  });

  it('expires the cookie with Max-Age=0 on sign-out', () => {
    expect(serializeClearedAdminCookie('development')).toContain('Max-Age=0');
  });
});

describe('reading the admin token from a Cookie header', () => {
  it('finds it among other cookies', () => {
    const header = 'theme=dark; aegis_admin_session=abc.def; other=1';
    expect(readAdminToken(header, 'development')).toBe('abc.def');
  });

  it('does not accept a trader session as an admin token', () => {
    // The single most important assertion in this file: a valid, current
    // trader cookie must buy nothing on the admin surface.
    const traderOnly = 'auth_session=eyJ1c2VyIjp7fX0.deadbeef; next-auth.session-token=xyz';
    expect(readAdminToken(traderOnly, 'development')).toBeNull();
    expect(readAdminToken(traderOnly, 'production')).toBeNull();
  });

  it('does not match a cookie whose name merely ends with the admin name', () => {
    expect(readAdminToken('x_aegis_admin_session=nope', 'development')).toBeNull();
  });

  it('requires the __Host- prefixed name in production', () => {
    // A cookie set by a development build, or by something on a parent domain
    // that cannot use the prefix, is not accepted by a production server.
    expect(readAdminToken('aegis_admin_session=abc', 'production')).toBeNull();
    expect(readAdminToken('__Host-aegis_admin_session=abc', 'production')).toBe('abc');
  });

  it('survives values containing = and returns null for an empty value', () => {
    expect(readCookie('k=a=b=c', 'k')).toBe('a=b=c');
    expect(readCookie('k=', 'k')).toBeNull();
    expect(readCookie(null, 'k')).toBeNull();
    expect(readCookie('malformed', 'k')).toBeNull();
  });
});
