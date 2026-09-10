"use client";

import { useParams } from "next/navigation";
import { KitProvider } from "@/components/kit-provider";
import { KitShell } from "@/components/kit-shell";

export default function KitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ kitId: string }>();

  return (
    <KitProvider kitId={params.kitId}>
      <KitShell>{children}</KitShell>
    </KitProvider>
  );
}
