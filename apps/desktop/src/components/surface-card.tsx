import type { HTMLAttributes, Ref } from "react";

interface SurfaceCardProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

export function SurfaceCard({ className, children, ...rest }: SurfaceCardProps) {
  const merged = ["surface-card", className].filter(Boolean).join(" ");
  return (
    <div className={merged} {...rest}>
      {children}
    </div>
  );
}
