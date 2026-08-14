'use client';

import { useCallback, useEffect, useRef } from 'react';

export const PIN_LENGTH = 6;

/**
 * Six boxes that behave like one field.
 *
 * The value is a single string held by the parent; the boxes are a rendering
 * of it. That is the opposite of the usual approach - six pieces of state
 * stitched together on submit - and it is what makes paste, backspace across
 * a boundary, and arrow-key movement fall out for free instead of each needing
 * its own special case.
 *
 * Accessibility notes that are easy to get wrong here:
 *
 *   - Every box is a real input with its own label, so a screen reader
 *     announces "Digit 3 of 6" rather than six unnamed edit fields.
 *   - inputMode="numeric" brings up the number pad on a phone without the
 *     spinner and scroll-to-change behaviour that type="number" would add.
 *   - autoComplete="one-time-code" lets a password manager or an OS-level SMS
 *     autofill target the group, and pasting into any box fills all six.
 *   - The boxes never trap focus: Tab leaves the group in one step because
 *     only the active box is in the tab order.
 */
export function PinInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus = true,
  label,
  describedBy,
  invalid,
  idPrefix = 'pin',
  align = 'center',
}: {
  value: string;
  onChange: (next: string) => void;
  /** Fired when the sixth digit lands, so the parent can submit without a click. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  label: string;
  describedBy?: string;
  invalid?: boolean;
  idPrefix?: string;
  /**
   * Centred on the standalone PIN screens, which are centred throughout.
   * `start` is for the settings and reset forms, where a visible label sits
   * left-aligned above the boxes and centring them leaves the two out of line.
   */
  align?: 'center' | 'start';
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const completedFor = useRef<string | null>(null);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  // Guarded so a re-render at full length does not fire submit repeatedly -
  // the parent would otherwise post the same PIN once per keystroke-induced
  // render and burn attempts against the lockout.
  useEffect(() => {
    if (value.length === PIN_LENGTH && completedFor.current !== value) {
      completedFor.current = value;
      onComplete?.(value);
    }
    if (value.length < PIN_LENGTH) completedFor.current = null;
  }, [value, onComplete]);

  const focusBox = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(PIN_LENGTH - 1, index));
    refs.current[clamped]?.focus();
    refs.current[clamped]?.select();
  }, []);

  const setDigits = useCallback(
    (next: string, focusIndex: number) => {
      onChange(next.slice(0, PIN_LENGTH));
      focusBox(focusIndex);
    },
    [onChange, focusBox]
  );

  function handleInput(index: number, raw: string) {
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;

    // Typing over a filled box replaces from that position rather than
    // appending, which is what someone correcting the third digit expects.
    const next = (value.slice(0, index) + digits + value.slice(index + digits.length)).slice(
      0,
      PIN_LENGTH
    );
    setDigits(next, index + digits.length);
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'Backspace': {
        event.preventDefault();
        if (value[index]) {
          setDigits(value.slice(0, index) + value.slice(index + 1), index);
        } else {
          // Empty box: delete the digit before it and step back, which is how
          // a single text field behaves.
          setDigits(value.slice(0, Math.max(0, index - 1)) + value.slice(index), index - 1);
        }
        break;
      }
      case 'Delete':
        event.preventDefault();
        setDigits(value.slice(0, index) + value.slice(index + 1), index);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusBox(index - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        focusBox(index + 1);
        break;
      case 'Home':
        event.preventDefault();
        focusBox(0);
        break;
      case 'End':
        event.preventDefault();
        focusBox(value.length);
        break;
      default:
        break;
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    // Pasting a code copied out of an email brings spaces and dashes with it.
    const digits = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    event.preventDefault();
    setDigits(digits, Math.min(digits.length, PIN_LENGTH - 1));
  }

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      className={`flex gap-2 sm:gap-2.5 ${align === 'start' ? 'justify-start' : 'justify-center'}`}
    >
      {Array.from({ length: PIN_LENGTH }, (_, index) => {
        const filled = Boolean(value[index]);
        return (
          <div key={index}>
            <label htmlFor={`${idPrefix}-${index}`} className="sr-only">
              Digit {index + 1} of {PIN_LENGTH}
            </label>
            <input
              id={`${idPrefix}-${index}`}
              ref={(node) => {
                refs.current[index] = node;
              }}
              // A password field, so the value never appears in a screenshot,
              // a screen share, or an autofill dropdown.
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              // Off: the browser's own suggestion list for a six-digit field is
              // a place recently-typed PINs would sit in plain text.
              data-lpignore="true"
              maxLength={1}
              disabled={disabled}
              aria-invalid={invalid || undefined}
              value={value[index] ?? ''}
              onChange={(event) => handleInput(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              onFocus={(event) => event.currentTarget.select()}
              className={`h-12 w-10 rounded-lg border bg-ds-surface-inset text-center font-mono text-lg tabular-nums text-ds-text caret-primary transition duration-fast ease-ds-out focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 sm:h-14 sm:w-12 ${
                invalid
                  ? 'border-ds-value-negative/60'
                  : filled
                    ? 'border-primary/50'
                    : 'border-ds-border hover:border-ds-border-strong'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
