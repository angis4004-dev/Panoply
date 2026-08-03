'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SymbolSelectProps {
  value: string;
  onChange: (symbol: string) => void;
  options: string[];
  /** Hide this symbol from the list - used so the two sides of a pair can't match. */
  excludeValue?: string;
  ariaLabel: string;
}

/**
 * Searchable symbol picker. Swaps in for a native <select> once the option
 * list gets long (~40 symbols) - a native dropdown's list chrome isn't
 * stylable and renders as a plain unfiltered browser popup, which gets
 * unreadable at that length. This is a styled, filterable listbox instead.
 */
export function SymbolSelect({
  value,
  onChange,
  options,
  excludeValue,
  ariaLabel,
}: SymbolSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter(
    (symbol) => symbol !== excludeValue && symbol.includes(query.trim().toUpperCase())
  );

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlight(0);
      // Focus after the panel paints so the click that opened it doesn't
      // immediately blur the input.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const selectSymbol = (symbol: string) => {
    onChange(symbol);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const symbol = filtered[highlight];
      if (symbol) selectSymbol(symbol);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#212A35] bg-[#122131] px-3 py-2.5 text-sm text-white transition-colors duration-fast ease-ds-out focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {value}
        <ChevronDown className="h-4 w-4 text-[#8B95A5]" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-[#212A35] bg-[#0D131C] shadow-xl"
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search…"
            aria-label={`Search ${ariaLabel.toLowerCase()}`}
            className="w-full border-b border-[#212A35] bg-transparent px-3 py-2 text-sm text-white placeholder-[#4b5563] focus:outline-none"
          />
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-[#4b5563]">No matches</p>
            )}
            {filtered.map((symbol, i) => (
              <button
                key={symbol}
                type="button"
                role="option"
                aria-selected={symbol === value}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => selectSymbol(symbol)}
                className={`block w-full px-3 py-2 text-left text-sm transition-colors duration-fast ease-ds-out ${
                  i === highlight ? 'bg-primary/15 text-white' : 'text-[#E7ECF2]'
                } ${symbol === value ? 'font-semibold text-primary' : ''}`}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
