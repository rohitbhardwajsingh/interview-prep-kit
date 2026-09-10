"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { KitDetail, RegenerableSection } from "@/lib/types";
import { useKit } from "@/lib/use-kit";
import type { Conflict } from "./conflict-dialog";

export type EditableSection = "questions" | "flashcards";

interface KitApi extends ReturnType<typeof useKit> {
  kitId: string;
  /** Saves one field, handling versioning and conflict recovery centrally. */
  save: (
    section: EditableSection,
    itemId: string,
    field: string,
    value: string,
  ) => Promise<void>;
  togglePin: (
    section: EditableSection,
    itemId: string,
    pinned: boolean,
  ) => Promise<void>;
  rebuild: (section: RegenerableSection) => Promise<void>;
  /** Adds a hand-written item; resolves to its new id. */
  addItem: (
    section: EditableSection,
    item: Record<string, unknown>,
  ) => Promise<void>;
  removeItem: (section: EditableSection, itemId: string) => Promise<void>;
  reorder: (section: EditableSection, orderedIds: string[]) => Promise<void>;
  saveBrief: (patch: { summary?: string; what_they_do?: string }) => Promise<void>;
  conflict: Conflict | null;
  resolveConflict: (value: string) => Promise<void>;
  dismissConflict: () => void;
  notice: string | null;
  setNotice: (notice: string | null) => void;
}

const KitContext = createContext<KitApi | null>(null);

export function useKitContext(): KitApi {
  const value = useContext(KitContext);
  if (!value) throw new Error("useKitContext used outside its provider");
  return value;
}

/**
 * One kit, fetched once, shared by every screen about it.
 *
 * The editing rules live here rather than in the screens because they are
 * the same rules everywhere: an edit carries the version it was made
 * against, and a rejection is a decision to hand back to the user rather
 * than an error to show them.
 */
export function KitProvider({
  kitId,
  children,
}: {
  kitId: string;
  children: React.ReactNode;
}) {
  const kitState = useKit(kitId);
  const { kit, apply, refresh, regenerateSection } = kitState;
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = useCallback(
    async (
      section: EditableSection,
      itemId: string,
      field: string,
      value: string,
    ) => {
      if (!kit) return;
      try {
        const body = await api<{ kit: KitDetail }>(
          `/kits/${kitId}/${section}/${itemId}`,
          {
            method: "PATCH",
            body: { version: kit.version, patch: { [field]: value } },
          },
        );
        apply(body.kit);
        setNotice(null);
      } catch (cause) {
        if (cause instanceof ApiError && cause.isConflict) {
          // Re-read to find out what actually landed, then let them choose.
          const current = await refresh();
          const theirs =
            current?.kit?.[section].find((item) => item.id === itemId) ?? null;
          setConflict({
            field: `${itemId}.${field}`,
            yours: value,
            theirs:
              (theirs as Record<string, unknown> | null)?.[field]?.toString() ??
              "(removed)",
          });
          // Swallowed deliberately: the dialog is the outcome, not a failure.
          return;
        }
        throw cause;
      }
    },
    [kit, kitId, apply, refresh],
  );

  const resolveConflict = useCallback(
    async (value: string) => {
      if (!conflict || !kit) return;
      const [itemId, field] = conflict.field.split(".");
      const section: EditableSection = kit.kit?.questions.some(
        (question) => question.id === itemId,
      )
        ? "questions"
        : "flashcards";

      setConflict(null);
      try {
        const body = await api<{ kit: KitDetail }>(
          `/kits/${kitId}/${section}/${itemId}`,
          {
            method: "PATCH",
            // Against the version just re-read, so this retry is not stale.
            body: { version: kit.version, patch: { [field as string]: value } },
          },
        );
        apply(body.kit);
        setNotice("Your version was saved.");
      } catch {
        setNotice("That could not be saved. Reload and try once more.");
      }
    },
    [conflict, kit, kitId, apply],
  );

  const togglePin = useCallback(
    async (section: EditableSection, itemId: string, pinned: boolean) => {
      if (!kit) return;
      try {
        const body = await api<{ kit: KitDetail }>(
          `/kits/${kitId}/${section}/${itemId}/pin`,
          { method: "PUT", body: { version: kit.version, pinned } },
        );
        apply(body.kit);
      } catch (cause) {
        setNotice(
          cause instanceof ApiError ? cause.message : "Could not change that",
        );
      }
    },
    [kit, kitId, apply],
  );

  const rebuild = useCallback(
    async (section: RegenerableSection) => {
      if (!kit) return;
      // Errors propagate: the confirmation that asked for the rebuild is the
      // thing that should say why it was refused.
      await regenerateSection(section, kit.version);
      setNotice(null);
    },
    [kit, regenerateSection],
  );

  const addItem = useCallback(
    async (section: EditableSection, item: Record<string, unknown>) => {
      if (!kit) return;
      const body = await api<{ kit: KitDetail }>(`/kits/${kitId}/${section}`, {
        method: "POST",
        body: { version: kit.version, item },
      });
      apply(body.kit);
      setNotice(null);
    },
    [kit, kitId, apply],
  );

  const removeItem = useCallback(
    async (section: EditableSection, itemId: string) => {
      if (!kit) return;
      const body = await api<{ kit: KitDetail }>(
        `/kits/${kitId}/${section}/${itemId}?version=${kit.version}`,
        { method: "DELETE" },
      );
      apply(body.kit);
      setNotice(null);
    },
    [kit, kitId, apply],
  );

  const reorder = useCallback(
    async (section: EditableSection, orderedIds: string[]) => {
      if (!kit) return;
      // Applied optimistically by the caller for immediacy; the response
      // reconciles the authoritative order and version back in.
      const body = await api<{ kit: KitDetail }>(
        `/kits/${kitId}/${section}/reorder`,
        { method: "POST", body: { version: kit.version, orderedIds } },
      );
      apply(body.kit);
    },
    [kit, kitId, apply],
  );

  const saveBrief = useCallback(
    async (patch: { summary?: string; what_they_do?: string }) => {
      if (!kit) return;
      const body = await api<{ kit: KitDetail }>(`/kits/${kitId}/brief`, {
        method: "PATCH",
        body: { version: kit.version, patch },
      });
      apply(body.kit);
      setNotice(null);
    },
    [kit, kitId, apply],
  );

  return (
    <KitContext.Provider
      value={{
        ...kitState,
        kitId,
        save,
        togglePin,
        rebuild,
        addItem,
        removeItem,
        reorder,
        saveBrief,
        conflict,
        resolveConflict,
        dismissConflict: () => {
          setConflict(null);
          setNotice("Kept the saved version. Your text was not applied.");
        },
        notice,
        setNotice,
      }}
    >
      {children}
    </KitContext.Provider>
  );
}
