const FENCE = /^\s*```(?:json)?\s*|\s*```\s*$/g;

function stripFences(text: string): string {
  return text.replace(FENCE, "").trim();
}

function dropTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Returns the first balanced object or array, ignoring braces that appear
 * inside strings, so prose either side of the payload does not break parsing.
 */
function firstBalanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (character === opener) depth += 1;
    else if (character === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

/**
 * Models occasionally wrap JSON in prose or a code fence even when asked for
 * JSON only. Repair is attempted before a retry is spent.
 */
export function parseJsonLoosely(text: string): unknown {
  const attempts: string[] = [];
  const stripped = stripFences(text);

  attempts.push(stripped, dropTrailingCommas(stripped));

  const balanced = firstBalanced(stripped);
  if (balanced) attempts.push(balanced, dropTrailingCommas(balanced));

  for (const attempt of attempts) {
    if (attempt.length === 0) continue;
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      continue;
    }
  }

  throw new SyntaxError("Response did not contain parseable JSON");
}
