import { Link } from "react-router-dom";
import logoDark from "../assets/logo-dark.png";
import logoLight from "../assets/logo-light.png";
import { useTheme } from "../hooks/useTheme";
import "./brandLogo.css";

type BrandLogoVariant = "header" | "sidebar" | "footer" | "icon-only";

type BrandLogoProps = {
  variant?: BrandLogoVariant;
  forceTheme?: "light" | "dark";
  to?: string;
  className?: string;
  showText?: boolean;
};

export default function BrandLogo({
  variant = "header",
  forceTheme,
  to = "/",
  className = "",
  showText,
}: BrandLogoProps) {
  const { resolvedTheme } = useTheme();
  const logoTheme = forceTheme ?? resolvedTheme;
  const isDarkLogo = logoTheme === "dark";
  const labelVisible = showText ?? variant !== "icon-only";
  const textClass = isDarkLogo ? "text-white" : "text-[var(--text-main)]";

  const content = (
    <>
      <img
        src={isDarkLogo ? logoDark : logoLight}
        alt="Notescape logo"
        width={36}
        height={36}
        className="brand-logo-img"
        decoding="async"
      />
      {labelVisible ? (
        <span className={`brand-logo-text ${textClass}`}>Notescape</span>
      ) : null}
    </>
  );

  if (!to) {
    return (
      <span className={`brand-logo brand-logo-${variant} ${className}`}>
        {content}
      </span>
    );
  }

  return (
    <Link to={to} className={`brand-logo brand-logo-${variant} ${className}`}>
      {content}
    </Link>
  );
}
