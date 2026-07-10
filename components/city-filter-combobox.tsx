"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  filterCityOptions,
  type CityFilterOption,
} from "@/lib/locationFilters";

export function CityFilterCombobox({
  value,
  options,
  disabled,
  disabledMessage = "Select a country first",
  emptyMessage = "No cities available for this location",
  noMatchMessage = "No cities found",
  onChange,
}: {
  value: string;
  options: CityFilterOption[];
  disabled: boolean;
  disabledMessage?: string;
  emptyMessage?: string;
  noMatchMessage?: string;
  onChange: (value: string) => void;
}) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedLabel = value === "all" ? "All" : value;

  const filteredOptions = useMemo(
    () => filterCityOptions(options, query),
    [options, query],
  );

  const menuOptions = useMemo(
    () => [{ value: "all", label: "All" }, ...filteredOptions],
    [filteredOptions],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlightedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, filteredOptions.length]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function selectOption(optionValue: string) {
    onChange(optionValue);
    setOpen(false);
  }

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;

    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        Math.min(current + 1, menuOptions.length - 1),
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && menuOptions[highlightedIndex]) {
      event.preventDefault();
      selectOption(menuOptions[highlightedIndex].value);
    }
  }

  const listMessage = disabled
    ? disabledMessage
    : options.length === 0
      ? emptyMessage
      : filteredOptions.length === 0
        ? noMatchMessage
        : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        className="crm-select flex w-full items-center justify-between text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{selectedLabel}</span>
        <span aria-hidden className="ml-2 text-slate-400">
          ▾
        </span>
      </button>

      {open ? (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search cities..."
              className="crm-input w-full"
              aria-label="Search cities"
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            aria-label="City options"
            className="max-h-56 overflow-y-auto py-1"
          >
            {listMessage ? (
              <li className="px-3 py-2 text-sm text-slate-500">{listMessage}</li>
            ) : (
              menuOptions.map((option, index) => (
                <li key={option.value === "all" ? "all" : option.value} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === option.value}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectOption(option.value)}
                    className={
                      index === highlightedIndex
                        ? "block w-full whitespace-nowrap px-3 py-2 text-left text-sm bg-slate-100 text-slate-900"
                        : "block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    }
                  >
                    {option.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
