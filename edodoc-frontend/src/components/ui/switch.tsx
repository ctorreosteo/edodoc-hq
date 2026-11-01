import * as React from "react"

import { cn } from "@/lib/utils"

type SwitchProps = Omit<React.ComponentProps<"button">, "onChange"> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function Switch({ checked, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-acceso={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-0 bg-input p-0.5 transition-colors outline-none",
        "data-[acceso=true]:bg-[var(--brand-orange)] dark:bg-white/20 dark:data-[acceso=true]:bg-[var(--brand-orange)]",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn("size-5 rounded-full bg-white shadow-sm transition-transform", checked && "translate-x-4")}
      />
    </button>
  )
}

export { Switch }
