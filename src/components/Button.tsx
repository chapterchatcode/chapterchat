import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "quiet";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const CLASS: Record<Variant, string> = {
  primary: "btn",
  secondary: "btn btn--secondary",
  quiet: "btn btn--quiet",
};

/** Full-width pill. Primary is an --ink fill; nothing else is ever filled. */
export function Button({ variant = "primary", className, children, ...rest }: Props) {
  return (
    <button type="button" className={[CLASS[variant], className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </button>
  );
}
