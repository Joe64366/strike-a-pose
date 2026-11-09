import type { Metadata, Viewport } from "next";
import { themeBootScript } from "@/lib/stage";
import "./globals.css";

export const metadata: Metadata = {
  title: "Strike a Pose",
  description: "Describe a pose in words and get a posed 3D mannequin for drawing reference.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9e9ec" },
    { media: "(prefers-color-scheme: dark)", color: "#3f3f45" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets data-scheme and --stage before paint, so the
    // server markup intentionally differs from the hydrated attributes.
    <html lang="en" data-scheme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
