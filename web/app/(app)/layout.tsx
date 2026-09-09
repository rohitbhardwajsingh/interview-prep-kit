"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
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

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted">Checking your session…</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-ink-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/kits" className="font-mono text-xs uppercase tracking-[0.2em]">
            Prep Kit
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
                      ? "bg-ink-line text-paper"
                      : "text-muted hover:text-paper"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-xs text-muted hover:text-paper"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
