import { describe, it, expect } from 'vitest';
import {
  adminSurfaceDenial,
  classifyHost,
  hostConfigFromEnv,
  isAdminHostConfigured,
  isAdminPath,
  isInfrastructurePath,
  normalizeHostname,
  resolveSurface,
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

/*
 * Path routing: the console served at /admin on the ordinary host.
 *
 * Exists for deployments that cannot have the subdomain at all - a Vercel
 * project on its default *.vercel.app URL being the case that forced it. It
 * removes an isolation boundary, so the tests that matter most here are the
 * ones asserting it stays off unless switched on deliberately.
 */
describe('resolveSurface with path routing off (the default)', () => {
  const config = { adminHost: 'admin.example.com', appHost: 'app.example.com' };

  it('routes by host, ignoring the path', () => {
    expect(resolveSurface('admin.example.com', '/admin', config)).toBe('admin');
    expect(resolveSurface('admin.example.com', '/dashboard', config)).toBe('admin');
    expect(resolveSurface('app.example.com', '/admin', config)).toBe('app');
    expect(resolveSurface('app.example.com', '/dashboard', config)).toBe('app');
  });

  it('is not enabled by an absent flag', () => {
    expect(resolveSurface('app.example.com', '/admin', config)).toBe('app');
  });
});

describe('resolveSurface with path routing on', () => {
  const config = { pathRouting: true };

  it('routes by path on any host', () => {
    expect(resolveSurface('aegis-crypto-ai.vercel.app', '/admin', config)).toBe('admin');
    expect(resolveSurface('aegis-crypto-ai.vercel.app', '/admin/networks', config)).toBe('admin');
    expect(resolveSurface('aegis-crypto-ai.vercel.app', '/api/admin/networks', config)).toBe(
      'admin'
    );
  });

  it('leaves every other path on the trader application', () => {
    expect(resolveSurface('aegis-crypto-ai.vercel.app', '/', config)).toBe('app');
    expect(resolveSurface('aegis-crypto-ai.vercel.app', '/dashboard', config)).toBe('app');
    expect(resolveSurface('aegis-crypto-ai.vercel.app', '/api/bots', config)).toBe('app');
  });

  /*
   * The near-miss that would otherwise reach the console: a trader route whose
   * name merely begins with the same letters.
   */
  it('does not treat a path that merely starts with the same letters as admin', () => {
    expect(resolveSurface('example.com', '/administration', config)).toBe('app');
    expect(resolveSurface('example.com', '/api/administrators', config)).toBe('app');
  });
});

describe('adminSurfaceDenial', () => {
  const configured = { adminHost: 'admin.example.com' };

  it('permits an admin path on the configured admin host', () => {
    expect(adminSurfaceDenial('admin.example.com', '/admin', configured, true)).toBeNull();
  });

  it('refuses a request addressed to the trader host', () => {
    expect(adminSurfaceDenial('app.example.com', '/admin', configured, true)).toMatch(
      /not addressed to the admin surface/
    );
  });

  /*
   * The exact production failure this was written after: everything correct
   * except ADMIN_HOST, and a 404 that said nothing about why. The message has
   * to name both ways out.
   */
  it('refuses in production when nothing is configured, and names the fix', () => {
    const denial = adminSurfaceDenial('admin.example.com', '/admin', {}, true);
    expect(denial).toMatch(/ADMIN_HOST is not configured/);
    expect(denial).toMatch(/ADMIN_PATH_ROUTING=true/);
  });

  it('allows the development fallback outside production', () => {
    expect(adminSurfaceDenial('admin.localhost', '/admin', {}, false)).toBeNull();
  });

  /*
   * Path routing is itself an explicit statement of where the console lives,
   * so it satisfies the fail-closed requirement the same way ADMIN_HOST does.
   * Without this the flag would be inert in production - the only place it is
   * for.
   */
  it('accepts path routing as configuration in production, with no ADMIN_HOST', () => {
    expect(
      adminSurfaceDenial('aegis-crypto-ai.vercel.app', '/admin', { pathRouting: true }, true)
    ).toBeNull();
    expect(
      adminSurfaceDenial(
        'aegis-crypto-ai.vercel.app',
        '/api/admin/networks',
        { pathRouting: true },
        true
      )
    ).toBeNull();
  });

  it('still refuses a non-admin path under path routing', () => {
    expect(
      adminSurfaceDenial('aegis-crypto-ai.vercel.app', '/dashboard', { pathRouting: true }, true)
    ).toMatch(/not addressed to the admin surface/);
  });
});

describe('ADMIN_PATH_ROUTING is read strictly', () => {
  /*
   * An environment variable set to false contains the string "false", which is
   * truthy in JavaScript. For a flag that removes an isolation boundary the
   * failure mode has to be "stayed off".
   */
  it('is off for the string "false" and other non-affirmatives', () => {
    for (const value of ['false', 'no', '0', 'off', '', 'maybe']) {
      expect(
        hostConfigFromEnv({ ADMIN_PATH_ROUTING: value } as unknown as NodeJS.ProcessEnv).pathRouting
      ).toBe(false);
    }
  });

  it('is off when the variable is absent entirely', () => {
    expect(hostConfigFromEnv({} as unknown as NodeJS.ProcessEnv).pathRouting).toBe(false);
  });

  it('is on only for an explicit affirmative, in any case', () => {
    for (const value of ['true', 'TRUE', ' True ', '1', 'yes']) {
      expect(
        hostConfigFromEnv({ ADMIN_PATH_ROUTING: value } as unknown as NodeJS.ProcessEnv).pathRouting
      ).toBe(true);
    }
  });
});
