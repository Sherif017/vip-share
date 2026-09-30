import Link from "next/link";

import LogoutButton from "@/components/LogoutButton";

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#080808] text-[#F7F4EE]">
      <header className="border-b border-white/10 bg-[#080808]/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/manager"
            className="text-lg font-bold tracking-[0.16em]"
          >
            K-RÉ
          </Link>

          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <Link
              href="/manager"
              className="rounded-full px-4 py-2 text-[#C0BBB1] transition hover:bg-white/[0.06] hover:text-white"
            >
              Cockpit
            </Link>

            <Link
              href="/admin"
              className="rounded-full px-4 py-2 text-[#C0BBB1] transition hover:bg-white/[0.06] hover:text-white"
            >
              Exploitation
            </Link>

            <Link
              href="/admin/scan"
              className="rounded-full px-4 py-2 text-[#C0BBB1] transition hover:bg-white/[0.06] hover:text-white"
            >
              Scanner
            </Link>

            <Link
              href="/events"
              className="rounded-full border border-white/10 px-4 py-2 text-[#F7F4EE] transition hover:border-white/25"
            >
              Voir K-RÉ
            </Link>

            <LogoutButton
              className="rounded-full border border-red-900/40 px-4 py-2 text-red-300 transition hover:border-red-700 hover:bg-red-950/20"
            />
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
