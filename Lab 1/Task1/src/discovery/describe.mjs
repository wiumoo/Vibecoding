/**
 * Discovery helpers — print URLs, JSON *structure* (keys / types / lengths) only.
 * Personal values are NEVER printed.
 */
export function safeUrl(u) {
  try {
    const x = new URL(u);
    const q = [...x.searchParams.keys()].sort();
    return `${x.origin}${x.pathname}${q.length ? '?' + q.join('&') : ''}`;
  } catch {
    return String(u).slice(0, 200);
  }
}

export function describeJson(v, depth = 0, maxDepth = 2) {
  const pad = '  '.repeat(depth);
  const out = [];
  if (Array.isArray(v)) {
    out.push(`${pad}[] len=${v.length}`);
    if (v.length && depth < maxDepth) {
      const sample = v[0];
      if (typeof sample === 'object' && sample !== null) {
        out.push(`${pad} sample[0]:`);
        out.push(describeJson(sample, depth + 1, maxDepth).join('\n'));
      } else {
        out.push(`${pad} sample value type=${typeof sample}`);
      }
    }
  } else if (v !== null && typeof v === 'object') {
    const keys = Object.keys(v);
    out.push(`${pad}{} keys=${keys.join(', ')}`);
    if (depth < maxDepth) {
      for (const k of keys.slice(0, 24)) {
        const val = v[k];
        if (Array.isArray(val)) out.push(`${pad}  ${k}: [] len=${val.length}`);
        else if (val !== null && typeof val === 'object') {
          out.push(`${pad}  ${k}:`);
          out.push(describeJson(val, depth + 1, maxDepth).join('\n'));
        } else out.push(`${pad}  ${k}: ${typeof val}${val === null ? '' : ''}`);
      }
    }
  } else {
    out.push(`${pad} value type=${typeof v}`);
  }
  return out;
}

/** Keys of nested arrays' first element flattened to leaf field names (for allowlists). */
export function leafFieldNames(v, prefix = '', out = new Set(), depth = 0) {
  if (depth > 6) return out;
  if (Array.isArray(v)) {
    if (v.length) leafFieldNames(v[0], prefix, out, depth + 1);
    return out;
  }
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      const p = prefix ? `${prefix}.${k}` : k;
      const val = v[k];
      if (val !== null && typeof val === 'object') leafFieldNames(val, p, out, depth + 1);
      else out.add(p);
    }
  } else if (prefix) out.add(prefix);
  return out;
}
