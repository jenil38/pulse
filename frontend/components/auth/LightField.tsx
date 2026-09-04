"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * A field in the dark.
 *
 * The visual work lives in `.light-field` (globals.css): on focus the rim
 * tightens to accent, the inner surface lifts, and a halo is thrown onto the
 * darkness around it. That halo is the whole point of the auth room — with the
 * lamps down, the field the visitor is typing into is the brightest thing on
 * screen, so attention follows the caret without a single instruction.
 *
 * The label sits above rather than floating inside: a label that animates into
 * a border notch is a trick that costs legibility, and this form is three
 * fields long — it does not need one.
 */
export function LightField({
  label,
  icon,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  error,
  hint,
  trailing,
  autoFocus,
  inputRef,
  onBlur,
  name,
}: {
  label: string;
  icon: IconName;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
  autoFocus?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onBlur?: () => void;
  name?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className="block pb-2 text-caption font-medium text-tertiary"
      >
        {label}
      </label>

      <div
        data-invalid={error ? "true" : undefined}
        className="light-field flex h-12 items-center gap-3 rounded-xl px-4"
      >
        <Icon
          name={icon}
          size={16}
          className="field-glyph shrink-0 text-quaternary transition-colors duration-base"
        />
        <input
          id={id}
          name={name}
          ref={inputRef}
          type={type}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="min-w-0 flex-1 text-small text-primary placeholder:text-quaternary"
        />
        {trailing}
      </div>

      {error ? (
        <p id={`${id}-error`} className="pt-2 text-caption text-failed">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="pt-2 text-caption text-quaternary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Show/hide toggle, sized to sit inside a light field without crowding it. */
export function RevealToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={shown}
      className="-mr-1.5 shrink-0 rounded-lg px-2 py-1 text-caption text-tertiary transition-colors duration-instant hover:bg-muted hover:text-primary"
    >
      {shown ? "Hide" : "Show"}
    </button>
  );
}

/**
 * Password strength — four segments, filled by an honest heuristic.
 *
 * Deliberately not a score out of 100: a bar that claims precision it does not
 * have is worse than one that just says "weak" and means it.
 */
export function StrengthMeter({ password }: { password: string }) {
  const score = strength(password);
  const labels = ["Too short", "Weak", "Fair", "Strong"];
  const tones = ["bg-failed", "bg-failed", "bg-degraded", "bg-healthy"];

  const [touched, setTouched] = useState(false);
  if (password && !touched) setTouched(true);
  if (!touched) return null;

  return (
    <div className="flex items-center gap-3 pt-2.5">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-base ${
              i <= score && password ? tones[score] : "bg-muted"
            }`}
          />
        ))}
      </div>
      <span className="w-[64px] shrink-0 text-right text-caption text-quaternary">
        {password ? labels[score] : ""}
      </span>
    </div>
  );
}

/** 0–3. Length carries most of the weight, because it actually does. */
function strength(pw: string): number {
  if (pw.length < 8) return 0;
  let s = 1;
  if (pw.length >= 12) s++;
  if (/[^A-Za-z0-9]/.test(pw) && /\d/.test(pw)) s++;
  else if (/[^a-z]/.test(pw) && /[a-z]/.test(pw) && pw.length >= 10) s++;
  return Math.min(s, 3);
}
