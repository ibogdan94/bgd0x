import { NextResponse } from "next/server";
import { verifySession } from "./lib/auth.mjs";

// Gate every page and API route behind a valid session, except the auth endpoints.
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  // Auth endpoints + the X OAuth redirect target are open (the callback protects
  // itself with the PKCE state + verifier cookie).
  if (pathname.startsWith("/api/auth") || pathname === "/callback") return NextResponse.next();

  const token = req.cookies.get("session")?.value;
  const email = token ? await verifySession(token) : null;

  if (!email) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (pathname !== "/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  } else if (pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
