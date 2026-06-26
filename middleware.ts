import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isPublicAuthPath,
  resolveAuthCallbackPath,
  urlHasAuthCallbackParams,
} from "@/lib/authRoutes";

function shouldRerouteAuthCallback(pathname: string, request: NextRequest): boolean {
  if (isPublicAuthPath(pathname)) {
    return false;
  }

  return urlHasAuthCallbackParams(
    request.nextUrl.search,
    "",
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!shouldRerouteAuthCallback(pathname, request)) {
    return NextResponse.next();
  }

  const destination = resolveAuthCallbackPath(
    request.nextUrl.search,
    "",
  );
  const url = request.nextUrl.clone();
  url.pathname = destination;

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/login"],
};
