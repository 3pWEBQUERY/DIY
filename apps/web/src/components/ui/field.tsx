import { forwardRef, useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full bg-card border border-field rounded-xl px-3 text-[15px] text-ink placeholder:text-muted transition-colors hover:border-muted focus:border-moss focus:outline-none focus-visible:outline-2 focus-visible:outline-moss focus-visible:outline-offset-1 aria-[invalid=true]:border-danger disabled:bg-sunken disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(control, "h-11", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(control, "py-2.5 leading-relaxed min-h-24 resize-y", className)} {...p} />;
});

/** Eigenes Auswahlfeld (kein natives OS-Dropdown). */
export { Select } from "./select";

export function Label({ className, ...p }: ComponentProps<"label">) {
  return <label className={cn("block text-[13px] font-semibold text-ink mb-1.5", className)} {...p} />;
}

export function Hint({ className, ...p }: ComponentProps<"p">) {
  return <p className={cn("mt-1.5 text-[13px] text-muted", className)} {...p} />;
}

export function FieldError({ children, id }: { children?: ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
      {children}
    </p>
  );
}

/** Feld mit Label, Hinweis und Fehler – verknüpft per aria-describedby (WCAG 2.2). */
export function Field({
  label,
  hint,
  error,
  children,
  optional,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  // Nur IDs referenzieren, die auch gerendert werden – der Hinweis entfällt im Fehlerzustand
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={className}>
      <Label htmlFor={id} id={`${id}-label`}>
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted">optional</span>}
      </Label>
      {children({ id, "aria-describedby": [hintId, errId].filter(Boolean).join(" ") || undefined, "aria-invalid": error ? true : undefined })}
      {hintId && <Hint id={hintId}>{hint}</Hint>}
      <FieldError id={errId}>{error}</FieldError>
    </div>
  );
}

export function Checkbox({ label, className, ...p }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex items-start gap-3 text-sm leading-snug cursor-pointer", className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-[18px] shrink-0 appearance-none border border-field bg-card rounded-xs checked:bg-moss checked:border-moss grid place-content-center before:content-[''] before:size-2.5 before:scale-0 checked:before:scale-100 before:transition-transform before:bg-paper before:[clip-path:polygon(14%_44%,0_65%,50%_100%,100%_16%,80%_0%,43%_62%)]"
        {...p}
      />
      <span>{label}</span>
    </label>
  );
}
