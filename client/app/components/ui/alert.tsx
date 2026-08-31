import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~/lib/utils"

/**
 * Inline contextual message — a serviceability warning in the shipment wizard,
 * a failed AWB, a "this shipment has an open NDR" banner.
 *
 * Distinct from a toast, which is transient. This one is part of the page and
 * stays put.
 */
const alertVariants = cva(
  "relative flex w-full gap-3 rounded-lg px-4 py-3 text-body [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground [&>svg]:text-muted-foreground",
        info: "bg-info-subtle text-foreground [&>svg]:text-info",
        success: "bg-success-subtle text-foreground [&>svg]:text-success",
        warning: "bg-warning-subtle text-foreground [&>svg]:text-warning-strong",
        danger: "bg-danger-subtle text-foreground [&>svg]:text-danger",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-title"
      className={cn("text-body font-semibold", className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-caption text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, alertVariants }
