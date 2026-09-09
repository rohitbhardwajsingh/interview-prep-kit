import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/sites",
);

export interface FixtureServer {
  origin: string;
  close(): Promise<void>;
}

async function readIfFile(path: string): Promise<Buffer | null> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

async function resolveFile(root: string, pathname: string): Promise<Buffer | null> {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const target = join(root, relative);
  if (!target.startsWith(root)) return null;

  if (pathname.endsWith("/")) return readIfFile(join(target, "index.html"));
  if (/\.[a-z0-9]+$/i.test(pathname)) return readIfFile(target);

  return (
    (await readIfFile(`${target}.html`)) ?? (await readIfFile(join(target, "index.html")))
  );
}

function contentTypeFor(pathname: string): string {
  if (pathname.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json";
  return "text/html; charset=utf-8";
}

/**
 * Serves the fixture company sites, plus a handful of routes that reproduce
 * the retrieval failures the brief asks us to survive. Tests exercise the real
 * fetch path against it rather than stubbing the network.
 */
export async function startFixtureServer(
  options: { root?: string; port?: number } = {},
): Promise<FixtureServer> {
  const root = options.root ?? DEFAULT_ROOT;

  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (pathname === "/timeout") {
      return;
    }

    if (pathname === "/oversized") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<html><body>${"x".repeat(5_000_000)}</body></html>`);
      return;
    }

    if (pathname === "/binary") {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.end(Buffer.from([0, 1, 2, 3]));
      return;
    }

    if (pathname === "/boom") {
      response.writeHead(500, { "content-type": "text/html" });
      response.end("<html><body>Internal error</body></html>");
      return;
    }

    if (pathname === "/redirect-to-about") {
      response.writeHead(302, { location: "/acme/about" });
      response.end();
      return;
    }

    if (pathname === "/redirect-to-private") {
      response.writeHead(302, { location: "http://127.0.0.1:9/" });
      response.end();
      return;
    }

    if (pathname.startsWith("/redirect-loop")) {
      response.writeHead(302, { location: "/redirect-loop" });
      response.end();
      return;
    }

    void resolveFile(root, pathname).then((body) => {
      if (!body) {
        response.writeHead(404, { "content-type": "text/html" });
        response.end("<html><body>Not found</body></html>");
        return;
      }
      response.writeHead(200, { "content-type": contentTypeFor(pathname) });
      response.end(body);
    });
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(options.port ?? 0, "127.0.0.1", resolvePromise);
  });

  const address = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.closeAllConnections();
        server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
      }),
  };
}
