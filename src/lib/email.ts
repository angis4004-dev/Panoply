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
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      // Resend requires a sender; falling back to its shared onboarding
      // address keeps a missing EMAIL_FROM from becoming a type error at the
      // call site and a silent failure at runtime.
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
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
