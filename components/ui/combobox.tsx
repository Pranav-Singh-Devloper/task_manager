'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useId, useState, type KeyboardEvent } from 'react';
import { CheckIcon } from '../icons';
import { fieldClasses } from './input';

interface ComboboxProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** Offer an "Add “xyz”" row when the typed text is not in the list. */
  allowNew?: boolean;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

type Item = { kind: 'option' | 'add'; label: string };

/** Type to filter, arrow keys to move, Enter to choose. Follows the ARIA combobox (listbox) pattern. */
export function Combobox({
  options,
  value,
  onChange,
  allowNew,
  id,
  placeholder,
  disabled,
  ...aria
}: ComboboxProps) {
  const t = useTranslations('combobox');
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  // What the person has typed. null means "show the chosen value".
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? value;
  const [active, setActive] = useState(-1);

  const typed = query.trim();
  // Show everything while the text is just the chosen value; filter once the person types.
  const filtering = typed !== '' && typed !== value;
  const matches = filtering
    ? options.filter((o) => o.toLowerCase().includes(typed.toLowerCase()))
    : options;
  const exact = options.some((o) => o.toLowerCase() === typed.toLowerCase());
  const items: Item[] = matches.map((label) => ({ kind: 'option', label }));
  if (allowNew && typed && !exact) items.push({ kind: 'add', label: typed });

  function choose(item: Item) {
    onChange(item.label);
    setDraft(null);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && active >= 0 && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setOpen(false);
          setDraft(null);
        }
      }}
    >
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${inputId}-opt-${active}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        className={fieldClasses}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        {...aria}
      />
      <ul
        id={listId}
        role="listbox"
        hidden={!open}
        className="fade-in absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border-ui border-line bg-surface shadow-lg"
      >
        {items.length === 0 && <li className="px-4 py-3 text-muted">{t('noMatches')}</li>}
        {items.map((item, i) => (
          <li
            key={`${item.kind}-${item.label}`}
            id={`${inputId}-opt-${i}`}
            role="option"
            aria-selected={item.kind === 'option' && item.label === value}
            // Keep focus in the input so the list does not close before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(item)}
            className={clsx(
              'flex min-h-tap cursor-pointer items-center gap-2 px-4 py-2 text-base',
              i === active && 'bg-accent text-accent-ink',
              item.kind === 'add' && 'font-semibold',
            )}
          >
            {item.kind === 'option' && item.label === value && <CheckIcon width={20} height={20} />}
            {item.kind === 'add' ? t('add', { value: item.label }) : item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
