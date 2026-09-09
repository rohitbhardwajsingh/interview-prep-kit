"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError } from "@/lib/api";

export interface User {
  id: string;
  email: string;
}

interface SessionValue {
  user: User | null;
  /** Distinguishes "not signed in" from "not yet known". */
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();

    api<{ user: User | null }>("/auth/me", { signal: controller.signal })
      .then((body) => {
        setUser(body.user);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        // An aborted request has learned nothing, so the session stays
        // unknown. Resolving it as "signed out" here is what made Strict
        // Mode's remount bounce a freshly registered user to sign-in.
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setUser(null);
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const authenticate = useCallback(
    async (path: string, email: string, password: string) => {
      const body = await api<{ user: User }>(path, {
        method: "POST",
        body: { email, password },
      });
      setUser(body.user);
      router.push("/kits");
    },
    [router],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user,
      loading,
      signIn: (email, password) => authenticate("/auth/login", email, password),
      register: (email, password) =>
        authenticate("/auth/register", email, password),
      async signOut() {
        try {
          await api("/auth/logout", { method: "POST" });
        } catch (cause) {
          // An already-dead session is the desired end state either way.
          if (!(cause instanceof ApiError)) throw cause;
        }
        setUser(null);
        router.push("/");
      },
    }),
    [user, loading, authenticate, router],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession used outside SessionProvider");
  return value;
}
