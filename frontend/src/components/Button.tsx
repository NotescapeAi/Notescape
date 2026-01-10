import React from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base = "inline-flex items-center justify-center rounded-xl font-semibold transition disabled:opacity-60";
const variants: Record<Variant, string> = {
  primary: "bg-[#7B5FEF] text-white hover:bg-[#6A4DE6] shadow-[0_10px_24px_rgba(123,95,239,0.35)]",
  secondary: "border border-[#EFE7FF] bg-white text-[#5A4B92] hover:border-[#E0D6FF]",
  ghost: "text-[#5A4B92] hover:bg-[#F4F0FF]",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
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
