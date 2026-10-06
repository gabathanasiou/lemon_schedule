import { ReportBlock } from '../types';
import { parseCellRefKey, parseLookupKey, parseToken } from './reportTokens';

// Designer-only ★ tip (roadmap 203): a text block or free table gets the star
// when its content CALCULATES anything — a `{{cellref…}}` reference or an `@`
// item lookup (`{{lookup…}}`). Plain `{{field}}` tokens are data, not
// calculation, and never star. Free tables star on cell references only.

/** Hover title for any block label carrying the ★. */
export const CALCULATED_CONTENT_TIP = 'Contains calculated values';

const TOKEN_RE = /\{\{([^}]+)\}\}/g;

function tokens(text: string): string[] {
  return Array.from(text.matchAll(TOKEN_RE), m => parseToken(m[1]).field);
}

export function hasCalculatedContent(block: ReportBlock): boolean {
  if (block.type === 'text') {
    return tokens(block.text || '').some(key => !!parseCellRefKey(key) || !!parseLookupKey(key));
  }
  if (block.type === 'table' && block.custom) {
    const texts = [
      ...(block.columns || []).map(c => c.label || ''),
      ...(block.customRows || []).flatMap(r => r.cells || []),
    ];
    return texts.some(text => tokens(text).some(key => !!parseCellRefKey(key)));
  }
  return false;
}
