/** Matches http/https URLs (exclude trailing punctuation and markdown formatting chars; allow dots in path, : for port). */
export const URL_REGEX = /https?:\/\/[^\s\]\)\}\\"'*_~]+?(?=[,;)\]}\s*_~]|$)/g;

/** Strip leading/trailing markdown formatting artifacts (**, *, __, _, ~~, ~) from a URL string. */
export function sanitizeUrl(url: string): string {
  return url.replace(/^[*_~]+/, "").replace(/[*_~]+$/, "");
}

const LINK_PLACEHOLDER_PREFIX = "\u200B\u200BLINK";
const LINK_PLACEHOLDER_SUFFIX = "\u200B\u200B";

/** Remove YAML frontmatter (content between leading --- and next ---) from markdown. */
export function stripFrontmatter(content: string): string {
  if (!content || typeof content !== "string") return content;
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---\n")) return content;
  const afterFirst = trimmed.slice(4);
  const closingIdx = afterFirst.indexOf("\n---");
  if (closingIdx === -1) return content;
  return afterFirst.slice(closingIdx + 4).trimStart();
}


/** Wrap bare URLs in markdown link syntax so they render underlined and tappable.
 *  Preserves existing [text](url) links. Unwraps URLs inside backtick code spans
 *  so they become clickable links instead of non-interactive inline code. */
export function wrapBareUrlsInMarkdown(content: string): string {
  // 1. Strip existing markdown links
  const existingLinks: Array<{ text: string; url: string }> = [];
  let stripped = content.replace(/\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g, (_, text, url) => {
    const idx = existingLinks.length;
    existingLinks.push({ text, url });
    return LINK_PLACEHOLDER_PREFIX + idx + LINK_PLACEHOLDER_SUFFIX;
  });

  // 2. Unwrap backtick code spans that contain only a URL — remove the backticks
  //    so the bare URL gets wrapped into a clickable link in step 3.
  //    Code spans with non-URL content are left intact.
  stripped = stripped.replace(/`(https?:\/\/[^\s`]+)`/g, (_match, url) => url);

  // 3. Wrap remaining bare URLs (sanitize to strip markdown formatting artifacts like **)
  const withWrapped = stripped.replace(URL_REGEX, (url) => {
    const clean = sanitizeUrl(url);
    return `[${clean}](${clean})`;
  });

  // 4. Restore existing links
  const result = withWrapped.replace(
    new RegExp(LINK_PLACEHOLDER_PREFIX + "(\\d+)" + LINK_PLACEHOLDER_SUFFIX, "g"),
    (_, i) => {
      const { text, url } = existingLinks[Number(i)];
      return `[${text}](${url})`;
    }
  );

  return result;
}

/** Parse text into alternating text and URL segments for rendering clickable links in plain text (e.g. code blocks, terminal output). */
export function parseTextWithUrlSegments(content: string): Array<{ type: "text" | "url"; value: string }> {
  if (!content || typeof content !== "string") return [];
  const segments: Array<{ type: "text" | "url"; value: string }> = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(URL_REGEX.source, "g");
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "url", value: sanitizeUrl(match[0]) });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: "text" as const, value: content }];
}
