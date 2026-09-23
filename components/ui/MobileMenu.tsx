"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

import LogoutButton from "@/components/LogoutButton";

type MobileMenuProps = {
  authenticated: boolean;
  isClubAdmin: boolean;
  canScan: boolean;
  isManager: boolean;
};

type MenuLink = { href: string; label: string };

/**
 * Dropdown compact ancré sous le bouton ☰, PAS un drawer latéral.
 * Réutilise exactement les destinations déjà en place selon le rôle, et
 * la logique de déconnexion existante (LogoutButton, inchangée).
 *
 * Pas de blocage de scroll, pas d'overlay plein écran visible : la
 * fermeture au clic extérieur passe par un listener document, discret.
 */
export default function MobileMenu({
  authenticated,
  isClubAdmin,
  canScan,
  isManager,
}: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const links: MenuLink[] = [{ href: "/events", label: "Explorer" }];

  if (authenticated) {
    links.push({ href: "/reservations", label: "Réservations" });
    if (isClubAdmin) links.push({ href: "/admin", label: "Admin" });
    if (canScan) links.push({ href: "/admin/scan", label: "Scanner" });
    if (isManager) links.push({ href: "/manager", label: "Manager" });
  }

  const itemClassName =
    "block rounded-lg px-3 py-2.5 text-base text-cream transition hover:bg-white/[0.06] hover:text-champagne";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-cream transition hover:text-champagne"
      >
        <span aria-hidden="true">☰</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(280px,calc(100vw-32px))] rounded-xl border border-champagne/20 bg-[#0c0c0c] p-2 shadow-[0_12px_32px_rgba(0,0,0,0.45)] sm:w-[280px]"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClassName}
            >
              {link.label}
            </Link>
          ))}

          <div className="my-1 border-t border-white/[0.06]" />

          <Link
            href="/contact"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClassName}
          >
            Nous contacter
          </Link>

          {authenticated && (
            <>
              <div className="my-1 border-t border-white/[0.06]" />
              <LogoutButton
                variant="menu"
                className="rounded-lg px-3 py-2.5 hover:bg-white/[0.06]"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
