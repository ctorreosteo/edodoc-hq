import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[10000] bg-black/50 data-[state=closed]:pointer-events-none",
        /* Desktop: velo blu di marca con leggera sfocatura della pagina sotto */
        "sm:bg-[#162A48]/40 sm:backdrop-blur-[3px] dark:sm:bg-black/55 data-[state=open]:duration-500 data-[state=closed]:duration-300",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-[10001] flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          /* Desktop: pannello flottante, staccato dai bordi, con angoli morbidi e ombra profonda */
          "sm:ease-[cubic-bezier(0.32,0.72,0,1)] sm:shadow-[0_0_0_1px_rgba(0,37,82,0.06),0_24px_80px_-12px_rgba(0,26,61,0.45)] dark:sm:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_30px_90px_-10px_rgba(0,0,0,0.7)]",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm sm:inset-y-3 sm:right-3 sm:h-auto sm:rounded-[1.75rem] sm:border",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm sm:inset-y-3 sm:left-3 sm:h-auto sm:rounded-[1.75rem] sm:border",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b sm:rounded-b-[1.75rem]",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t sm:rounded-t-[1.75rem]",
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className={cn(
            "ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none",
            /* Desktop: X rotonda rossa, dentro l'angolo dell'hero (che lascia sm:pr-16 libero a destra); ruota al passaggio del mouse */
            "sm:top-7 sm:right-9 sm:z-20 sm:inline-flex sm:size-9 sm:items-center sm:justify-center sm:rounded-full! sm:border! sm:border-rose-300/50! sm:bg-rose-500 sm:text-white sm:opacity-100 sm:shadow-[0_6px_16px_-6px_rgba(225,29,72,0.75)] sm:transition-all sm:duration-300 sm:outline-none! sm:hover:rotate-90 sm:hover:scale-105 sm:hover:bg-rose-600 sm:hover:shadow-[0_10px_24px_-6px_rgba(225,29,72,0.85)] sm:focus:ring-0 sm:focus-visible:ring-2 sm:focus-visible:ring-rose-300/60",
            "dark:sm:bg-rose-500 dark:sm:text-white dark:sm:hover:bg-rose-600",
            ""
          )}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold sm:tracking-tight", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
