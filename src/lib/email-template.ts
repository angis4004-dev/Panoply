import { BRAND_COLORS } from '@/lib/brand-colors';

/**
 * One layout for every transactional email Panoply sends.
 *
 * The auth emails each carried their own `<div style="font-family:
 * sans-serif">` with an `<h2>` and a link. Three near-identical templates, no
 * logo, no footer, nothing that looked like the product - the first thing a
 * new account holder saw from a platform asking them to deposit money was a
 * bare browser default. The portfolio report, meanwhile, had a proper branded
 * layout. This is that quality, extracted so there is one of it.
 *
 * ## Why it is written like 2005
 *
 * Tables, `role="presentation"`, inline styles on every element, fixed pixel
 * widths. Email clients are not browsers:
 *
 *   - Outlook renders through Word, which does not do flexbox, grid, or
 *     `max-width` on a div. A table with a fixed width is the only layout
 *     that survives it.
 *   - Gmail strips `<style>` blocks in several contexts, so anything that
 *     matters has to be inline. A `<style>` block is included, but only to
 *     tighten the padding on phones - nothing depends on it, and a client
 *     that discards it still gets a layout that fits.
 *   - Most of these are opened on a phone. The card is fluid - 100% wide up
 *     to 560px - with a conditional wrapper that pins Outlook desktop at
 *     560px, because Outlook ignores `max-width` and would otherwise stretch
 *     the card across a whole monitor. The version before this set a hard
 *     `width:560px`, which every phone either scrolled sideways or shrank
 *     until the text was unreadable.
 *   - Gmail also strips `data:` image URIs entirely, showing a broken-image
 *     icon. The logo is therefore a CID attachment - see sendEmail.
 *
 * Every one of those constraints is a thing that renders correctly in a
 * browser preview and breaks in somebody's inbox, which is the failure mode
 * worth designing against.
 */

/** Referenced as `cid:` in the markup; attached by sendEmail. */
export const EMAIL_LOGO_CID = 'panoply-mark';

const INK = '#101828';
const BODY_TEXT = '#475467';
const MUTED = '#98A2B3';
const HAIRLINE = '#E4E7EC';
const CANVAS = '#F5F7FA';

/**
 * Arial ahead of the system stack, deliberately.
 *
 * `-apple-system` and friends are ignored by Outlook, which then falls back to
 * Times New Roman - a serif in the middle of a sans-serif layout. Naming a
 * font every client actually has, first, is the difference between a
 * consistent email and one that looks broken on Windows.
 */
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

/**
 * A serif headline, because every other transactional email is not.
 *
 * The marketing site sets display type in Instrument Serif - a high-contrast
 * serif - while the body runs sans. Email cannot load a webfont reliably, so
 * Georgia stands in: it ships with every version of Windows, macOS, iOS and
 * Android, it was drawn for screens, and it carries the same editorial weight.
 *
 * This is the one decision that stops these looking like every other SaaS
 * notification. The generic version of this email is sans-serif all the way
 * down, and that is exactly what it reads as.
 */
const DISPLAY_FONT = "Georgia, 'Times New Roman', Times, serif";

/**
 * The tokens, for callers building `blocks`.
 *
 * Exported so a section rendered elsewhere uses the same ink, the same greys
 * and the same fonts as the card it sits in, rather than approximating them -
 * which is how the portfolio report ended up looking like a different
 * company's email.
 */
export const EMAIL_STYLE = {
  font: FONT,
  displayFont: DISPLAY_FONT,
  ink: INK,
  bodyText: BODY_TEXT,
  muted: MUTED,
  hairline: HAIRLINE,
  canvas: CANVAS,
} as const;

/**
 * A section heading inside the card. Sans and small, so it reads as a label
 * under the serif headline rather than competing with it.
 */
export function renderEmailHeading(text: string): string {
  return `<p style="margin:30px 0 12px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${INK};">${escapeHtml(text)}</p>`;
}

export interface EmailAction {
  label: string;
  url: string;
}

export interface EmailOptions {
  /**
   * Two or three words above the headline, uppercase and tracked out.
   *
   * Wayfinding. An inbox is a list of things competing for attention, and this
   * answers "what is this about" before the headline is read - the same job a
   * section label does on a page. It is also the device that makes a serif
   * headline read as editorial rather than accidental.
   */
  eyebrow: string;
  /** The `<h1>`. Short - it is read in a preview pane at a glance. */
  title: string;
  /**
   * The grey line under the subject in most inboxes. Without it, clients
   * scrape the first text in the body, which is usually the logo's alt text.
   */
  preheader: string;
  /** Body paragraphs. Each string becomes its own `<p>`. */
  paragraphs: string[];
  action?: EmailAction;
  /** Small print under the button, e.g. how long a link lasts. */
  actionNote?: string;
  /**
   * A bordered callout. **Warnings only** - something the reader must act on.
   *
   * Reassurance does not go here. "Your password is unchanged unless this link
   * is used" is comforting, and wrapping comfort in an amber box makes the
   * email look like it is shouting three separate times: masthead, button,
   * box. If everything shouts, nothing is heard. Reassurance is `footnote`.
   */
  alert?: string;
  /**
   * Richer sections placed after the paragraphs and before the button:
   * tables, charts, anything more than prose.
   *
   * **Trusted markup.** Unlike every other field, these are inserted as-is,
   * because a table cannot be expressed as escaped text. The caller owns the
   * escaping - build them from `escapeHtml` and the `EMAIL_STYLE` tokens
   * below, and never interpolate user input without passing it through
   * `escapeHtml` first.
   */
  blocks?: string[];
  /** A quiet closing line. Reassurance, caveats - anything that is not urgent. */
  footnote?: string;
  /** Fallback text for the plain-text part, when the caller has better wording. */
  plainTextIntro?: string;
}

/**
 * Text into HTML. Exported for callers building `blocks`, which is the only
 * place user input can reach this markup without going through it here.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Bold spans survive, everything else is escaped.
 *
 * Callers want to emphasise a clause - "someone knows your password" - without
 * being handed the ability to inject markup. `**text**` is the whole grammar.
 */
function renderCopy(text: string): string {
  return escapeHtml(text).replace(
    /\*\*(.+?)\*\*/g,
    `<strong style="color:${INK};font-weight:700;">$1</strong>`
  );
}

export function renderEmail(options: EmailOptions): string {
  const { eyebrow, title, preheader, paragraphs, action, actionNote, alert, blocks, footnote } =
    options;

  const body = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${BODY_TEXT};">${renderCopy(text)}</p>`
    )
    .join('');

  /*
   * The button is a table, not an <a> with padding.
   *
   * Outlook ignores padding on inline elements, which collapses a padded link
   * into bare underlined text - the call to action stops looking like a
   * button at exactly the moment it matters. A single-cell table with the
   * background on the <td> is the construction that holds everywhere.
   */
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
         <tr>
           <td align="center" bgcolor="${BRAND_COLORS.blue}" style="border-radius:10px;">
             <a href="${escapeHtml(action.url)}"
                style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:700;color:${BRAND_COLORS.cream};text-decoration:none;border-radius:10px;letter-spacing:0.01em;">
               ${escapeHtml(action.label)}
             </a>
           </td>
         </tr>
       </table>`
    : '';

  /*
   * The raw URL, printed under the button.
   *
   * Corporate mail filters rewrite links, and some clients refuse to open
   * them at all. Somebody locked out of their account needs a string they can
   * copy, not a button that silently does nothing. word-break stops a long
   * token forcing the whole email into horizontal scroll.
   */
  const fallbackLink = action
    ? `<p style="margin:16px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">
         Or paste this into your browser:<br />
         <span style="color:${BODY_TEXT};word-break:break-all;">${escapeHtml(action.url)}</span>
       </p>`
    : '';

  const noteBlock = actionNote
    ? `<p style="margin:14px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${renderCopy(actionNote)}</p>`
    : '';

  const alertBlock = alert
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:26px 0 0;">
         <tr>
           <td style="background:#FFF8E6;border:1px solid #F5D98A;border-left:4px solid #D9A441;border-radius:8px;padding:14px 16px;font-family:${FONT};font-size:13px;line-height:20px;color:#6B4E12;">
             ${renderCopy(alert)}
           </td>
         </tr>
       </table>`
    : '';

  const footnoteBlock = footnote
    ? `<p style="margin:26px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${renderCopy(footnote)}</p>`
    : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(title)}</title>
  <style>
    /* Progressive only. Clients that strip this still get a fluid card. */
    @media only screen and (max-width: 480px) {
      .p-card { padding-left: 22px !important; padding-right: 22px !important; }
      .p-card-top { padding-top: 30px !important; }
      .p-title { font-size: 26px !important; line-height: 32px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${CANVAS};">
  <!-- Preheader. Hidden, but read by the inbox list before the body is. -->
  <div style="display:none;font-size:1px;color:${CANVAS};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CANVAS};">
    <tr>
      <td align="center" style="padding:32px 12px;">

        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" align="center"><tr><td><![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:560px;">

          <!-- Masthead. The mark and the wordmark as one lockup, on the brand
               navy, so the email is recognisable before a word is read. -->
          <tr>
            <td align="center" bgcolor="${BRAND_COLORS.blue}" style="background:${BRAND_COLORS.blue};border-radius:14px 14px 0 0;padding:26px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td style="padding-right:11px;" valign="middle">
                    <img src="cid:${EMAIL_LOGO_CID}" width="34" height="34" alt="" style="display:block;border:0;" />
                  </td>
                  <td valign="middle" style="font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND_COLORS.cream};">
                    Panoply
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- A cyan hairline between masthead and card. The one flash of the
               accent colour, and what stops the navy meeting white flat. -->
          <tr>
            <td style="background:${BRAND_COLORS.cyan};font-size:0;line-height:0;height:3px;">&nbsp;</td>
          </tr>

          <tr>
            <td class="p-card p-card-top" bgcolor="#FFFFFF" style="background:#FFFFFF;padding:38px 34px 32px;">
              <p style="margin:0 0 10px;font-family:${FONT};font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_COLORS.blue};">
                ${escapeHtml(eyebrow)}
              </p>
              <!-- Serif, and larger than a sans headline would be. High-contrast
                   faces need the size to show their contrast at all. -->
              <h1 class="p-title" style="margin:0 0 20px;font-family:${DISPLAY_FONT};font-size:30px;line-height:36px;font-weight:400;color:${INK};letter-spacing:-0.01em;">
                ${escapeHtml(title)}
              </h1>
              ${body}
              ${(blocks ?? []).join('')}
              ${button}
              ${noteBlock}
              ${fallbackLink}
              ${alertBlock}
              ${footnoteBlock}
            </td>
          </tr>

          <!-- One line. The tagline that used to sit here was self-congratulatory
               and told the reader nothing they needed; the anti-phishing line
               is the only sentence in a footer that earns its place. -->
          <tr>
            <td class="p-card" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:0 0 14px 14px;padding:0 34px 30px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr><td style="border-top:1px solid ${HAIRLINE};font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
              </table>
              <p style="margin:18px 0 0;font-family:${FONT};font-size:12px;line-height:19px;color:${MUTED};">
                Panoply will never ask you for your password, PIN, or recovery codes by email.
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}
