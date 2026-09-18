import type { Metadata } from "next";

import "./globals.css";

import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "K-RÉ — Ta place en VIP.",
  description: "Trouve ta place en VIP dans les meilleures soirées.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <div className="flex min-h-screen flex-col bg-ink">
          <Header />

          <div className="flex-1 pb-20 md:pb-0">
            {children}
          </div>

          <Footer />
        </div>
      </body>
    </html>
  );
}
