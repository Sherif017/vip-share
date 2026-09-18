import Link from "next/link";

function CompassIcon() {
  return <span aria-hidden="true" className="text-lg leading-none">⌁</span>;
}

function TicketIcon() {
  return <span aria-hidden="true" className="text-lg leading-none">▱</span>;
}

function UserIcon() {
  return <span aria-hidden="true" className="text-lg leading-none">○</span>;
}

export default function BottomNavigation({
  authenticated = false,
}: {
  authenticated?: boolean;
}) {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink/95 px-5 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-2 backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around">
        <Link href="/events" className="bottom-nav-link bottom-nav-link-active">
          <CompassIcon />
          <span>Explorer</span>
        </Link>
        <Link href={authenticated ? "/reservations" : "/login"} className="bottom-nav-link">
          <TicketIcon />
          <span>Réservations</span>
        </Link>
        <Link href={authenticated ? "/reservations" : "/login"} className="bottom-nav-link">
          <UserIcon />
          <span>Profil</span>
        </Link>
      </div>
    </nav>
  );
}
