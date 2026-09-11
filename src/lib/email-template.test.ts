import { describe, it, expect } from 'vitest';
import { renderEmail } from '@/lib/email-template';

/**
 * Layout and escaping - the two ways this template has failed or could fail
 * without anything erroring.
 *
 * The first version shipped with a hard `width:560px` on the card. It looked
 * right in every browser preview and scrolled sideways on every phone, which
 * is where most of these are opened. Nothing about that is visible from the
 * sending side, so it gets a test.
 */

const render = (overrides: Partial<Parameters<typeof renderEmail>[0]> = {}) =>
  renderEmail({
    eyebrow: 'Welcome',
    title: 'One click to finish',
    preheader: 'Confirm your email address.',
    paragraphs: ['Your account is created.'],
    action: { label: 'Verify my email', url: 'https://panoply.finance/verify-email?token=abc' },
    ...overrides,
  });

describe('email layout', () => {
  it('never pins the card to a width wider than a phone', () => {
    // Any inline pixel width at or above ~400px on a layout element forces a
    // phone to scroll or shrink. The card must be fluid. `max-width` is the
    // opposite of the problem, so the lookbehind excludes it - a plain \b
    // would match the "width" inside "max-width" and flag the fix itself.
    const fixed = render().match(/style="[^"]*(?<![-\w])width:\s*(\d+)px/g) ?? [];
    const tooWide = fixed.filter((m) => Number(/(\d+)px/.exec(m)?.[1]) >= 400);
    expect(tooWide).toEqual([]);
  });

  it('is fluid up to 560px', () => {
    expect(render()).toContain('width:100%;max-width:560px;');
  });

  it('pins Outlook desktop at 560px, which ignores max-width', () => {
    // Without the conditional wrapper Outlook stretches the card across the
    // whole reading pane. It has to open and close, or Outlook's table nesting
    // breaks.
    const html = render();
    expect(html).toContain('<!--[if mso]><table');
    expect(html).toContain('width="560" align="center"');
    expect(html).toContain('<!--[if mso]></td></tr></table><![endif]-->');
  });

  it('wraps a long link rather than widening the email', () => {
    const token = 'a'.repeat(64);
    const html = render({
      action: { label: 'Go', url: `https://panoply.finance/x?token=${token}` },
    });
    expect(html).toContain('word-break:break-all');
    expect(html).toContain(token);
  });
});

describe('email escaping', () => {
  it('escapes markup in every caller-supplied string', () => {
    const html = render({
      title: '<script>alert(1)</script>',
      paragraphs: ['<img src=x onerror=alert(1)>'],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('allows **bold** and nothing else', () => {
    const html = render({ paragraphs: ['This is **important** and <b>this</b> is not.'] });
    expect(html).toMatch(/<strong[^>]*>important<\/strong>/);
    expect(html).toContain('&lt;b&gt;this&lt;/b&gt;');
  });

  it('cannot break out of the button href', () => {
    const html = render({ action: { label: 'Go', url: 'https://x.test/"onmouseover="alert(1)' } });
    expect(html).not.toContain('"onmouseover="');
    expect(html).toContain('&quot;onmouseover=&quot;');
  });
});
