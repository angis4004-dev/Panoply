import { cookies } from 'next/headers';

interface ServerCookieOptions {
  path?: string;
  expires?: Date;
  maxAge?: number;
  domain?: string;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
}

export async function getCookie(name: string): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(name);
  return cookie ? cookie.value : null;
}

export async function setCookie(
  name: string,
  value: string,
  options: ServerCookieOptions = {}
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(name, value, {
    path: options.path ?? '/',
    expires: options.expires,
    maxAge: options.maxAge,
    domain: options.domain,
    secure: options.secure ?? true,
    sameSite: options.sameSite ?? 'lax',
  });
}

export async function deleteCookie(name: string, options: ServerCookieOptions = {}): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(name, '', {
    ...options,
    maxAge: -1,
    path: options.path ?? '/',
  });
}
