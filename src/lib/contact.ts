/**
 * The addresses a person can write to.
 *
 * Single source of truth, for the same reason legal-entities.ts is one: these
 * appear in the privacy policy, on transactional email, and anywhere else a
 * reader is told to get in touch, and an address that is right on one surface
 * and stale on another is worse than no address at all - it sends somebody's
 * question into a mailbox nobody opens.
 *
 * ## Sending and receiving are different systems here
 *
 * Outbound transactional mail goes through Resend, which is authorised for
 * panoply.finance by DKIM at `resend._domainkey` and a return path on
 * `send.panoply.finance`. None of that requires a mailbox to exist.
 *
 * Inbound mail is Spacemail: the domain's MX records point at
 * mx1/mx2.spacemail.com, not at the cPanel host the application runs on. So
 * every address below has to be created in Spaceship's email product. One
 * created in cPanel instead would accept nothing, because no mail from the
 * internet is ever routed there.
 *
 * The practical consequence: an address named here that has not been created
 * in Spacemail does not bounce politely, it fails delivery, and the sender is
 * a customer who thought they were reporting a problem.
 */

/**
 * The human address. Everything that is not specifically security or privacy.
 *
 * Also the Reply-To on every transactional email, which is the point of it
 * existing rather than sending from a no-reply address and discarding what
 * comes back. People reply to password reset emails - to ask why they got
 * one, which is exactly the message you want to receive.
 */
export const SUPPORT_EMAIL = 'support@panoply.finance';

/**
 * Vulnerability reports.
 *
 * Separate from support because the two want different response times and
 * different readers, and because a researcher who cannot find somewhere to
 * send a finding publishes it instead. Fine as a forwarder into the same
 * mailbox - what matters is that the address resolves.
 */
export const SECURITY_EMAIL = 'security@panoply.finance';

/**
 * Data protection requests: access, correction, deletion.
 *
 * Named in the privacy policy, which grants those rights and until now gave
 * no way to exercise them. A policy that says "contact us" and then does not
 * say how is not a policy anybody can act on.
 */
export const PRIVACY_EMAIL = 'privacy@panoply.finance';
