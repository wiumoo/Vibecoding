/**
 * smtp.mjs — the ONLY SMTP send path + Sent-folder post-processing (plan §7).
 * Nothing in draft/fetch/LLM imports this; mail:send is the sole caller.
 */
import nodemailer from 'nodemailer';
import { getCredential } from '../../../Task1/src/auth/keychain.mjs';

/**
 * Send one reply. Returns { messageId } (nodemailer's id; exmail rewrites it on
 * the stored/received copies — see plan §7.5, so it is NOT used for matching).
 * @param {object} settings
 * @param {{to:string[], cc?:string[], subject:string, text:string, inReplyTo?:string, references?:string[]}} mail
 */
export async function sendMail(settings, mail) {
  const { account, password } = await getCredential({ service: settings.keychain.service });
  const transport = nodemailer.createTransport({
    host: settings.smtp.host,
    port: settings.smtp.port,
    secure: settings.smtp.secure !== false,
    auth: { user: account, pass: password },
  });
  try {
    const info = await transport.sendMail({
      from: account,
      to: mail.to,
      cc: mail.cc && mail.cc.length ? mail.cc : undefined,
      subject: mail.subject,
      text: mail.text,
      inReplyTo: mail.inReplyTo || undefined,
      references: mail.references && mail.references.length ? mail.references : undefined,
    });
    return { messageId: info.messageId, accepted: info.accepted || [] };
  } finally {
    transport.close();
  }
}

/**
 * Best-effort APPEND of the sent message to the Sent folder (plan §7 step 5,
 * only when the server does NOT auto-save — settings.sentAutoSave === false).
 * Returns true on success. Never throws (post-processing is best-effort).
 */
export async function appendToSent(settings, client, sentFolder, rfc822) {
  if (!sentFolder) return false;
  try {
    await client.append(sentFolder, rfc822, ['\\Seen']);
    return true;
  } catch {
    return false;
  }
}

// Strip CR/LF from any value placed in a header line so a crafted subject/address
// cannot inject extra headers into the APPENDed copy (defense-in-depth; the only
// sink is the user's own Sent folder behind the human gate).
const hdr = (v) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ');

/** Build a minimal RFC822 string for the Sent APPEND (headers + text body). */
export function buildRfc822({ from, to, cc, subject, text, inReplyTo, references, date }) {
  const lines = [
    `From: ${hdr(from)}`,
    `To: ${to.map(hdr).join(', ')}`,
    cc && cc.length ? `Cc: ${cc.map(hdr).join(', ')}` : null,
    `Subject: ${hdr(subject)}`,
    `Date: ${hdr(date || new Date().toUTCString())}`,
    inReplyTo ? `In-Reply-To: ${hdr(inReplyTo)}` : null,
    references && references.length ? `References: ${references.map(hdr).join(' ')}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    text, // body: CRLF is legitimate here
  ].filter((l) => l !== null);
  return lines.join('\r\n');
}
