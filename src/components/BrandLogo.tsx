"use client";

type BrandLogoProps = {
  href?: string;
  showVersion?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function BrandLogo({ href = "/", showVersion = false, size = "md", className = "" }: BrandLogoProps) {
  const markSize = size === "lg" ? "h-14 w-14 rounded-2xl" : size === "sm" ? "h-8 w-8 rounded-lg" : "h-9 w-9 rounded-xl";
  const svgSize = size === "lg" ? 28 : size === "sm" ? 16 : 18;
  const wordClass =
    size === "lg" ? "text-[1.75rem]" : size === "sm" ? "text-[1.05rem]" : "text-[1.35rem]";

  const inner = (
    <>
      <span className={`envision-mail-logo__mark ${markSize}`} aria-hidden>
        <svg width={svgSize} height={svgSize} viewBox="0 0 32 32" fill="none">
          <path
            d="M6 10.5c0-2.2 1.8-4 4-4h12c2.2 0 4 1.8 4 4v.4L16 17.2 6 10.9v-.4Z"
            fill="white"
            fillOpacity="0.95"
          />
          <path
            d="M6 12.4 16 18.8l10-6.4V21.5c0 2.2-1.8 4-4 4H10c-2.2 0-4-1.8-4-4V12.4Z"
            fill="white"
            fillOpacity="0.82"
          />
          <path d="M6 12.4 16 18.8l10-6.4" stroke="white" strokeOpacity="0.55" strokeWidth="1.2" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className={`envision-mail-logo__wordmark ${wordClass}`}>Envision Mail</span>
        {showVersion ? <span className="envision-mail-logo__sub">Version 2.2</span> : null}
      </span>
    </>
  );

  if (href && href.length > 0) {
    return (
      <a href={href} className={`envision-mail-logo ${className}`} aria-label="Envision Mail">
        {inner}
      </a>
    );
  }
  return (
    <div className={`envision-mail-logo ${className}`} aria-label="Envision Mail">
      {inner}
    </div>
  );
}
