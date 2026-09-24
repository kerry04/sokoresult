/**
 * Base URL of the public SokoResult deployment.
 *
 * The admin deployment (ADMIN_ENABLED=true) serves admin routes only, so
 * convenience links inside the admin UI that point at public pages
 * (market pages, user profiles) use this absolute URL instead of
 * in-app <Link>s that would 404 on the admin domain.
 */
export const PUBLIC_APP_URL = "https://sokoresult.vercel.app";
