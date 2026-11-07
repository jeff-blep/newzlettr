import type { DB } from "../db/index.js";
import { createTransport, describeSmtpError, fromHeader, smtpConfigured } from "../integrations/mail.js";
import { logger } from "../logging.js";
import type { MailAttachment } from "../render/images.js";
import { getSection } from "../settings.js";

const log = logger("mail");

export interface OutgoingMail {
  to: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

/**
 * Dev/test safety valve: when set, EVERY email goes only to this address (with the intended
 * audience noted in the subject). Never set this in production.
 */
export function redirectTarget(): string | null {
  const v = process.env.NEWZLETTR_REDIRECT_ALL_MAIL_TO?.trim();
  return v ? v : null;
}

/** The only function in the app that sends email. */
export async function sendMail(db: DB, mail: OutgoingMail): Promise<{ messageId: string; delivered: number; redirected: boolean }> {
  const smtp = getSection(db, "smtp");
  if (!smtpConfigured(smtp)) throw new Error("Email (SMTP) isn't configured");

  let { to, bcc = [], subject } = mail;
  const intended = to.length + bcc.length;
  const redirect = redirectTarget();
  if (redirect) {
    subject = `[DEV → would go to ${intended} recipient${intended === 1 ? "" : "s"}] ${subject}`;
    to = [redirect];
    bcc = [];
  }
  if (!to.length && !bcc.length) throw new Error("No recipients");

  const transport = createTransport(smtp);
  try {
    const info = await transport.sendMail({
      from: fromHeader(smtp),
      // BCC sends still need a visible To; use the sender so nobody sees the list.
      to: to.length ? to.join(", ") : fromHeader(smtp),
      bcc: bcc.length ? bcc.join(", ") : undefined,
      subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid })),
      headers: { "X-Mailer": "Newzlettr" },
    });
    log.info({ messageId: info.messageId, recipients: redirect ? 1 : intended, redirected: !!redirect }, "email sent");
    return { messageId: info.messageId, delivered: redirect ? 1 : intended, redirected: !!redirect };
  } catch (e) {
    throw new Error(describeSmtpError(e, smtp));
  } finally {
    transport.close();
  }
}
