import { describe, expect, it } from "vitest";
import { extractPage } from "./html";

const base = "http://localhost:8099/acme/";

describe("extractPage", () => {
  it("resolves relative links against the page they came from", () => {
    const page = extractPage(
      `<a href="careers">Careers</a>
       <a href="/handbook/hiring">Hiring</a>
       <a href="../shared/about">About</a>`,
      base,
    );

    expect(page.links.map((link) => link.url)).toEqual([
      "http://localhost:8099/acme/careers",
      "http://localhost:8099/handbook/hiring",
      "http://localhost:8099/shared/about",
    ]);
  });

  it("keeps absolute links to other hosts for the caller to filter", () => {
    const page = extractPage('<a href="https://news.example/thread">Thread</a>', base);

    expect(page.links[0]?.url).toBe("https://news.example/thread");
  });

  it("drops links that cannot be fetched", () => {
    const page = extractPage(
      `<a href="mailto:hi@acme.test">Mail</a>
       <a href="tel:+15551234">Call</a>
       <a href="javascript:void(0)">Menu</a>
       <a href="#main">Skip</a>
       <a href="/careers">Careers</a>`,
      base,
    );

    expect(page.links).toHaveLength(1);
    expect(page.links[0]?.url).toBe("http://localhost:8099/careers");
  });

  it("strips the fragment and de-duplicates what is left", () => {
    const page = extractPage(
      `<a href="/careers#roles">Roles</a><a href="/careers#perks">Perks</a>`,
      base,
    );

    expect(page.links).toHaveLength(1);
    expect(page.links[0]?.url).toBe("http://localhost:8099/careers");
  });

  it("captures anchor text, which is often the only hiring signal", () => {
    const page = extractPage(
      '<a href="/hb/2847"> How  we\n hire </a>',
      base,
    );

    expect(page.links[0]?.anchorText).toBe("How we hire");
  });

  it("keeps script and style contents out of the text", () => {
    const page = extractPage(
      `<body><script>var leak = "secret";</script>
       <style>.a{color:red}</style>
       <p>We build freight software.</p></body>`,
      base,
    );

    expect(page.text).toBe("We build freight software.");
  });

  it("prefers the main region over the whole document", () => {
    const page = extractPage(
      `<body><nav>Home Careers</nav>
       <main><p>Our interview loop has four stages.</p></main>
       <footer>Copyright</footer></body>`,
      base,
    );

    expect(page.text).toBe("Our interview loop has four stages.");
  });

  it("falls back to the body when there is no main region", () => {
    const page = extractPage("<body><p>Plain page</p></body>", base);

    expect(page.text).toBe("Plain page");
  });

  it("reads the title, falling back to the first heading", () => {
    expect(extractPage("<title>Acme — Careers</title>", base).title).toBe(
      "Acme — Careers",
    );
    expect(extractPage("<h1>How we hire</h1>", base).title).toBe("How we hire");
  });

  it("survives malformed markup", () => {
    const page = extractPage('<div><p>Unclosed<a href="/jobs">Jobs', base);

    expect(page.links[0]?.url).toBe("http://localhost:8099/jobs");
  });
});
