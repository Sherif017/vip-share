import Image from "next/image";

type KreLogoVariant = "header" | "auth" | "footer" | "fallback";

type KreLogoProps = {
  variant?: KreLogoVariant;
  className?: string;
};

const variantStyles: Record<
  KreLogoVariant,
  { width: number; height: number; className: string; sizes: string }
> = {
  header: {
    width: 1768,
    height: 890,
    className: "h-8 w-auto object-contain sm:h-9",
    sizes: "(min-width: 640px) 96px, 80px",
  },
  auth: {
    width: 1768,
    height: 890,
    className: "h-14 w-auto object-contain sm:h-16",
    sizes: "(min-width: 640px) 128px, 112px",
  },
  footer: {
    width: 1768,
    height: 890,
    className: "h-7 w-auto object-contain",
    sizes: "72px",
  },
  fallback: {
    width: 1768,
    height: 890,
    className: "h-9 w-auto object-contain opacity-70",
    sizes: "96px",
  },
};

export default function KreLogo({
  variant = "header",
  className = "",
}: KreLogoProps) {
  const style = variantStyles[variant];

  return (
    <Image
      src="/Kre-logo.png"
      alt="K-RÉ"
      width={style.width}
      height={style.height}
      priority={variant === "header" || variant === "auth"}
      sizes={style.sizes}
      className={`${style.className} ${className}`.trim()}
    />
  );
}
