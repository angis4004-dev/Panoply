'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Trophy, ShieldCheck, KeyRound, Info } from 'lucide-react';

/**
 * The header bell, and the panel behind it.
 *
 * What was here before was a button with no onClick and a red dot rendered
 * unconditionally - it announced unread news permanently and opened nothing.
 * A control that lies about state is worse than no control, because people
 * stop believing the ones that do work.
 */

type NotificationType = 'achievement' | 'kyc' | 'security' | 'system';

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

const ICONS: Record<NotificationType, typeof Bell> = {
  achievement: Trophy,
  kyc: ShieldCheck,
  security: KeyRound,
  system: Info,
};

/* Security entries are the ones a person needs to notice among a run of
   cheerful achievement unlocks, so they are the only type that is not the
   muted default. */
const ICON_TONE: Record<NotificationType, string> = {
  achievement: 'text-primary',
  kyc: 'text-green-400',
  security: 'text-[#E5555A]',
  system: 'text-ds-text-muted',
};

/** Refresh cadence while the tab is in front. Paused when it is not. */
const POLL_MS = 60_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications || []);
      setUnread(data.unreadCount || 0);
    } catch {
      // A failed poll is not worth surfacing - the next one is a minute away,
      // and an error toast for a background refresh nobody asked for is noise.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();

    // Polling a hidden tab burns a request a minute for a badge nobody can
    // see. Reloading on the way back also means returning to the tab shows
    // current state immediately rather than up to a minute late.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    // Emitted by DashboardShell when an unlock lands, so the badge appears
    // with the toast instead of up to a minute behind it.
    window.addEventListener('aegis:notifications-changed', load);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('aegis:notifications-changed', load);
    };
  }, [load]);

  /*
   * Marking happens on close, not on open.
   *
   * Clearing the moment the panel appears takes away the only thing that
   * distinguishes the two new items from the twenty old ones, at exactly the
   * moment the user is trying to find them. Waiting until they look away
   * keeps the highlighting useful and still stops the badge nagging.
   */
  const markAllRead = useCallback(async () => {
    if (unread === 0) return;
    setUnread(0);
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    try {
      await fetch('/api/notifications', { method: 'PATCH' });
    } catch {
      // Optimistic. The next poll re-reads the server's answer, so a failure
      // here corrects itself rather than needing to be reported.
    }
  }, [unread]);

  const close = useCallback(() => {
    setOpen(false);
    markAllRead();
  }, [markAllRead]);

  useEffect(() => {
    if (!open) return;

    /*
     * The dismissing click closes the panel and nothing else.
     *
     * Left to itself, mousedown outside closes and then the click still
     * reaches whatever was underneath - during testing, dismissing the panel
     * pressed "Set a PIN" and navigated away. On a screen whose buttons move
     * money and change credentials, "I clicked into empty space to close a
     * dropdown" must not be able to press one of them. So the click that
     * performs the dismissal is swallowed once, in the capture phase, before
     * it reaches its target.
     */
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      close();
      const swallow = (click: MouseEvent) => {
        click.stopPropagation();
        click.preventDefault();
      };
      document.addEventListener('click', swallow, { capture: true, once: true });
      // If no click follows - the pointer moved away, or was released outside
      // the window - the one-shot listener would otherwise sit there and eat
      // the user's next click instead.
      setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      close();
      // Escape should leave focus somewhere sensible rather than on a node
      // that is about to be removed from the document.
      buttonRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : (setOpen(true), load()))}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-ds-text-muted transition-colors duration-fast ease-ds-out hover:bg-ds-surface-inset hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-ds-surface"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#E5555A] px-1 font-mono text-[0.625rem] font-semibold leading-none text-white"
            // The count is already in the button's own accessible name, so
            // reading it a second time would just be clutter.
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          /*
           * Anchored to the viewport on a phone, to the bell from `sm` up.
           *
           * Anchoring to the bell alone does not survive a narrow screen: the
           * avatar chip sits to its right, so the bell's right edge is ~73px
           * in from the viewport's, and a 22rem panel hung off it ran 41px
           * past the left edge with its icons and title clipped. Capping the
           * width against 100vw does not help either, because the overflow
           * comes from where the panel starts, not from how wide it is.
           */
          className="fixed inset-x-4 top-[3.75rem] z-50 overflow-hidden rounded-xl border border-ds-border bg-ds-surface-raised shadow-2xl shadow-black/40 sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[22rem]"
        >
          <div className="flex items-center justify-between border-b border-ds-border px-4 py-3">
            <h2 className="text-sm font-semibold text-ds-text">Notifications</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="rounded text-xs font-medium text-ds-text-muted transition-colors hover:text-ds-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain">
            {!loaded && (
              <p className="px-4 py-8 text-center text-sm text-ds-text-muted">Loading...</p>
            )}

            {loaded && items.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-ds-text-secondary">Nothing yet</p>
                <p className="mt-1 text-xs text-ds-text-muted">
                  Achievements, verification updates and security changes will appear here.
                </p>
              </div>
            )}

            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationRow item={item} onNavigate={close} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ item, onNavigate }: { item: NotificationItem; onNavigate: () => void }) {
  const Icon = ICONS[item.type] || Info;

  const inner = (
    <div className="flex gap-3 border-b border-ds-border/60 px-4 py-3 last:border-b-0">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_TONE[item.type]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`truncate text-sm ${item.read ? 'font-medium text-ds-text-secondary' : 'font-semibold text-ds-text'}`}
          >
            {item.title}
          </p>
          <time
            dateTime={item.createdAt}
            className="shrink-0 font-mono text-[0.6875rem] text-ds-text-muted"
          >
            {relativeTime(item.createdAt)}
          </time>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-ds-text-muted">{item.body}</p>
      </div>
      {/* Unread is carried by weight as well as by this dot, so it does not
          depend on colour alone. */}
      {!item.read && (
        <span
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          aria-label="Unread"
          role="img"
        />
      )}
    </div>
  );

  if (!item.href) {
    return <div className="bg-transparent">{inner}</div>;
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="block transition-colors hover:bg-ds-surface-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
    >
      {inner}
    </Link>
  );
}

/**
 * Short relative timestamps, with the exact time available on hover through
 * the <time> element's own datetime attribute.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return 'now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;

  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
