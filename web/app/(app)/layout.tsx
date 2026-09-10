"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  CommandPaletteProvider,
  type Command,
} from "@/components/command-palette";
import { PaletteButton } from "@/components/palette-button";
import { useSession } from "@/components/session";

const NAV = [
  { href: "/kits", label: "Kits" },
  { href: "/stories", label: "Story bank" },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only redirects once the session is actually known, otherwise a signed-in
    // user is bounced to sign-in on every hard refresh.
    if (!loading && !user) router.replace("/sign-in");
  }, [loading, user, router]);

  // Available from anywhere. Anything that only makes sense on one screen is
  // registered by that screen instead.
  const base = useMemo<Command[]>(
    () => [
      {
        id: "go-kits",
        group: "Go to",
        label: "All kits",
        run: () => router.push("/kits"),
      },
      {
        id: "go-stories",
        group: "Go to",
        label: "Story bank",
        run: () => router.push("/stories"),
      },
      {
        id: "new-kit",
        group: "Create",
        label: "New prep kit",
        hint: "from a job description",
        run: () => router.push("/kits/new"),
      },
      {
        id: "sign-out",
        group: "Account",
        label: "Sign out",
        run: () => void signOut(),
      },
    ],
    [router, signOut],
  );

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse-line text-sm text-dim">
          Checking your session…
        </p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <CommandPaletteProvider base={base}>
      <div className="min-h-dvh">
        <header
          className="sticky top-0 z-40 border-b border-line bg-void/80
            backdrop-blur-xl"
        >
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
            <Link
              href="/kits"
              className="font-mono text-xs uppercase tracking-[0.2em]
                text-paper"
            >
              Prep&nbsp;Kit
            </Link>

            <nav className="flex gap-1">
              {NAV.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-surface-high text-paper"
                        : "text-dim hover:text-paper"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <PaletteButton />
              <span className="hidden text-xs text-faint sm:inline">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-xs text-dim transition hover:text-paper"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {children}
      </div>
    </CommandPaletteProvider>
  );
}
