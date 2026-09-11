import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-900 bg-black">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">

        <p>
          © {new Date().getFullYear()} VIP Share
        </p>

        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link
            href="/legal"
            className="transition hover:text-white"
          >
            Mentions légales
          </Link>

          <Link
            href="/terms"
            className="transition hover:text-white"
          >
            Conditions
          </Link>

          <Link
            href="/privacy"
            className="transition hover:text-white"
          >
            Confidentialité
          </Link>
        </div>

      </div>
    </footer>
  );
}