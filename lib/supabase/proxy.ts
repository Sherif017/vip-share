import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(
            ({ name, value, options }) => {
              supabaseResponse.cookies.set(
                name,
                value,
                options
              );
            }
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isApiRoute = pathname.startsWith("/api/");
  const isPath = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`);

  const isPublicPage =
    pathname === "/" ||
    isPath("/events") ||
    isPath("/login") ||
    isPath("/register") ||
    isPath("/forgot-password") ||
    isPath("/auth") ||
    isPath("/legal") ||
    isPath("/privacy") ||
    isPath("/terms");

  // Les handlers API doivent produire leurs propres réponses JSON 401/403.
  // Le proxy continue cependant à rafraîchir les cookies Supabase ci-dessus.
  const isPublicRoute = isPublicPage || pathname === "/api/stripe/webhook";

  if (!user && !isApiRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";

    return NextResponse.redirect(url);
  }

  if (
    user &&
    !isApiRoute &&
    (isPath("/login") || isPath("/register"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/events";

    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
