import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-page)] disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--text-inverse)] shadow-[var(--shadow-xs)] hover:bg-[var(--primary-hover)] active:brightness-95",
  secondary:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-main)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
  ghost:
    "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-main)]",
  danger:
    "border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[var(--danger-soft)] text-[var(--danger)] hover:brightness-105",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-sm",
  icon: "h-9 w-9 p-0",
};

export default function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: Props) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className ?? ""}`}
      {...props}
    />
  );
}
