import * as React from "react"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/*
  Aspetto dei menu (contestuali e a tendina) in src/style/menus.css, per data-slot.
  Qui restano solo le classi di layout: colori, raggi, ombre e animazioni stanno nel CSS.
*/

const ITEM_LAYOUT =
  "relative flex cursor-default items-center justify-start gap-2.5 text-left outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0"

function ContextMenu({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
  )
}

function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  )
}

function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  )
}

/*
  Sul telefono il sottomenu si apre come foglio sopra il menu principale: serve un "Indietro"
  che lo chiuda, e il titolo della voce che l'ha aperto. Il Sub tiene lo stato aperto/chiuso
  (anche quando lo controlla chi lo usa) e lo passa al contenuto.
*/
type SubContextValue = {
  close: () => void
  triggerLabel: React.RefObject<React.ReactNode>
}

const SubContext = React.createContext<SubContextValue | null>(null)

function ContextMenuSub({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  const [openState, setOpenState] = React.useState(defaultOpen ?? false)
  const open = openProp ?? openState
  const triggerLabel = React.useRef<React.ReactNode>(null)

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange]
  )

  const value = React.useMemo(
    () => ({ close: () => setOpen(false), triggerLabel }),
    [setOpen]
  )

  return (
    <SubContext.Provider value={value}>
      <ContextMenuPrimitive.Sub
        data-slot="context-menu-sub"
        open={open}
        onOpenChange={setOpen}
        {...props}
      />
    </SubContext.Provider>
  )
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  )
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  const sub = React.useContext(SubContext)
  // Nessuno stato: il contenuto del sottomenu lo legge solo quando si apre.
  if (sub) sub.triggerLabel.current = children

  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(ITEM_LAYOUT, className)}
      {...props}
    >
      {children}
      <ChevronRightIcon data-slot="menu-chevron" className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  const sub = React.useContext(SubContext)

  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        data-slot="context-menu-sub-content"
        className={cn(
          "z-[9999] min-w-[12rem] max-h-(--radix-context-menu-content-available-height) origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto",
          className
        )}
        {...props}
      >
        {sub ? (
          <button
            type="button"
            data-slot="menu-back"
            onClick={(event) => {
              event.stopPropagation()
              sub.close()
            }}
          >
            <ChevronLeftIcon aria-hidden />
            <span data-slot="menu-back-title">{sub.triggerLabel.current}</span>
          </button>
        ) : null}
        {children}
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          "z-[9999] min-w-[12rem] max-h-(--radix-context-menu-content-available-height) origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto",
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(ITEM_LAYOUT, className)}
      {...props}
    />
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      className={cn(ITEM_LAYOUT, className)}
      checked={checked}
      {...props}
    >
      <span data-slot="menu-indicator">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      className={cn(ITEM_LAYOUT, className)}
      {...props}
    >
      <span data-slot="menu-indicator" data-radio="">
        <ContextMenuPrimitive.ItemIndicator>
          <span data-slot="menu-radio-dot" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn("text-left", className)}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={className}
      {...props}
    />
  )
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn("ml-auto", className)}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}
