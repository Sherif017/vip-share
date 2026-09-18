import Link from "next/link";
import KreLogo from "@/components/KreLogo";

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.07] bg-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <KreLogo variant="footer" />
          <span className="text-xs text-muted">© 2026 K-RÉ</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/legal" className="transition hover:text-cream">Mentions légales</Link>
          <Link href="/terms" className="transition hover:text-cream">Conditions</Link>
          <Link href="/privacy" className="transition hover:text-cream">Confidentialité</Link>
        </div>
      </div>
    </footer>
  );
}
