import * as React from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "center",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left",
      )}
    >
      {eyebrow ? (
        <div className={cn("mb-4", align === "center" && "flex justify-center")}>
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
      ) : null}
      <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {intro ? (
        <p className="mt-4 text-base leading-relaxed text-muted sm:text-lg">
          {intro}
        </p>
      ) : null}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", className, children, ...rest },
    ref,
  ) {
    const base =
      "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-60 disabled:cursor-not-allowed";
    const sizes = {
      md: "px-5 py-2.5 text-sm",
      lg: "px-7 py-3.5 text-base",
    };
    const variants = {
      primary:
        "bg-brand text-brand-fg shadow-soft hover:shadow-glow hover:-translate-y-0.5 active:translate-y-0",
      secondary:
        "border border-border bg-surface text-ink hover:border-brand/40 hover:text-brand",
      ghost: "text-muted hover:text-ink",
    };
    return (
      <button
        ref={ref}
        className={cn(base, sizes[size], variants[variant], className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface p-6 shadow-soft transition-shadow hover:shadow-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}
