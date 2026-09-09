/**
 * signature.mjs — code-attached signature (plan §6.2 step 5, §6.4).
 * The LLM writes NO signature; code appends settings.signature, or falls back to
 * the profile name from Task1 runQuery('profile'). No literal name in code.
 */
import { runQuery } from '../../../Task1/src/query/db.mjs';
import { loadSettings as loadTask1Settings } from '../../../Task1/src/config.mjs';

function nameFromProfile(profileData) {
  if (!profileData) return null;
  const n = profileData.normalized || profileData;
  return n?.name || n?.XM || n?.姓名 || null;
}

/** Resolve the signature block. settings.signature wins; else profile name. */
export async function resolveSignature(settings) {
  if (settings.signature) return settings.signature;
  try {
    const t1 = await loadTask1Settings();
    const res = await runQuery(t1, 'profile');
    const name = res?.ok ? nameFromProfile(res.result.data) : null;
    if (name) return `Best regards,\n${name}`;
  } catch {
    /* no snapshot — fall through */
  }
  return 'Best regards,';
}

/** Append the signature to a body if not already present. */
export function attachSignature(body, signature) {
  const b = body.trimEnd();
  if (signature && b.includes(signature.trim())) return b + '\n';
  return `${b}\n\n${signature}\n`;
}
