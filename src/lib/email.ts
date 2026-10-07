import { Resend } from 'resend';
import { PANOPLY_LOGO_BASE64 } from '@/lib/email-logo';
import { EMAIL_LOGO_CID } from '@/lib/email-template';
import { SUPPORT_EMAIL } from '@/lib/contact';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  /**
   * Skip the inline logo. For a message whose markup does not reference it -
   * an unused attachment is a paperclip icon on an email that has nothing
   * attached, which looks like a mistake to the person receiving it.
   */
  withoutLogo?: boolean;
}

export async function sendEmail({
  to,
  subject,
  html,
  withoutLogo,
}: SendEmailOptions): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not defined');
    return false;
  }

  /*
   * The sandbox sender is reported, loudly, every time it is used.
   *
   * Resend's shared onboarding address delivers only to the address that owns
   * the Resend account and rejects everything else. As a fallback it is worse
   * than useless in production: the send succeeds from the caller's point of
   * view - resend.emails.send accepts it - and nobody receives anything. This
   * deployment ran that way for its whole life. Every verification link,
   * deposit approval and withdrawal alert was generated, handed to Resend and
   * refused, and nothing in the logs said so.
   *
   * Still a fallback rather than a hard failure, because local development
   * without an EMAIL_FROM is a reasonable state and should not throw. The
   * difference is that it now leaves a line in the log naming the cause.
   */
  const from = process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev';
  if (/@resend\.dev>?\s*$/.test(from)) {
    console.error(
      `[email] Sending as ${from}, Resend's shared sandbox address. It delivers only to the ` +
        `address that owns the Resend account; mail to ${to} will be refused. Set EMAIL_FROM to ` +
        `an address on a domain verified in Resend.`
    );
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from,
      to: [to],
      /*
       * Replies reach a person.
       *
       * Transactional mail is sent from a no-reply address because the From
       * has to be one Resend is authorised for, and because a shared human
       * mailbox should not be the thing every automated message appears to
       * come from. Neither of those is a reason to throw away the replies.
       *
       * People do reply to these. The most valuable one is a reply to a
       * password reset that reads "I didn't ask for this" - which is a report
       * of an account under attack, arriving from the account's own owner,
       * and a no-reply address is a decision to never hear it.
       */
      replyTo: process.env.EMAIL_REPLY_TO || SUPPORT_EMAIL,
      subject,
      html,
      /*
       * The mark travels as a CID attachment rather than a data: URI.
       *
       * Gmail strips data: URIs out of HTML bodies entirely and shows a
       * broken-image icon in their place - on the masthead of every email the
       * product sends. A CID attachment is the one method every major client,
       * Gmail included, renders inline.
       *
       * Attached here rather than at each call site so a new email cannot be
       * written that references cid: and forgets to carry the image.
       */
      attachments: withoutLogo
        ? undefined
        : [
            {
              filename: 'panoply.png',
              content: PANOPLY_LOGO_BASE64,
              contentType: 'image/png',
              contentId: EMAIL_LOGO_CID,
            },
          ],
    });
    if (error) {
      console.error('Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to send email via Resend:', err);
    return false;
  }
}
