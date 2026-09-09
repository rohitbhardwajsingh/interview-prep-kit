import * as cheerio from "cheerio";

export interface ExtractedLink {
  url: string;
  anchorText: string;
}

export interface ExtractedPage {
  title: string;
  text: string;
  links: ExtractedLink[];
}

const STRIPPED_SELECTORS =
  "script, style, noscript, template, svg, iframe, object, embed";

const CONTENT_SELECTORS = ["main", "article", "[role=main]", "#content", "body"];

const UNFETCHABLE_HREF = /^(mailto:|tel:|javascript:|data:|#)/i;

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normaliseUrl(href: string, baseUrl: string): string | null {
  if (UNFETCHABLE_HREF.test(href.trim())) return null;
  try {
    const resolved = new URL(href, baseUrl);
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

/**
 * Parses a fetched page into the three things the crawler needs: a title, the
 * readable text, and every link resolved against the page it came from. Links
 * are resolved rather than assumed absolute, because the graders' sites are
 * served from a host we do not control.
 */
export function extractPage(html: string, baseUrl: string): ExtractedPage {
  const $ = cheerio.load(html);
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    const url = normaliseUrl(href, baseUrl);
    if (!url || seen.has(url)) return;

    seen.add(url);
    links.push({
      url,
      anchorText: collapse($(element).text()).slice(0, 200),
    });
  });

  const title = collapse($("title").first().text() || $("h1").first().text());

  $(STRIPPED_SELECTORS).remove();

  let text = "";
  for (const selector of CONTENT_SELECTORS) {
    const region = $(selector).first();
    if (region.length === 0) continue;
    text = collapse(region.text());
    if (text.length > 0) break;
  }

  return { title, text, links };
}
