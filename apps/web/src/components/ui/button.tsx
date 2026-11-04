import Link from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ink" | "outline" | "ghost" | "clay" | "danger" | "link";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold select-none transition-[background-color,color,border-color,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-moss text-paper hover:bg-moss-ink border border-moss hover:border-moss-ink",
  ink: "bg-ink text-paper hover:bg-ink-2 border border-ink",
  outline: "border border-line-strong bg-card text-ink hover:border-ink",
  ghost: "text-ink hover:bg-sunken border border-transparent",
  clay: "bg-clay text-paper hover:bg-clay-ink border border-clay",
  danger: "bg-danger text-paper hover:opacity-90 border border-danger",
  link: "text-moss underline-offset-4 hover:underline px-0 h-auto",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-xl",
  md: "h-11 px-5 text-sm rounded-xl",
  lg: "h-12 px-6 text-[15px] rounded-xl",
  icon: "size-10 rounded-xl",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], variant === "link" ? "" : sizes[size], className);
}

export const Button = forwardRef<HTMLButtonElement, ComponentProps<"button"> & { variant?: Variant; size?: Size }>(
  function Button({ variant = "primary", size = "md", className, type = "button", ...props }, ref) {
    return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
  },
);

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
