import type { Metadata } from "next";
import { SessionProvider } from "@/components/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interview Prep Kit",
  description:
    "Turns a job posting and a company into a study plan you can actually work through.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {/* One provider for the whole app, so crossing between the signed-in
            and signed-out areas does not re-ask who the user is. */}
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
