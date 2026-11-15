import { useEffect, useRef, type ReactNode } from 'react'
import { Copy, Palette, Plus, Star, Trash2, X } from 'lucide-react'
import type { MailingBlocco, MailingDocumento, MailingImpostazioniDocumento, MailingTipoBlocco } from '@/services/mailing-service'
import {
  ETICHETTE_BLOCCO,
  FONT_DISPONIBILI,
  idYoutube,
  IMPOSTAZIONI_DEFAULT,
  miniaturaYoutube,
  RETI_SOCIAL,
  type MailingReteSocial,
} from '@/lib/mailing-render'
import {
  Allineamento,
  CaricaImmagine,
  Campo,
  Cursore,
  Interruttore,
  MenuSegnaposto,
  SceltaColore,
  Segmentato,
  Sezione,
} from './mailing-editor-controlli'
import { inserisciAlCursore, TEMI_RAPIDI } from './mailing-editor-dati'
import { EditorTesto } from './mailing-editor-testo'
import { ICONE_BLOCCO } from './mailing-editor-dati'

/* Pannello a destra: proprietà del blocco selezionato oppure stile globale del documento. */

type Aggiorna = (patch: Record<string, unknown>, chiave?: string) => void

function paletteDoc(imp: MailingImpostazioniDocumento): string[] {
  return [imp.colorePrimario, imp.coloreTesto, imp.sfondo, imp.sfondoContenuto]
}

function Testo({
  valore,
  onChange,
  placeholder,
  segnaposto,
  multiriga,
  etichetta,
  tipo = 'text',
}: {
  valore: string
  onChange: (v: string) => void
  placeholder?: string
  segnaposto?: boolean
  multiriga?: boolean
  etichetta: string
  tipo?: string
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const cursore = useRef<number | null>(null)
  useEffect(() => {
    if (cursore.current != null && ref.current) {
      ref.current.setSelectionRange(cursore.current, cursore.current)
      cursore.current = null
    }
  })
  const campo = multiriga ? (
    <textarea ref={ref} className="ml-textarea ml-ed-input ml-ed-area" rows={4} value={valore} placeholder={placeholder} aria-label={etichetta} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input ref={ref} type={tipo} className="ml-input ml-ed-input" value={valore} placeholder={placeholder} aria-label={etichetta} onChange={(e) => onChange(e.target.value)} />
  )
  return (
    <Campo
      etichetta={etichetta}
      azione={
        segnaposto ? (
          <MenuSegnaposto
            compatto
            onScegli={(s) => {
              const r = inserisciAlCursore(ref.current, valore, s)
              cursore.current = r.cursore
              onChange(r.valore)
              ref.current?.focus()
            }}
          />
        ) : undefined
      }
    >
      {campo}
    </Campo>
  )
}

function Link({ valore, onChange, etichetta = 'Link', aiuto }: { valore: string; onChange: (v: string) => void; etichetta?: string; aiuto?: ReactNode }) {
  const errato = valore && !/^(https?:\/\/|mailto:|tel:|\{\{)/i.test(valore.trim())
  return (
    <Campo etichetta={etichetta} aiuto={errato ? <span className="ml-ed-avviso">Inizia con https:// (oppure mailto: o tel:)</span> : aiuto}>
      <input
        type="url"
        inputMode="url"
        className="ml-input ml-ed-input"
        value={valore}
        placeholder="https://"
        aria-label={etichetta}
        aria-invalid={errato ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (v && /^[\w-]+(\.[\w-]+)+/.test(v) && !/^[a-z]+:/i.test(v)) onChange(`https://${v}`)
        }}
      />
    </Campo>
  )
}

function n(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function s(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

// ───────────────────────── Per tipo ─────────────────────────

function ProprietaIntestazione({ b, agg, imp }: { b: MailingBlocco; agg: Aggiorna; imp: MailingImpostazioniDocumento }) {
  const p = b.props
  return (
    <>
      <Campo etichetta="Logo">
        <CaricaImmagine
          url={s(p.logoUrl)}
          etichetta="Trascina qui il logo"
          onCaricata={(img) => agg({ logoUrl: img.url, naturaleL: img.larghezza ?? undefined, naturaleA: img.altezza ?? undefined })}
          onRimuovi={() => agg({ logoUrl: '', naturaleL: undefined, naturaleA: undefined })}
        />
      </Campo>
      {s(p.logoUrl) ? (
        <Campo etichetta="Larghezza del logo">
          <Cursore ariaLabel="Larghezza del logo" valore={n(p.logoLarghezza, 140)} min={40} max={320} onChange={(v) => agg({ logoLarghezza: v }, 'logoLarghezza')} />
        </Campo>
      ) : null}
      <Testo etichetta={s(p.logoUrl) ? 'Sottotitolo' : 'Nome'} valore={s(p.testo)} onChange={(v) => agg({ testo: v }, 'testo')} placeholder="Dr. Edoardo Bo" />
      <Link valore={s(p.link)} onChange={(v) => agg({ link: v }, 'link')} aiuto="Dove porta il click sul logo, di solito il sito." />
      <Campo etichetta="Allineamento">
        <Allineamento valore={p.allineamento} onChange={(v) => agg({ allineamento: v })} />
      </Campo>
      <Campo etichetta="Fondo">
        <SceltaColore ariaLabel="Colore di fondo" valore={s(p.sfondo)} palette={paletteDoc(imp)} automatico="Come il resto dell'email" onChange={(v) => agg({ sfondo: v })} />
      </Campo>
    </>
  )
}

function ProprietaTitolo({ b, agg, imp }: { b: MailingBlocco; agg: Aggiorna; imp: MailingImpostazioniDocumento }) {
  const p = b.props
  return (
    <>
      <Testo etichetta="Testo" valore={s(p.testo)} onChange={(v) => agg({ testo: v }, 'testo')} segnaposto multiriga={s(p.testo).length > 60} />
      <Campo etichetta="Dimensione">
        <Segmentato
          ariaLabel="Dimensione del titolo"
          valore={n(p.livello, 1)}
          onChange={(v) => agg({ livello: v })}
          opzioni={[
            { valore: 1, etichetta: 'Grande' },
            { valore: 2, etichetta: 'Medio' },
            { valore: 3, etichetta: 'Piccolo' },
          ]}
        />
      </Campo>
      <div className="ml-ed-riga2">
        <Campo etichetta="Allineamento">
          <Allineamento valore={p.allineamento} onChange={(v) => agg({ allineamento: v })} />
        </Campo>
        <Campo etichetta="Colore">
          <SceltaColore ariaLabel="Colore del titolo" valore={s(p.colore)} palette={paletteDoc(imp)} automatico="Colore del testo" onChange={(v) => agg({ colore: v })} />
        </Campo>
      </div>
    </>
  )
}

function ProprietaTesto({ b, agg, imp, ai, focus }: { b: MailingBlocco; agg: Aggiorna; imp: MailingImpostazioniDocumento; ai: boolean; focus: boolean }) {
  const p = b.props
  return (
    <>
      <EditorTesto html={s(p.html)} aiDisponibile={ai} autoFocus={focus} onChange={(html) => agg({ html }, 'html')} />
      <div className="ml-ed-riga2">
        <Campo etichetta="Allineamento">
          <Allineamento valore={p.allineamento} onChange={(v) => agg({ allineamento: v })} />
        </Campo>
        <Campo etichetta="Colore">
          <SceltaColore ariaLabel="Colore del testo" valore={s(p.colore)} palette={paletteDoc(imp)} automatico="Colore del testo" onChange={(v) => agg({ colore: v })} />
        </Campo>
      </div>
      <Campo etichetta="Dimensione del testo">
        <Cursore ariaLabel="Dimensione del testo" valore={n(p.dimensione, 16)} min={12} max={22} onChange={(v) => agg({ dimensione: v }, 'dimensione')} />
      </Campo>
    </>
  )
}

function ProprietaImmagine({ b, agg }: { b: MailingBlocco; agg: Aggiorna }) {
  const p = b.props
  const altMancante = s(p.url) && !s(p.alt).trim()
  return (
    <>
      <Campo etichetta="Immagine">
        <CaricaImmagine
          url={s(p.url)}
          onCaricata={(img) => agg({ url: img.url, naturaleL: img.larghezza ?? undefined, naturaleA: img.altezza ?? undefined })}
          onRimuovi={() => agg({ url: '', naturaleL: undefined, naturaleA: undefined })}
        />
      </Campo>
      <Campo
        etichetta="Descrizione per chi non vede l'immagine"
        aiuto={altMancante ? <span className="ml-ed-avviso">Consigliata: molti client bloccano le immagini e mostrano questo testo.</span> : 'Letta dagli screen reader e mostrata se le immagini sono bloccate.'}
      >
        <input className="ml-input ml-ed-input" value={s(p.alt)} placeholder="Es. Un piatto unico bilanciato" aria-label="Testo alternativo" onChange={(e) => agg({ alt: e.target.value }, 'alt')} />
      </Campo>
      <Campo etichetta="Larghezza">
        <Cursore ariaLabel="Larghezza immagine" valore={n(p.larghezza, 100)} min={10} max={100} step={5} unita="%" onChange={(v) => agg({ larghezza: v }, 'larghezza')} />
      </Campo>
      <div className="ml-ed-riga2">
        <Campo etichetta="Allineamento">
          <Allineamento valore={p.allineamento} onChange={(v) => agg({ allineamento: v })} />
        </Campo>
        <Campo etichetta="Angoli">
          <Cursore ariaLabel="Arrotondamento angoli" valore={p.raggio == null ? 12 : n(p.raggio, 12)} min={0} max={32} onChange={(v) => agg({ raggio: v }, 'raggio')} />
        </Campo>
      </div>
      <Link valore={s(p.link)} onChange={(v) => agg({ link: v }, 'link')} aiuto="Facoltativo: rende cliccabile l'immagine." />
    </>
  )
}

function ProprietaPulsante({ b, agg, imp }: { b: MailingBlocco; agg: Aggiorna; imp: MailingImpostazioniDocumento }) {
  const p = b.props
  return (
    <>
      <Testo etichetta="Testo del pulsante" valore={s(p.testo)} onChange={(v) => agg({ testo: v }, 'testo')} placeholder="Prenota la tua visita" />
      <Link valore={s(p.url)} onChange={(v) => agg({ url: v }, 'url')} etichetta="Porta a" aiuto={!s(p.url) ? <span className="ml-ed-avviso">Manca il link: il pulsante non porterebbe da nessuna parte.</span> : undefined} />
      <div className="ml-ed-riga2">
        <Campo etichetta="Colore">
          <SceltaColore ariaLabel="Colore del pulsante" valore={s(p.colore)} palette={paletteDoc(imp)} automatico="Colore principale" onChange={(v) => agg({ colore: v })} />
        </Campo>
        <Campo etichetta="Testo">
          <SceltaColore ariaLabel="Colore del testo del pulsante" valore={s(p.coloreTesto)} palette={['#ffffff', ...paletteDoc(imp)]} automatico="Il più leggibile" onChange={(v) => agg({ coloreTesto: v })} />
        </Campo>
      </div>
      <div className="ml-ed-riga2">
        <Campo etichetta="Allineamento">
          <Allineamento valore={p.allineamento} onChange={(v) => agg({ allineamento: v })} />
        </Campo>
        <Campo etichetta="Angoli">
          <Cursore ariaLabel="Arrotondamento" valore={p.raggio == null ? imp.raggio : n(p.raggio, 8)} min={0} max={30} onChange={(v) => agg({ raggio: v }, 'raggio')} />
        </Campo>
      </div>
      <Interruttore etichetta="A tutta larghezza" descrizione="Più facile da toccare sul telefono." attivo={!!p.larghezzaPiena} onChange={(v) => agg({ larghezzaPiena: v })} />
    </>
  )
}

function ProprietaDivisore({ b, agg, imp }: { b: MailingBlocco; agg: Aggiorna; imp: MailingImpostazioniDocumento }) {
  const p = b.props
  return (
    <>
      <Campo etichetta="Colore">
        <SceltaColore ariaLabel="Colore del divisore" valore={s(p.colore)} palette={paletteDoc(imp)} automatico="Grigio tenue" onChange={(v) => agg({ colore: v })} />
      </Campo>
      <Campo etichetta="Spessore">
        <Cursore ariaLabel="Spessore" valore={n(p.spessore, 1)} min={1} max={8} onChange={(v) => agg({ spessore: v }, 'spessore')} />
      </Campo>
      <Campo etichetta="Spazio sopra e sotto">
        <Cursore ariaLabel="Margine" valore={n(p.margine, 16)} min={0} max={64} step={2} onChange={(v) => agg({ margine: v }, 'margine')} />
      </Campo>
    </>
  )
}

function ProprietaSpazio({ b, agg }: { b: MailingBlocco; agg: Aggiorna }) {
  return (
    <Campo etichetta="Altezza">
      <Cursore ariaLabel="Altezza" valore={n(b.props.altezza, 24)} min={4} max={160} step={4} onChange={(v) => agg({ altezza: v }, 'altezza')} />
    </Campo>
  )
}

const PROPORZIONI: { valore: string; etichetta: string; p: number[] }[] = [
  { valore: '50-50', etichetta: '½ ½', p: [50, 50] },
  { valore: '33-67', etichetta: '⅓ ⅔', p: [33, 67] },
  { valore: '67-33', etichetta: '⅔ ⅓', p: [67, 33] },
  { valore: '33-33-34', etichetta: '⅓ ⅓ ⅓', p: [33, 33, 34] },
]

function ProprietaColonne({
  b,
  agg,
  onCambiaColonne,
  onSeleziona,
  onAggiungiFiglio,
}: {
  b: MailingBlocco
  agg: Aggiorna
  onCambiaColonne: (proporzioni: number[]) => void
  onSeleziona: (id: string) => void
  onAggiungiFiglio: (colonna: number, tipo: MailingTipoBlocco) => void
}) {
  const p = b.props
  const prop = Array.isArray(p.proporzioni) ? (p.proporzioni as number[]) : [50, 50]
  const chiave = PROPORZIONI.find((x) => x.p.join('-') === prop.join('-'))?.valore ?? '50-50'
  const FIGLI: MailingTipoBlocco[] = ['titolo', 'testo', 'immagine', 'pulsante', 'recensione', 'video', 'spazio']
  return (
    <>
      <Campo etichetta="Disposizione">
        <Segmentato ariaLabel="Proporzioni" valore={chiave} onChange={(v) => onCambiaColonne(PROPORZIONI.find((x) => x.valore === v)!.p)} opzioni={PROPORZIONI.map((x) => ({ valore: x.valore, etichetta: x.etichetta }))} />
      </Campo>
      <Campo etichetta="Spazio tra le colonne">
        <Cursore ariaLabel="Spazio tra le colonne" valore={n(p.spazio, 20)} min={0} max={48} step={2} onChange={(v) => agg({ spazio: v }, 'spazio')} />
      </Campo>
      <Interruttore etichetta="Una sotto l'altra sul telefono" descrizione="Consigliato: sugli schermi stretti le colonne affiancate diventano illeggibili." attivo={p.impilaSuMobile !== false} onChange={(v) => agg({ impilaSuMobile: v })} />
      <div className="ml-ed-colonne-elenco">
        {prop.map((pct, i) => (
          <div key={i} className="ml-ed-colonna">
            <div className="ml-ed-colonna-testa">
              <span>Colonna {i + 1}</span>
              <small>{pct}%</small>
            </div>
            {(b.colonne?.[i] ?? []).map((f) => {
              const Icona = ICONE_BLOCCO[f.tipo]
              return (
                <button key={f.id} type="button" className="ml-ed-colonna-figlio" onClick={() => onSeleziona(f.id)}>
                  <Icona />
                  {ETICHETTE_BLOCCO[f.tipo]}
                </button>
              )
            })}
            <div className="ml-ed-colonna-aggiungi" role="group" aria-label={`Aggiungi alla colonna ${i + 1}`}>
              {FIGLI.map((t) => {
                const Icona = ICONE_BLOCCO[t]
                return (
                  <button key={t} type="button" title={`Aggiungi ${ETICHETTE_BLOCCO[t].toLowerCase()}`} aria-label={`Aggiungi ${ETICHETTE_BLOCCO[t].toLowerCase()}`} onClick={() => onAggiungiFiglio(i, t)}>
                    <Icona />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function ProprietaSocial({ b, agg }: { b: MailingBlocco; agg: Aggiorna }) {
  const p = b.props
  const link = Array.isArray(p.link) ? (p.link as { rete: MailingReteSocial; url: string }[]) : []
  const imposta = (nuovi: { rete: MailingReteSocial; url: string }[], chiave?: string) => agg({ link: nuovi }, chiave)
  return (
    <>
      <div className="ml-ed-social-elenco">
        {link.map((l, i) => (
          <div key={i} className="ml-ed-social-riga">
            <select className="ml-select ml-ed-input" value={l.rete} aria-label="Rete" onChange={(e) => imposta(link.map((x, j) => (j === i ? { ...x, rete: e.target.value as MailingReteSocial } : x)))}>
              {RETI_SOCIAL.map((r) => (
                <option key={r.rete} value={r.rete}>
                  {r.etichetta}
                </option>
              ))}
            </select>
            <input className="ml-input ml-ed-input" value={l.url} placeholder="https://" aria-label="Indirizzo" onChange={(e) => imposta(link.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)), `social-${i}`)} />
            <button type="button" className="ml-ed-icona-btn" aria-label="Rimuovi" onClick={() => imposta(link.filter((_, j) => j !== i))}>
              <X />
            </button>
          </div>
        ))}
        {link.length < 7 ? (
          <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm" onClick={() => imposta([...link, { rete: RETI_SOCIAL.find((r) => !link.some((l) => l.rete === r.rete))?.rete ?? 'sito', url: 'https://' }])}>
            <Plus /> Aggiungi un profilo
          </button>
        ) : null}
      </div>
      <Campo etichetta="Stile">
        <Segmentato
          ariaLabel="Stile"
          valore={(p.stile as string) || 'colore'}
          onChange={(v) => agg({ stile: v })}
          opzioni={[
            { valore: 'colore', etichetta: 'A colori' },
            { valore: 'scuro', etichetta: 'Scuro' },
            { valore: 'chiaro', etichetta: 'Contorno' },
          ]}
        />
      </Campo>
      <Campo etichetta="Allineamento">
        <Allineamento valore={p.allineamento} onChange={(v) => agg({ allineamento: v })} />
      </Campo>
    </>
  )
}

function ProprietaVideo({ b, agg }: { b: MailingBlocco; agg: Aggiorna }) {
  const p = b.props
  const id = idYoutube(p.url)
  const url = s(p.url)
  // maxresdefault non esiste per tutti i video: YouTube risponde con un segnaposto 120×90. In quel caso hqdefault.
  useEffect(() => {
    if (!id || s(p.miniaturaUrl)) return
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth <= 120) agg({ miniaturaUrl: miniaturaYoutube(id, 'hqdefault') })
    }
    img.src = miniaturaYoutube(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  return (
    <>
      <Campo
        etichetta="Link del video YouTube"
        aiuto={url && !id ? <span className="ml-ed-avviso">Non riconosco questo link: copia l'indirizzo dalla barra di YouTube.</span> : 'Nelle email i video non partono: mostriamo la copertina che porta a YouTube.'}
      >
        <input className="ml-input ml-ed-input" value={url} placeholder="https://www.youtube.com/watch?v=…" aria-label="Link YouTube" onChange={(e) => agg({ url: e.target.value, miniaturaUrl: '' }, 'url')} />
      </Campo>
      {id ? (
        <div className="ml-ed-video-anteprima">
          <img src={s(p.miniaturaUrl) || miniaturaYoutube(id)} alt="" />
        </div>
      ) : null}
      <Testo etichetta="Titolo sotto la copertina" valore={s(p.titolo)} onChange={(v) => agg({ titolo: v }, 'titolo')} placeholder="Guarda il video" />
      {id ? (
        <Campo etichetta="Copertina personalizzata">
          <CaricaImmagine url={s(p.miniaturaUrl).includes('img.youtube.com') ? '' : s(p.miniaturaUrl)} etichetta="Facoltativa" onCaricata={(img) => agg({ miniaturaUrl: img.url })} onRimuovi={() => agg({ miniaturaUrl: '' })} />
        </Campo>
      ) : null}
    </>
  )
}

function ProprietaRecensione({ b, agg }: { b: MailingBlocco; agg: Aggiorna }) {
  const p = b.props
  const stelle = n(p.stelle, 5)
  return (
    <>
      <Testo etichetta="Recensione" multiriga valore={s(p.testo)} onChange={(v) => agg({ testo: v }, 'testo')} />
      <Campo etichetta="Stelle">
        <div className="ml-ed-stelle" role="radiogroup" aria-label="Stelle">
          {[1, 2, 3, 4, 5].map((x) => (
            <button key={x} type="button" role="radio" aria-checked={x === stelle} aria-label={`${x} stelle`} data-piena={x <= stelle ? '' : undefined} onClick={() => agg({ stelle: x })}>
              <Star />
            </button>
          ))}
        </div>
      </Campo>
      <div className="ml-ed-riga2">
        <Testo etichetta="Autore" valore={s(p.autore)} onChange={(v) => agg({ autore: v }, 'autore')} placeholder="Giulia R." />
        <Testo etichetta="Fonte" valore={s(p.fonte)} onChange={(v) => agg({ fonte: v }, 'fonte')} placeholder="Google" />
      </div>
      <div className="ml-ed-aiuto">Usa solo recensioni vere, con il nome abbreviato come appare online.</div>
    </>
  )
}

function ProprietaHtml({ b, agg }: { b: MailingBlocco; agg: Aggiorna }) {
  return (
    <>
      <Campo etichetta="Codice HTML" aiuto="Script e gestori di eventi vengono rimossi. I merge tag in stile *|FNAME|*, *|UNSUB|* sono tradotti nei nostri segnaposto.">
        <textarea className="ml-textarea ml-ed-input ml-ed-codice" rows={14} spellCheck={false} value={s(b.props.html)} aria-label="Codice HTML" onChange={(e) => agg({ html: e.target.value }, 'html')} />
      </Campo>
    </>
  )
}

function ProprietaPiedipagina({ b, agg }: { b: MailingBlocco; agg: Aggiorna }) {
  const p = b.props
  return (
    <>
      <Campo etichetta="Testo">
        <EditorTesto ridotto html={s(p.testo)} onChange={(html) => agg({ testo: html }, 'testo')} placeholder="Perché ricevi questa email…" />
      </Campo>
      <Interruttore etichetta="Indirizzo postale" descrizione="Obbligatorio per legge nelle comunicazioni commerciali. Lo prendiamo dalle impostazioni." attivo={p.mostraIndirizzo !== false} onChange={(v) => agg({ mostraIndirizzo: v })} />
      <Interruttore etichetta="Link alle preferenze" descrizione="Chi riceve può scegliere quali email ricevere invece di disiscriversi del tutto." attivo={p.mostraPreferenze !== false} onChange={(v) => agg({ mostraPreferenze: v })} />
      <div className="ml-ed-nota">Il link per annullare l'iscrizione c'è sempre: è un obbligo di legge e lo richiedono Gmail e Yahoo.</div>
    </>
  )
}

// ───────────────────────── Pannello ─────────────────────────

export function PannelloBlocco({
  blocco,
  documento,
  aiDisponibile,
  focusTesto,
  onAggiorna,
  onCambiaColonne,
  onSeleziona,
  onAggiungiFiglio,
  onDuplica,
  onElimina,
  onChiudi,
  genitore,
}: {
  blocco: MailingBlocco
  documento: MailingDocumento
  aiDisponibile: boolean
  focusTesto: boolean
  onAggiorna: (patch: Record<string, unknown>, chiave?: string) => void
  onCambiaColonne: (proporzioni: number[]) => void
  onSeleziona: (id: string | null) => void
  onAggiungiFiglio: (colonna: number, tipo: MailingTipoBlocco) => void
  onDuplica: () => void
  onElimina: () => void
  onChiudi: () => void
  genitore: MailingBlocco | null
}) {
  const imp = documento.impostazioni
  const Icona = ICONE_BLOCCO[blocco.tipo]
  const agg: Aggiorna = (patch, chiave) => onAggiorna(patch, chiave ? `${blocco.id}:${chiave}` : undefined)
  let corpo: ReactNode = null
  switch (blocco.tipo) {
    case 'intestazione':
      corpo = <ProprietaIntestazione b={blocco} agg={agg} imp={imp} />
      break
    case 'titolo':
      corpo = <ProprietaTitolo b={blocco} agg={agg} imp={imp} />
      break
    case 'testo':
      corpo = <ProprietaTesto b={blocco} agg={agg} imp={imp} ai={aiDisponibile} focus={focusTesto} />
      break
    case 'immagine':
      corpo = <ProprietaImmagine b={blocco} agg={agg} />
      break
    case 'pulsante':
      corpo = <ProprietaPulsante b={blocco} agg={agg} imp={imp} />
      break
    case 'divisore':
      corpo = <ProprietaDivisore b={blocco} agg={agg} imp={imp} />
      break
    case 'spazio':
      corpo = <ProprietaSpazio b={blocco} agg={agg} />
      break
    case 'colonne':
      corpo = <ProprietaColonne b={blocco} agg={agg} onCambiaColonne={onCambiaColonne} onSeleziona={(id) => onSeleziona(id)} onAggiungiFiglio={onAggiungiFiglio} />
      break
    case 'social':
      corpo = <ProprietaSocial b={blocco} agg={agg} />
      break
    case 'video':
      corpo = <ProprietaVideo b={blocco} agg={agg} />
      break
    case 'recensione':
      corpo = <ProprietaRecensione b={blocco} agg={agg} />
      break
    case 'html':
      corpo = <ProprietaHtml b={blocco} agg={agg} />
      break
    case 'piedipagina':
      corpo = <ProprietaPiedipagina b={blocco} agg={agg} />
      break
  }
  return (
    <div className="ml-ed-pannello" key={blocco.id}>
      <div className="ml-ed-pannello-testa">
        <span className="ml-ed-pannello-icona" aria-hidden>
          <Icona />
        </span>
        <div className="ml-ed-pannello-titoli">
          <div className="ml-ed-pannello-titolo">{ETICHETTE_BLOCCO[blocco.tipo]}</div>
          {genitore ? (
            <button type="button" className="ml-ed-pannello-percorso" onClick={() => onSeleziona(genitore.id)}>
              dentro Colonne
            </button>
          ) : null}
        </div>
        <div className="ml-ed-pannello-azioni">
          <button type="button" className="ml-ed-icona-btn" title="Duplica (⌘D)" aria-label="Duplica" onClick={onDuplica}>
            <Copy />
          </button>
          <button type="button" className="ml-ed-icona-btn ml-ed-icona-btn--pericolo" title="Elimina (Canc)" aria-label="Elimina" onClick={onElimina}>
            <Trash2 />
          </button>
          <button type="button" className="ml-ed-icona-btn" title="Chiudi (Esc)" aria-label="Chiudi" onClick={onChiudi}>
            <X />
          </button>
        </div>
      </div>
      <div className="ml-ed-pannello-corpo">{corpo}</div>
    </div>
  )
}


export function PannelloDocumento({ imp, onAggiorna }: { imp: MailingImpostazioniDocumento; onAggiorna: (patch: Partial<MailingImpostazioniDocumento>, chiave?: string) => void }) {
  const palette = paletteDoc(imp)
  return (
    <div className="ml-ed-pannello">
      <div className="ml-ed-pannello-testa">
        <span className="ml-ed-pannello-icona" aria-hidden>
          <Palette />
        </span>
        <div className="ml-ed-pannello-titoli">
          <div className="ml-ed-pannello-titolo">Stile dell'email</div>
          <div className="ml-ed-pannello-sotto">Clicca un blocco nell'anteprima per modificarlo</div>
        </div>
      </div>
      <div className="ml-ed-pannello-corpo">
        <Sezione titolo="Temi rapidi">
          <div className="ml-ed-temi">
            {TEMI_RAPIDI.map((t) => {
              const attivo = t.imp.colorePrimario === imp.colorePrimario && t.imp.sfondo === imp.sfondo
              return (
                <button key={t.nome} type="button" className="ml-ed-tema" data-attivo={attivo ? '' : undefined} onClick={() => onAggiorna(t.imp)} aria-pressed={attivo}>
                  <span className="ml-ed-tema-campione" style={{ background: t.imp.sfondo }}>
                    <span style={{ background: t.imp.sfondoContenuto }}>
                      <i style={{ background: t.imp.colorePrimario }} />
                      <b style={{ background: t.imp.coloreTesto }} />
                    </span>
                  </span>
                  <span className="ml-ed-tema-nome">{t.nome}</span>
                </button>
              )
            })}
          </div>
        </Sezione>
        <Sezione titolo="Colori">
          <div className="ml-ed-riga2">
            <Campo etichetta="Principale">
              <SceltaColore ariaLabel="Colore principale" valore={imp.colorePrimario} palette={palette} onChange={(v) => v && onAggiorna({ colorePrimario: v })} />
            </Campo>
            <Campo etichetta="Testo">
              <SceltaColore ariaLabel="Colore del testo" valore={imp.coloreTesto} palette={palette} onChange={(v) => v && onAggiorna({ coloreTesto: v })} />
            </Campo>
            <Campo etichetta="Sfondo esterno">
              <SceltaColore ariaLabel="Sfondo esterno" valore={imp.sfondo} palette={palette} onChange={(v) => v && onAggiorna({ sfondo: v })} />
            </Campo>
            <Campo etichetta="Sfondo contenuto">
              <SceltaColore ariaLabel="Sfondo del contenuto" valore={imp.sfondoContenuto} palette={palette} onChange={(v) => v && onAggiorna({ sfondoContenuto: v })} />
            </Campo>
          </div>
        </Sezione>
        <Sezione titolo="Carattere e forma">
          <Campo etichetta="Font">
            <select className="ml-select ml-ed-input" value={FONT_DISPONIBILI.some((f) => f.valore === imp.font) ? imp.font : ''} aria-label="Font" onChange={(e) => onAggiorna({ font: e.target.value || IMPOSTAZIONI_DEFAULT.font })}>
              {!FONT_DISPONIBILI.some((f) => f.valore === imp.font) ? <option value="">Personalizzato</option> : null}
              {FONT_DISPONIBILI.map((f) => (
                <option key={f.valore} value={f.valore} style={{ fontFamily: f.valore }}>
                  {f.etichetta}
                  {f.google ? ' (web font)' : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etichetta="Larghezza" aiuto="600 px è lo standard: si legge bene ovunque.">
            <Cursore ariaLabel="Larghezza" valore={imp.larghezza} min={480} max={720} step={10} onChange={(v) => onAggiorna({ larghezza: v }, 'larghezza')} />
          </Campo>
          <Campo etichetta="Angoli arrotondati">
            <Cursore ariaLabel="Raggio" valore={imp.raggio} min={0} max={28} onChange={(v) => onAggiorna({ raggio: v }, 'raggio')} />
          </Campo>
        </Sezione>
      </div>
    </div>
  )
}
