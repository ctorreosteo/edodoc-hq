/**
 * Sheet kit — il linguaggio visivo desktop dei pannelli laterali.
 *
 * Stessa famiglia della cartella clinica desktop (card morbide, chip a tono, accento di marca per tema).
 * Regola d'oro: tutto ciò che è disegno desktop porta il prefisso `sm:` (o sta in un componente che lo usa),
 * così sotto i 640px resta il design system del telefono (src/style/mobile/*, attributi data-m-*).
 *
 * Temi: chiaro (blu #1F3A63 + arancione #F0944E), dark (fondo blu, accento arancione).
 * Nota: index.css stila <button> fuori da ogni layer (radius 8px, bordo trasparente, outline): sui <button>
 * raggio, bordo e outline vanno forzati con il suffisso `!`.
 */
import * as React from "react"

import { cn } from "@/lib/utils"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export type SheetTone = "ok" | "warn" | "danger" | "info" | "violet" | "muted" | "accent"

/* ————————————————————————————————————————————————————————————————
   Classi condivise (desktop). Da appendere a markup esistente quando non si vuole toccare il telefono.
   ———————————————————————————————————————————————————————————————— */

/** Testo d'accento: blu in chiaro, arancione in dark. */
export const SK_ACCENT_TEXT = "text-[var(--brand-blue)] dark:text-[var(--brand-orange)]"

/** Card di sezione (tutte le larghezze). */
export const SK_CARD =
  "rounded-2xl border border-slate-200/80 bg-card shadow-[0_1px_2px_rgba(0,37,82,0.04),0_12px_32px_-20px_rgba(0,37,82,0.22)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none"

/** Card di sezione solo desktop: per card esistenti che il telefono disegna a modo suo. */
export const SK_CARD_SM =
  "sm:rounded-2xl sm:border sm:border-slate-200/80 sm:bg-card sm:shadow-[0_1px_2px_rgba(0,37,82,0.04),0_12px_32px_-20px_rgba(0,37,82,0.22)] dark:sm:border-white/10 dark:sm:bg-white/[0.035] dark:sm:shadow-none"

/** Riquadro interno a una card (gruppi di campi, liste, note): un gradino sotto la card. */
export const SK_INSET_SM =
  "sm:rounded-xl sm:border sm:border-slate-200/70 sm:bg-slate-50/70 dark:sm:border-white/10 dark:sm:bg-white/[0.04]"

/** Titolo di sezione (h3) desktop. */
export const SK_SECTION_TITLE_SM =
  "sm:text-[15px] sm:font-semibold sm:tracking-tight sm:text-[var(--brand-blue)] dark:sm:text-[var(--brand-orange)]"

/** Etichetta di campo desktop: piccola, maiuscoletto, spaziata. */
export const SK_LABEL_SM =
  "sm:text-[11px] sm:font-semibold sm:uppercase sm:tracking-[0.08em] sm:text-slate-500 dark:sm:text-white/55"

/** Valore in sola lettura desktop. */
export const SK_VALUE_SM = "sm:text-[14px] sm:font-medium sm:text-slate-900 dark:sm:text-white"

/** Controlli (Input, SelectTrigger, Textarea, trigger dei date picker) desktop: più alti, morbidi, focus di marca. */
export const SK_CONTROL_SM =
  "sm:min-h-10 sm:rounded-xl sm:border-slate-200 sm:bg-white sm:shadow-[0_1px_2px_rgba(0,37,82,0.05)] sm:transition-[border-color,box-shadow] sm:hover:border-slate-300 sm:focus-visible:border-[var(--brand-blue)]/50 sm:focus-visible:ring-4 sm:focus-visible:ring-[var(--brand-blue)]/10 dark:sm:border-white/15 dark:sm:bg-white/[0.06] dark:sm:hover:border-white/25 dark:sm:focus-visible:border-[var(--brand-orange)]/60 dark:sm:focus-visible:ring-[var(--brand-orange)]/15"

/** Anello di focus solo da tastiera (index.css forza l'outline del browser su ogni button). */
export const SK_FOCUS_RING =
  "outline-none! focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]/35 dark:focus-visible:ring-[var(--brand-orange)]/40"

/** Azione principale desktop (da usare su <Button>): blu pieno con arancione in dark. */
export const SK_BTN_PRIMARY_SM =
  "sm:h-10 sm:rounded-xl! sm:px-5 sm:font-semibold sm:bg-[var(--brand-blue)] sm:text-white sm:shadow-[0_8px_20px_-10px_rgba(0,37,82,0.7)] sm:transition-all sm:hover:-translate-y-px sm:hover:bg-[#2E4F80] sm:hover:shadow-[0_12px_24px_-10px_rgba(0,37,82,0.75)] sm:active:translate-y-0 dark:sm:bg-[var(--brand-orange)] dark:sm:text-[var(--brand-blue)] dark:sm:hover:bg-[#F6AE75] dark:sm:shadow-[0_8px_24px_-10px_rgba(114,250,147,0.55)]"

/** Azione secondaria desktop (da usare su <Button variant="outline">). */
export const SK_BTN_SECONDARY_SM =
  "sm:h-10 sm:rounded-xl! sm:px-4 sm:font-semibold sm:border! sm:border-slate-200! sm:bg-white sm:text-slate-700 sm:shadow-[0_1px_2px_rgba(0,37,82,0.06)] sm:hover:bg-slate-50 sm:hover:text-[var(--brand-blue)] dark:sm:border-white/15! dark:sm:bg-white/[0.06] dark:sm:text-white dark:sm:hover:bg-white/[0.12]"

/** Azione distruttiva desktop. */
export const SK_BTN_DANGER_SM =
  "sm:h-10 sm:rounded-xl! sm:px-4 sm:font-semibold sm:border! sm:border-rose-300! sm:bg-rose-50 sm:text-rose-700 sm:transition-all sm:hover:border-rose-600! sm:hover:bg-rose-600 sm:hover:text-white sm:hover:shadow-[0_8px_18px_-8px_rgba(225,29,72,0.7)] dark:sm:border-rose-400/40! dark:sm:bg-rose-500/15 dark:sm:text-rose-200 dark:sm:hover:border-rose-500! dark:sm:hover:bg-rose-500 dark:sm:hover:text-white"

/** Pulsante icona/fantasma desktop (azioni compatte nelle intestazioni di sezione). */
export const SK_BTN_GHOST_SM =
  "sm:h-8 sm:rounded-lg! sm:px-2.5 sm:text-[13px] sm:font-semibold sm:text-slate-600 sm:hover:bg-slate-100 sm:hover:text-[var(--brand-blue)] dark:sm:text-white/75 dark:sm:hover:bg-white/10 dark:sm:hover:text-[var(--brand-orange)]"

/** Barra azioni in fondo al pannello desktop: vetro appiccicato al bordo inferiore. Aggiungere i margini negativi
 *  uguali al padding orizzontale del pannello (es. sm:-mx-6 sm:px-6 con px-4 sm:px-6). */
export const SK_ACTION_BAR_SM =
  "sm:sticky sm:bottom-0 sm:z-10 sm:mt-8 sm:flex sm:items-center sm:justify-end sm:gap-3 sm:border-t sm:border-slate-200/80 sm:bg-white/80 sm:py-4 sm:backdrop-blur-xl dark:sm:border-white/10 dark:sm:bg-[#1F3A63]/85"

/** Chip per tono (tutte le larghezze). */
export const SK_TONE: Record<SheetTone, { chip: string; dot: string; tile: string }> = {
  ok: {
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25",
    dot: "bg-emerald-500",
    tile: "bg-emerald-50 text-emerald-600 ring-emerald-600/15 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  },
  warn: {
    chip: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/25",
    dot: "bg-amber-500",
    tile: "bg-amber-50 text-amber-600 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/25",
  },
  danger: {
    chip: "bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/25",
    dot: "bg-rose-500",
    tile: "bg-rose-50 text-rose-600 ring-rose-600/15 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/25",
  },
  info: {
    chip: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/25",
    dot: "bg-sky-500",
    tile: "bg-sky-50 text-sky-600 ring-sky-600/15 dark:bg-sky-400/10 dark:text-sky-200 dark:ring-sky-400/25",
  },
  violet: {
    chip: "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-400/25",
    dot: "bg-violet-500",
    tile: "bg-violet-50 text-violet-600 ring-violet-600/15 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-400/25",
  },
  muted: {
    chip: "bg-slate-100 text-slate-600 ring-slate-500/15 dark:bg-white/10 dark:text-white/75 dark:ring-white/15",
    dot: "bg-slate-400",
    tile: "bg-slate-100 text-slate-500 ring-slate-500/15 dark:bg-white/10 dark:text-white/75 dark:ring-white/15",
  },
  accent: {
    chip: "bg-[var(--brand-blue)]/[0.07] text-[var(--brand-blue)] ring-[var(--brand-blue)]/15 dark:bg-[var(--brand-orange)]/10 dark:text-[var(--brand-orange)] dark:ring-[var(--brand-orange)]/25",
    dot: "bg-[var(--brand-blue)] dark:bg-[var(--brand-orange)]",
    tile: "bg-[var(--brand-blue)]/[0.07] text-[var(--brand-blue)] ring-[var(--brand-blue)]/15 dark:bg-[var(--brand-orange)]/10 dark:text-[var(--brand-orange)] dark:ring-[var(--brand-orange)]/25",
  },
}

/* Chip dentro l'hero desktop: l'hero è scuro in tutti i temi, quindi tinte chiare e sature pensate per il blu notte.
   Ripetute con dark: perché quella variante ha specificità più alta di sm: (chip a tono di SK_TONE). */
const HERO_CHIP_SM: Record<SheetTone, string> = {
  ok: "sm:bg-emerald-400/20 sm:text-emerald-200 sm:ring-emerald-300/40 dark:sm:bg-emerald-400/20 dark:sm:text-emerald-200 dark:sm:ring-emerald-300/40",
  warn: "sm:bg-amber-400/20 sm:text-amber-200 sm:ring-amber-300/40 dark:sm:bg-amber-400/20 dark:sm:text-amber-200 dark:sm:ring-amber-300/40",
  danger: "sm:bg-rose-400/20 sm:text-rose-200 sm:ring-rose-300/40 dark:sm:bg-rose-400/20 dark:sm:text-rose-200 dark:sm:ring-rose-300/40",
  info: "sm:bg-sky-400/20 sm:text-sky-200 sm:ring-sky-300/40 dark:sm:bg-sky-400/20 dark:sm:text-sky-200 dark:sm:ring-sky-300/40",
  violet: "sm:bg-violet-400/20 sm:text-violet-200 sm:ring-violet-300/40 dark:sm:bg-violet-400/20 dark:sm:text-violet-200 dark:sm:ring-violet-300/40",
  muted: "sm:bg-white/10 sm:text-white/85 sm:ring-white/25 dark:sm:bg-white/10 dark:sm:text-white/85 dark:sm:ring-white/25",
  accent: "sm:bg-[var(--brand-orange)]/15 sm:text-[var(--brand-orange)] sm:ring-[var(--brand-orange)]/35 dark:sm:bg-[var(--brand-orange)]/15 dark:sm:text-[var(--brand-orange)] dark:sm:ring-[var(--brand-orange)]/35",
}

/* ————————————————————————————————————————————————————————————————
   Colori delle etichette per famiglia di dato (desktop).
   Ogni famiglia ha sempre lo stesso colore in tutti i pannelli, così l'occhio riconosce il tipo di campo
   prima ancora di leggerlo. Icona piena nel colore, testo dell'etichetta appena tinto.
   Silvia resta monocromatica: solo intensità diverse di bianco.
   ———————————————————————————————————————————————————————————————— */

export type SheetFieldKind =
  | "person" // paziente, osteopata, operatore, candidato, utente
  | "time" // data, ora, orario, giorno, follow up, periodo, durata
  | "money" // prezzo, importo, totale, pagato, sconto, metodo, acquisto, IVA
  | "place" // stanza, sede, indirizzo, città, CAP, provincia
  | "contact" // telefono, email, WhatsApp, cellulare
  | "status" // stato, status, esito, priorità, valutazione
  | "note" // note, descrizione, testo, messaggio, motivo
  | "tag" // tag, fonte, categoria, tipo, lead magnet, piattaforma, ruolo
  | "doc" // codice fiscale, P.IVA, documento, fattura, ID
  | "neutral"

export const SK_FIELD: Record<SheetFieldKind, { icon: string; label: string; tile: string; dot: string }> = {
  person: {
    icon: "sm:text-sky-500 dark:sm:text-sky-300",
    label: "sm:text-sky-800/75 dark:sm:text-sky-100/80",
    tile: "sm:bg-sky-50 sm:text-sky-600 sm:ring-sky-600/15 dark:sm:bg-sky-400/10 dark:sm:text-sky-300 dark:sm:ring-sky-400/25",
    dot: "bg-sky-500 dark:bg-sky-300",
  },
  time: {
    icon: "sm:text-violet-500 dark:sm:text-violet-300",
    label: "sm:text-violet-800/75 dark:sm:text-violet-100/80",
    tile: "sm:bg-violet-50 sm:text-violet-600 sm:ring-violet-600/15 dark:sm:bg-violet-400/10 dark:sm:text-violet-300 dark:sm:ring-violet-400/25",
    dot: "bg-violet-500 dark:bg-violet-300",
  },
  money: {
    icon: "sm:text-emerald-500 dark:sm:text-emerald-300",
    label: "sm:text-emerald-800/75 dark:sm:text-emerald-100/80",
    tile: "sm:bg-emerald-50 sm:text-emerald-600 sm:ring-emerald-600/15 dark:sm:bg-emerald-400/10 dark:sm:text-emerald-300 dark:sm:ring-emerald-400/25",
    dot: "bg-emerald-500 dark:bg-emerald-300",
  },
  place: {
    icon: "sm:text-teal-500 dark:sm:text-teal-300",
    label: "sm:text-teal-800/75 dark:sm:text-teal-100/80",
    tile: "sm:bg-teal-50 sm:text-teal-600 sm:ring-teal-600/15 dark:sm:bg-teal-400/10 dark:sm:text-teal-300 dark:sm:ring-teal-400/25",
    dot: "bg-teal-500 dark:bg-teal-300",
  },
  contact: {
    icon: "sm:text-indigo-500 dark:sm:text-indigo-300",
    label: "sm:text-indigo-800/75 dark:sm:text-indigo-100/80",
    tile: "sm:bg-indigo-50 sm:text-indigo-600 sm:ring-indigo-600/15 dark:sm:bg-indigo-400/10 dark:sm:text-indigo-300 dark:sm:ring-indigo-400/25",
    dot: "bg-indigo-500 dark:bg-indigo-300",
  },
  status: {
    icon: "sm:text-amber-500 dark:sm:text-amber-300",
    label: "sm:text-amber-800/80 dark:sm:text-amber-100/80",
    tile: "sm:bg-amber-50 sm:text-amber-600 sm:ring-amber-600/20 dark:sm:bg-amber-400/10 dark:sm:text-amber-300 dark:sm:ring-amber-400/25",
    dot: "bg-amber-500 dark:bg-amber-300",
  },
  note: {
    icon: "sm:text-orange-500 dark:sm:text-orange-300",
    label: "sm:text-orange-800/75 dark:sm:text-orange-100/80",
    tile: "sm:bg-orange-50 sm:text-orange-600 sm:ring-orange-600/15 dark:sm:bg-orange-400/10 dark:sm:text-orange-300 dark:sm:ring-orange-400/25",
    dot: "bg-orange-500 dark:bg-orange-300",
  },
  tag: {
    icon: "sm:text-pink-500 dark:sm:text-pink-300",
    label: "sm:text-pink-800/75 dark:sm:text-pink-100/80",
    tile: "sm:bg-pink-50 sm:text-pink-600 sm:ring-pink-600/15 dark:sm:bg-pink-400/10 dark:sm:text-pink-300 dark:sm:ring-pink-400/25",
    dot: "bg-pink-500 dark:bg-pink-300",
  },
  doc: {
    icon: "sm:text-blue-500 dark:sm:text-blue-300",
    label: "sm:text-blue-900/70 dark:sm:text-blue-100/80",
    tile: "sm:bg-blue-50 sm:text-blue-600 sm:ring-blue-600/15 dark:sm:bg-blue-400/10 dark:sm:text-blue-300 dark:sm:ring-blue-400/25",
    dot: "bg-blue-500 dark:bg-blue-300",
  },
  neutral: {
    icon: "sm:text-slate-400 dark:sm:text-white/50",
    label: "sm:text-slate-500 dark:sm:text-white/60",
    tile: "sm:bg-slate-100 sm:text-slate-500 sm:ring-slate-500/15 dark:sm:bg-white/10 dark:sm:text-white/70 dark:sm:ring-white/15",
    dot: "bg-slate-400 dark:bg-white/50",
  },
}

/* Parole chiave → famiglia. L'ordine conta: la prima che combacia vince (es. "Data pagamento" è tempo). */
const FIELD_KEYWORDS: Array<[SheetFieldKind, RegExp]> = [
  ["time", /\b(data|date|ora\b|ore\b|orari|giorn|follow|periodo|durata|scadenz|inizio|fine\b|mese|anno|settiman|ricorrenz|validit|creat|aggiunt|nascita|et[aà]\b|quando)/i],
  ["doc", /(partita|p\.?\s?iva|fiscale)/i],
  ["money", /(prezzo|importo|totale|pagat|pagament|saldo|sconto|metodo|acquist|iva\b|costo|valore|€|euro|cash|incass|spesa|fattur|acconto|margine|cassa)/i],
  ["contact", /(telefon|cellular|email|e-mail|mail|whatsapp|contatt|pec)/i],
  ["place", /(stanza|sede|indirizz|citt[aà]|cap\b|provinci|\bnazione|domicil|residenz|luogo|studio|clinica|via\b)/i],
  ["person", /(pazient|osteopat|operator|candidat|utente|nome|cognome|tirocinant|invitat|referente|presentat|consigliat|fornitore|cliente|persona|username|medico)/i],
  ["status", /(stato|status|esito|priorit|valutazion|rating|stelle|sentiment|approv|attiv)/i],
  ["note", /(note|nota|descrizion|testo|messaggio|motiv|commento|feedback|recensione|domand|rispost)/i],
  ["tag", /(tag|fonte|categori|tipo|lead|magnet|piattaform|ruolo|servizio|sigla|canale|origine|campagna|ads|risors)/i],
  ["doc", /(codice|fiscale|p\.?\s?iva|partita|document|\bid\b|#|numero|cv|allegat|transazion)/i],
]

/** Famiglia di un campo dalla sua etichetta (italiano). Usare `kind` esplicito quando l'etichetta è ambigua. */
export function skFieldKind(label: React.ReactNode): SheetFieldKind {
  if (typeof label !== "string" && typeof label !== "number") return "neutral"
  const text = String(label)
  for (const [kind, re] of FIELD_KEYWORDS) if (re.test(text)) return kind
  return "neutral"
}

/** Classi da appendere a un'etichetta esistente (testo tinto) e alla sua icona (colore pieno). Solo desktop. */
export function skLabel(kindOrLabel: SheetFieldKind | React.ReactNode) {
  const kind =
    typeof kindOrLabel === "string" && kindOrLabel in SK_FIELD ? (kindOrLabel as SheetFieldKind) : skFieldKind(kindOrLabel)
  return { label: SK_FIELD[kind].label, icon: SK_FIELD[kind].icon, tile: SK_FIELD[kind].tile, dot: SK_FIELD[kind].dot, kind }
}

/**
 * Etichetta di campo completa (desktop): micro-tessera colorata con l'icona + testo maiuscoletto tinto.
 * Sul telefono resta un'etichetta normale (la tessera sparisce, l'icona resta neutra).
 */
export function SheetLabel({
  kind,
  icon,
  children,
  className,
  htmlFor,
  ...rest
}: {
  kind?: SheetFieldKind
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
  htmlFor?: string
} & DataAttrs) {
  const f = SK_FIELD[kind ?? skFieldKind(children)]
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "flex items-center gap-2 text-sm font-medium",
        "sm:text-[11px] sm:font-semibold sm:uppercase sm:tracking-[0.08em]",
        f.label,
        className
      )}
      {...rest}
    >
      {icon && (
        <span
          aria-hidden
          className={cn(
            "inline-flex shrink-0 items-center justify-center [&_svg]:size-3.5 sm:size-5 sm:rounded-md sm:ring-1 sm:ring-inset sm:[&_svg]:size-3",
            f.tile
          )}
        >
          {icon}
        </span>
      )}
      {children}
    </label>
  )
}

/* ————————————————————————————————————————————————————————————————
   Componenti
   ———————————————————————————————————————————————————————————————— */

type DataAttrs = { [key: `data-${string}`]: string | boolean | undefined }

/** Chip di stato (tutte le larghezze). */
export function SheetChip({
  tone = "muted",
  dot = false,
  icon,
  children,
  className,
  ...rest
}: { tone?: SheetTone; dot?: boolean; icon?: React.ReactNode; children: React.ReactNode; className?: string } & DataAttrs) {
  const t = SK_TONE[tone]
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold ring-1 ring-inset [&_svg]:size-3",
        t.chip,
        className
      )}
      {...rest}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />}
      {icon}
      {children}
    </span>
  )
}

/** Chip pensata per stare nell'hero: sul telefono è una chip normale, sul desktop un vetro chiaro sul blu notte. */
export function SheetHeroChip({
  tone = "muted",
  dot = false,
  icon,
  children,
  className,
  ...rest
}: { tone?: SheetTone; dot?: boolean; icon?: React.ReactNode; children: React.ReactNode; className?: string } & DataAttrs) {
  const t = SK_TONE[tone]
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold ring-1 ring-inset [&_svg]:size-3",
        t.chip,
        "sm:backdrop-blur-sm",
        HERO_CHIP_SM[tone],
        className
      )}
      {...rest}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot, "sm:shadow-[0_0_0_3px_rgba(255,255,255,0.12)]")} />}
      {icon}
      {children}
    </span>
  )
}

/** Tessera icona quadrata a tono (intestazioni di sezione, righe di lista). */
export function SheetIconTile({
  tone = "accent",
  size = "md",
  children,
  className,
}: { tone?: SheetTone; size?: "sm" | "md" | "lg"; children: React.ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center ring-1 ring-inset",
        size === "sm" && "size-7 rounded-lg [&_svg]:size-3.5",
        size === "md" && "size-9 rounded-xl [&_svg]:size-4",
        size === "lg" && "size-11 rounded-2xl [&_svg]:size-5",
        SK_TONE[tone].tile,
        className
      )}
    >
      {children}
    </span>
  )
}

/**
 * Hero d'intestazione del pannello. Rende SheetHeader + SheetTitle + SheetDescription.
 *
 * Desktop: card blu notte con alone verde e trama sottile, icona/iniziali in vetro, titolo grande, chip e azioni.
 * Telefono: intestazione compatta (il design system mobile la rende appiccicata in alto): solo titolo,
 * descrizione e chip; icona ed eyebrow spariscono.
 */
export function SheetHero({
  icon,
  initials,
  eyebrow,
  title,
  description,
  chips,
  actions,
  meta,
  children,
  className,
  titleClassName,
  phoneHide,
  ...rest
}: {
  /** Icona nella tessera (in alternativa a `initials`). */
  icon?: React.ReactNode
  /** Iniziali nella tessera (persone). */
  initials?: string
  /** Riga piccola sopra al titolo (es. "Pagamento", "Candidato · #128"). */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Riga di SheetHeroChip sotto al titolo. */
  chips?: React.ReactNode
  /** Pulsanti in alto a destra (desktop). Usare SK_HERO_ACTION sui pulsanti. */
  actions?: React.ReactNode
  /** Striscia di metadati in fondo all'hero (es. SheetHeroStat). */
  meta?: React.ReactNode
  children?: React.ReactNode
  className?: string
  titleClassName?: string
  /** Parti da nascondere sotto i 640px, quando il telefono le mostra già altrove o vuole l'intestazione compatta. */
  phoneHide?: Array<"chips" | "meta" | "actions">
} & DataAttrs) {
  const hideOnPhone = (part: "chips" | "meta" | "actions") => phoneHide?.includes(part) && "max-sm:hidden"
  return (
    <SheetHeader
      className={cn(
        "shrink-0 gap-1 p-0 pb-3",
        "sm:relative sm:isolate sm:mt-1 sm:gap-0 sm:overflow-hidden sm:rounded-[1.4rem] sm:p-6 sm:pr-16 sm:text-white",
        "sm:bg-[radial-gradient(120%_120%_at_0%_0%,rgba(240,148,78,0.22)_0%,transparent_42%),radial-gradient(90%_120%_at_100%_100%,rgba(58,96,152,0.35)_0%,transparent_55%),linear-gradient(135deg,#24406B_0%,#1F3A63_45%,#3A6098_100%)]",
        "sm:shadow-[0_18px_40px_-22px_rgba(0,37,82,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] sm:ring-1 sm:ring-white/10",
        "dark:sm:bg-[radial-gradient(120%_120%_at_0%_0%,rgba(240,148,78,0.2)_0%,transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_100%)] dark:sm:shadow-none",
        "",
        className
      )}
      data-sk-rise="1"
      {...rest}
    >
      {/* trama a puntini, solo desktop */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 hidden opacity-[0.07] [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,black,transparent_70%)] sm:block"
      />
      <div data-sk-hero-row="" className="flex items-start gap-4">
        {(icon || initials) && (
          <span
            aria-hidden
            className="relative hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-inset ring-white/20 backdrop-blur-md shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] sm:inline-flex [&_svg]:size-6 dark:text-[var(--brand-orange)]"
          >
            {initials ? (
              <span className="text-lg font-bold tracking-tight text-[inherit]">{initials}</span>
            ) : (
              icon
            )}
            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-[var(--brand-orange)] ring-[3px] ring-[#1F3A63] dark:ring-[#274570]" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="mb-1 hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60 sm:block">
              {eyebrow}
            </div>
          )}
          <SheetTitle
            className={cn(
              "text-xl font-bold text-[var(--brand-blue)] dark:text-[var(--brand-orange)]",
              "sm:text-[26px] sm:leading-tight sm:font-bold sm:tracking-tight sm:text-white sm:break-words",
              titleClassName
            )}
          >
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className="text-sm text-muted-foreground sm:mt-1 sm:text-[14px] sm:text-white/70 dark:sm:text-white/70">
              {description}
            </SheetDescription>
          )}
          {chips && (
            <div data-sk-hero-chips="" className={cn("mt-2 flex flex-wrap items-center gap-1.5 sm:mt-3", hideOnPhone("chips"))}>
              {chips}
            </div>
          )}
        </div>
        {actions && (
          <div data-sk-hero-actions="" className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2", hideOnPhone("actions"))}>
            {actions}
          </div>
        )}
      </div>
      {meta && (
        <div
          data-sk-hero-meta=""
          className={cn(
            "mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:flex sm:flex-wrap sm:gap-0 sm:divide-x sm:divide-white/10 sm:rounded-2xl sm:bg-white/[0.06] sm:p-1 sm:ring-1 sm:ring-inset sm:ring-white/10",
            hideOnPhone("meta")
          )}
        >
          {meta}
        </div>
      )}
      {children}
    </SheetHeader>
  )
}

/** Pulsante dentro l'hero desktop (vetro chiaro sul blu). Da usare su <Button variant="outline"|"ghost">. */
export const SK_HERO_ACTION =
  "sm:h-9 sm:rounded-xl! sm:border! sm:border-white/20! sm:bg-white/10 sm:px-3.5 sm:text-[13px] sm:font-semibold sm:text-white sm:shadow-none sm:backdrop-blur-md sm:hover:bg-white/20 sm:hover:text-white dark:sm:bg-white/10 dark:sm:text-white dark:sm:hover:bg-white/20"

/** Statistica nella striscia `meta` dell'hero. */
export function SheetHeroStat({
  label,
  value,
  icon,
  className,
}: { label: React.ReactNode; value: React.ReactNode; icon?: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border bg-card px-3 py-2 sm:flex-1 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-4 sm:py-2.5 dark:bg-white/[0.04] sm:dark:bg-transparent",
        className
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-white/55 dark:sm:text-white/55 [&_svg]:size-3">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-foreground sm:text-[16px] sm:text-white dark:sm:text-white">
        {value}
      </div>
    </div>
  )
}

/**
 * Sezione a card con intestazione (icona a tono, titolo, sottotitolo, azioni a destra).
 * Sul telefono resta una card semplice e ariosa; sul desktop prende il disegno pieno.
 */
export function SheetSection({
  icon,
  tone = "accent",
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  rise,
  ...rest
}: {
  icon?: React.ReactNode
  tone?: SheetTone
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
  /** 2 | 3: entrata a cascata delle prime sezioni. */
  rise?: 2 | 3
} & DataAttrs) {
  return (
    <section className={cn(SK_CARD, "p-4 sm:p-5", className)} data-sk-rise={rise} {...rest}>
      {(title || actions) && (
        <div className="mb-4 flex items-start gap-3">
          {icon && <SheetIconTile tone={tone}>{icon}</SheetIconTile>}
          <div className="min-w-0 flex-1 pt-0.5">
            {title && (
              <h3 className={cn("text-base font-semibold leading-tight tracking-tight", SK_ACCENT_TEXT, "sm:text-[15px]")}>{title}</h3>
            )}
            {description && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

/** Griglia di coppie etichetta/valore (sola lettura). */
export function SheetKVGrid({ children, className, cols = 2 }: { children: React.ReactNode; className?: string; cols?: 1 | 2 | 3 }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-4",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-3",
        className
      )}
    >
      {children}
    </dl>
  )
}

/** Coppia etichetta/valore (sola lettura). */
export function SheetKV({
  label,
  icon,
  children,
  wide,
  className,
  kind,
}: { label: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; wide?: boolean; className?: string; kind?: SheetFieldKind }) {
  const f = SK_FIELD[kind ?? skFieldKind(label)]
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-full", className)}>
      <dt className={cn("flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-white/55 [&_svg]:size-3", f.label)}>
        {icon && <span className={cn("inline-flex", f.icon)}>{icon}</span>}
        {label}
      </dt>
      <dd className="mt-1 break-words text-[14px] font-medium text-slate-900 dark:text-white">{children ?? "—"}</dd>
    </div>
  )
}

/* Divisore: linee sfumate nel colore del tono, pillola centrale a tono con alone. */
const DIVIDER_TONE: Record<SheetTone, { line: string; glow: string }> = {
  ok: {
    line: "via-emerald-400/50 to-emerald-500/80 dark:via-emerald-300/40 dark:to-emerald-300/75",
    glow: "shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_6px_18px_-6px_var(--sk-glow)] dark:shadow-[0_0_0_4px_rgba(0,37,82,0.6),0_6px_20px_-6px_var(--sk-glow)] [--sk-glow:rgba(16,185,129,0.55)]",
  },
  warn: {
    line: "via-amber-400/50 to-amber-500/80 dark:via-amber-300/40 dark:to-amber-300/75",
    glow: "shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_6px_18px_-6px_var(--sk-glow)] dark:shadow-[0_0_0_4px_rgba(0,37,82,0.6),0_6px_20px_-6px_var(--sk-glow)] [--sk-glow:rgba(245,158,11,0.55)]",
  },
  danger: {
    line: "via-rose-400/50 to-rose-500/80 dark:via-rose-300/40 dark:to-rose-300/75",
    glow: "shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_6px_18px_-6px_var(--sk-glow)] dark:shadow-[0_0_0_4px_rgba(0,37,82,0.6),0_6px_20px_-6px_var(--sk-glow)] [--sk-glow:rgba(244,63,94,0.55)]",
  },
  info: {
    line: "via-sky-400/50 to-sky-500/80 dark:via-sky-300/40 dark:to-sky-300/75",
    glow: "shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_6px_18px_-6px_var(--sk-glow)] dark:shadow-[0_0_0_4px_rgba(0,37,82,0.6),0_6px_20px_-6px_var(--sk-glow)] [--sk-glow:rgba(14,165,233,0.55)]",
  },
  violet: {
    line: "via-violet-400/50 to-violet-500/80 dark:via-violet-300/40 dark:to-violet-300/75",
    glow: "shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_6px_18px_-6px_var(--sk-glow)] dark:shadow-[0_0_0_4px_rgba(0,37,82,0.6),0_6px_20px_-6px_var(--sk-glow)] [--sk-glow:rgba(139,92,246,0.55)]",
  },
  muted: {
    line: "via-slate-300 to-slate-400 dark:via-white/20 dark:to-white/35",
    glow: "shadow-[0_0_0_4px_rgba(255,255,255,0.6)] dark:shadow-none",
  },
  accent: {
    line: "via-[var(--brand-blue)]/35 to-[var(--brand-blue)]/70 dark:via-[var(--brand-orange)]/40 dark:to-[var(--brand-orange)]/75",
    glow: "shadow-[0_0_0_4px_rgba(255,255,255,0.6),0_6px_18px_-6px_rgba(0,37,82,0.45)] dark:shadow-[0_0_0_4px_rgba(0,37,82,0.6),0_6px_20px_-6px_rgba(114,250,147,0.45)]",
  },
}

/** Divisore tra blocchi (sostituisce la "manina"): linee sfumate colorate con pillola centrale. Nascosto sul telefono. */
export function SheetDivider({
  label,
  icon,
  tone = "accent",
  className,
}: { label?: React.ReactNode; icon?: React.ReactNode; tone?: SheetTone; className?: string }) {
  const d = DIVIDER_TONE[tone]
  return (
    <div className={cn("relative my-14 flex items-center gap-4 max-sm:hidden", className)} role="separator">
      <span className={cn("h-[2px] flex-1 rounded-full bg-gradient-to-r from-transparent", d.line)} />
      {(label || icon) && (
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] ring-1 ring-inset [&_svg]:size-3.5",
            SK_TONE[tone].chip,
            d.glow
          )}
        >
          {icon}
          {label}
        </span>
      )}
      <span className={cn("h-[2px] flex-1 rounded-full bg-gradient-to-l from-transparent", d.line)} />
    </div>
  )
}

/** Stato vuoto dentro una sezione. */
export function SheetEmpty({ icon, title, description, action, className }: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-6 py-8 text-center dark:border-white/15", className)}>
      {icon && <SheetIconTile tone="muted" size="lg" className="mb-3">{icon}</SheetIconTile>}
      <p className="text-sm font-semibold text-slate-700 dark:text-white">{title}</p>
      {description && <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Avviso in linea (errori di validazione, conferme, note importanti). */
export function SheetNotice({
  tone = "info",
  icon,
  title,
  children,
  className,
  ...rest
}: { tone?: SheetTone; icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; className?: string } & DataAttrs) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn("flex gap-3 rounded-xl px-4 py-3 text-[13px] ring-1 ring-inset", SK_TONE[tone].chip, className)}
      {...rest}
    >
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1 text-[inherit]">
        {title && <p className="font-semibold text-[inherit]">{title}</p>}
        {children && <div className="text-[inherit] opacity-90">{children}</div>}
      </div>
    </div>
  )
}
