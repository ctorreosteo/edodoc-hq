import { useId, useRef, useState, type ReactNode } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Braces, Check, ImageUp, Loader2, Pipette, RefreshCw, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { coloreValido, SEGNAPOSTO, testoSu } from '@/lib/mailing-render'
import type { MailingImmagine } from '@/services/mailing-service'
import { caricaImmagineEmail, PORTALE, TIPI_IMMAGINE } from './mailing-editor-dati'

/* Mattoni dei pannelli dell'editor email: campi, colori, allineamenti, cursori, caricamento immagini, segnaposto. */


export function Campo({ etichetta, aiuto, children, azione }: { etichetta: ReactNode; aiuto?: ReactNode; children: ReactNode; azione?: ReactNode }) {
  return (
    <div className="ml-ed-campo">
      <div className="ml-ed-etichetta-riga">
        <span className="ml-ed-etichetta">{etichetta}</span>
        {azione}
      </div>
      {children}
      {aiuto ? <div className="ml-ed-aiuto">{aiuto}</div> : null}
    </div>
  )
}

export function Sezione({ titolo, children, icona }: { titolo: ReactNode; children: ReactNode; icona?: ReactNode }) {
  return (
    <section className="ml-ed-sezione">
      <div className="ml-ed-sezione-titolo">
        {icona}
        {titolo}
      </div>
      <div className="ml-ed-sezione-corpo">{children}</div>
    </section>
  )
}

export type OpzioneSeg<T extends string | number> = { valore: T; etichetta: string; icona?: ReactNode }

export function Segmentato<T extends string | number>({
  valore,
  opzioni,
  onChange,
  ariaLabel,
  soloIcone,
}: {
  valore: T
  opzioni: OpzioneSeg<T>[]
  onChange: (v: T) => void
  ariaLabel: string
  soloIcone?: boolean
}) {
  return (
    <div className="ml-ed-seg" role="radiogroup" aria-label={ariaLabel}>
      {opzioni.map((o) => (
        <button
          key={String(o.valore)}
          type="button"
          role="radio"
          aria-checked={o.valore === valore}
          data-attivo={o.valore === valore ? '' : undefined}
          title={o.etichetta}
          aria-label={soloIcone ? o.etichetta : undefined}
          onClick={() => onChange(o.valore)}
        >
          {o.icona}
          {soloIcone ? null : <span>{o.etichetta}</span>}
        </button>
      ))}
    </div>
  )
}

export function Allineamento({ valore, onChange }: { valore: unknown; onChange: (v: 'sinistra' | 'centro' | 'destra') => void }) {
  const v = valore === 'centro' || valore === 'destra' ? valore : 'sinistra'
  return (
    <Segmentato
      ariaLabel="Allineamento"
      soloIcone
      valore={v}
      onChange={onChange}
      opzioni={[
        { valore: 'sinistra', etichetta: 'A sinistra', icona: <AlignLeft /> },
        { valore: 'centro', etichetta: 'Al centro', icona: <AlignCenter /> },
        { valore: 'destra', etichetta: 'A destra', icona: <AlignRight /> },
      ]}
    />
  )
}

export function Cursore({
  valore,
  min,
  max,
  step = 1,
  unita = 'px',
  onChange,
  ariaLabel,
}: {
  valore: number
  min: number
  max: number
  step?: number
  unita?: string
  onChange: (v: number) => void
  ariaLabel: string
}) {
  const pct = ((valore - min) / Math.max(1, max - min)) * 100
  return (
    <div className="ml-ed-cursore">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={valore}
        aria-label={ariaLabel}
        style={{ '--ml-ed-pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="ml-ed-cursore-valore">
        {valore}
        {unita}
      </span>
    </div>
  )
}

export function Interruttore({
  attivo,
  onChange,
  etichetta,
  descrizione,
  disabilitato,
}: {
  attivo: boolean
  onChange: (v: boolean) => void
  etichetta: ReactNode
  descrizione?: ReactNode
  disabilitato?: boolean
}) {
  const id = useId()
  return (
    <div className="ml-ed-interruttore" data-disabilitato={disabilitato ? '' : undefined}>
      <div className="ml-ed-interruttore-testi">
        <label htmlFor={id} className="ml-ed-interruttore-etichetta">{etichetta}</label>
        {descrizione ? <div className="ml-ed-aiuto">{descrizione}</div> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={attivo}
        disabled={disabilitato}
        className="ml-ed-switch"
        data-attivo={attivo ? '' : undefined}
        onClick={() => onChange(!attivo)}
      >
        <span className="ml-ed-switch-pallino" />
      </button>
    </div>
  )
}

const PRESET_COLORI = ['#1F3A63', '#3A6098', '#E27A2C', '#F0944E', '#2f8f74', '#0f4c81', '#3b6cf6', '#6c4bd8', '#c23b5a', '#1d2433', '#5b6661', '#f4f5f7', '#ffffff']

export function SceltaColore({
  valore,
  onChange,
  palette,
  automatico,
  ariaLabel,
}: {
  valore: string
  onChange: (v: string) => void
  palette: string[]
  /** Se valorizzato mostra l'opzione "automatico" (valore ''), con questa descrizione. */
  automatico?: string
  ariaLabel: string
}) {
  const [aperto, setAperto] = useState(false)
  const [bozza, setBozza] = useState(valore)
  const colore = coloreValido(valore)
  const unici = Array.from(new Set([...palette.map((c) => coloreValido(c)).filter((c): c is string => !!c), ...PRESET_COLORI]))
  const applicaBozza = (v: string) => {
    setBozza(v)
    const c = coloreValido(v.startsWith('#') ? v : `#${v}`)
    if (c) onChange(c)
  }
  return (
    <Popover
      open={aperto}
      onOpenChange={(o) => {
        setAperto(o)
        if (o) setBozza(valore)
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="ml-ed-colore" aria-label={ariaLabel}>
          <span className="ml-ed-colore-campione" data-auto={colore ? undefined : ''} style={colore ? { background: colore } : undefined} />
          <span className="ml-ed-colore-testo">{colore ? colore.toUpperCase() : automatico ? 'Automatico' : '—'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="ml-ed-pop ml-ed-pop-colore" align="start" {...PORTALE}>
        {automatico ? (
          <button type="button" className="ml-ed-colore-auto" data-attivo={!colore ? '' : undefined} onClick={() => onChange('')}>
            <span className="ml-ed-colore-campione" data-auto="" />
            <span>
              <strong>Automatico</strong>
              <small>{automatico}</small>
            </span>
            {!colore ? <Check className="ml-ed-colore-ok" /> : null}
          </button>
        ) : null}
        <div className="ml-ed-colore-griglia" role="listbox" aria-label="Colori">
          {unici.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={c === colore}
              aria-label={c}
              title={c.toUpperCase()}
              className="ml-ed-colore-tessera"
              style={{ background: c, color: testoSu(c) }}
              onClick={() => {
                onChange(c)
                setAperto(false)
              }}
            >
              {c === colore ? <Check /> : null}
            </button>
          ))}
        </div>
        <div className="ml-ed-colore-hex">
          <label className="ml-ed-colore-nativo" title="Scegli un colore qualsiasi">
            <Pipette />
            <input type="color" value={colore ?? '#1F3A63'} onChange={(e) => applicaBozza(e.target.value)} aria-label="Selettore colore" />
          </label>
          <input
            className="ml-input ml-ed-input"
            value={bozza}
            spellCheck={false}
            placeholder="#1F6F5C"
            aria-label="Codice colore"
            onChange={(e) => applicaBozza(e.target.value.trim())}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}


export function CaricaImmagine({
  url,
  onCaricata,
  onRimuovi,
  etichetta = 'Trascina qui un\'immagine',
}: {
  url: string
  onCaricata: (img: MailingImmagine) => void
  onRimuovi?: () => void
  etichetta?: string
}) {
  const [stato, setStato] = useState<'fermo' | 'sopra' | 'carico'>('fermo')
  const input = useRef<HTMLInputElement>(null)
  const carica = async (file: File | undefined | null) => {
    if (!file) return
    setStato('carico')
    const img = await caricaImmagineEmail(file)
    setStato('fermo')
    if (img) onCaricata(img)
  }
  return (
    <div
      className="ml-ed-carica"
      data-stato={stato}
      data-piena={url ? '' : undefined}
      tabIndex={0}
      role="button"
      aria-label={url ? 'Sostituisci immagine' : 'Carica immagine'}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          input.current?.click()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (stato !== 'carico') setStato('sopra')
      }}
      onDragLeave={() => stato === 'sopra' && setStato('fermo')}
      onDrop={(e) => {
        e.preventDefault()
        void carica(e.dataTransfer.files?.[0])
      }}
      onPaste={(e) => {
        const f = Array.from(e.clipboardData.files ?? [])[0]
        if (f) {
          e.preventDefault()
          void carica(f)
        }
      }}
    >
      <input ref={input} type="file" accept={TIPI_IMMAGINE.join(',')} hidden onChange={(e) => void carica(e.target.files?.[0])} />
      {url ? <img src={url} alt="" className="ml-ed-carica-anteprima" /> : null}
      <div className="ml-ed-carica-velo">
        {stato === 'carico' ? <Loader2 className="ml-ed-gira" /> : url ? <RefreshCw /> : <ImageUp />}
        <span>{stato === 'carico' ? 'Caricamento…' : url ? 'Sostituisci' : etichetta}</span>
        {!url && stato !== 'carico' ? <small>oppure clicca o incolla · JPG, PNG, GIF</small> : null}
      </div>
      {url && onRimuovi ? (
        <button
          type="button"
          className="ml-ed-carica-rimuovi"
          aria-label="Rimuovi immagine"
          onClick={(e) => {
            e.stopPropagation()
            onRimuovi()
          }}
        >
          <Trash2 />
        </button>
      ) : null}
    </div>
  )
}

export function MenuSegnaposto({ onScegli, compatto, conFallback = true }: { onScegli: (testo: string) => void; compatto?: boolean; conFallback?: boolean }) {
  const gruppi: { titolo: string; chiave: 'contatto' | 'studio' | 'link' }[] = [
    { titolo: 'Del contatto', chiave: 'contatto' },
    { titolo: 'Generali', chiave: 'studio' },
    { titolo: 'Link speciali', chiave: 'link' },
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={compatto ? 'ml-ed-tb-btn' : 'ml-btn ml-btn--ghost ml-btn--sm'} title="Inserisci un dato personalizzato" aria-label="Inserisci segnaposto" onMouseDown={(e) => e.preventDefault()}>
          <Braces />
          {compatto ? null : <span>Personalizza</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="ml-ed-menu" align="start" {...PORTALE}>
        {gruppi.map((g, i) => (
          <div key={g.chiave}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="ml-ed-menu-gruppo">{g.titolo}</DropdownMenuLabel>
            {SEGNAPOSTO.filter((s) => s.gruppo === g.chiave).map((s) => (
              <DropdownMenuItem
                key={s.chiave}
                className="ml-ed-menu-voce"
                onSelect={() => onScegli(conFallback && s.gruppo === 'contatto' && s.chiave !== 'email' ? `{{${s.chiave}|}}` : `{{${s.chiave}}}`)}
              >
                <span className="ml-ed-menu-voce-nome">{s.etichetta}</span>
                <span className="ml-ed-menu-voce-es">{s.esempio}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

