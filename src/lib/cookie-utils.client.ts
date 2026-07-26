export interface CookieOptions {
  path?: string;
  expires?: Date;
  maxAge?: number;
  domain?: string;
  secure?: boolean;
  sameSite?: string;
}

// Cookie utilities for client-side use only
export function getCookie(name: string): string | null {
  // Client-side only
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// Set a cookie (client-side)
export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  // Add options
  if (options.path) cookieString += `; path=${options.path}`;
  if (options.expires) cookieString += `; expires=${options.expires.toUTCString()}`;
  if (options.maxAge) cookieString += `; max-age=${options.maxAge}`;
  if (options.domain) cookieString += `; domain=${options.domain}`;
  if (options.secure) cookieString += `; secure`;
  if (options.sameSite) cookieString += `; samesite=${options.sameSite}`;

  document.cookie = cookieString;
}

// Remove a cookie
export function deleteCookie(name: string, options: CookieOptions = {}): void {
  setCookie(name, '', {
    ...options,
    maxAge: -1, // Expire immediately
  });
}
