import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCheck,
  CircleDot,
  ExternalLink,
  Eye,
  EyeOff,
  Heart,
  Inbox,
  Keyboard,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  MessagesSquare,
  Reply,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react'
import { toast } from '@/lib/toast'
import { celebra } from '@/lib/task-festa'
import {
  messaggioErroreSocial,
  socialService,
  type SocialAccount,
  type SocialCommento,
  type SocialConversazione,
  type SocialElencoCommenti,
  type SocialFiltroPiattaforma,
  type SocialMessaggio,
  type SocialThread,
} from '@/services/social-service'
import { SocialComposer, type ComposerHandle } from './social-composer'
import { AvatarSocial, IconaPiattaforma } from './social-ui'
import { commentoDaGestire, conversazioneDaGestire, dataOra, formatNumero, NOMI_PIATTAFORMA, tempoFa } from './social-utils'

type Props = {
  account: SocialAccount
  aiDisponibile: boolean
  commenti: SocialElencoCommenti | null
  conversazioni: SocialConversazione[] | null
  errore: string | null
  caricamento: boolean
  generazione: number
  onAggiorna: (silenziosa?: boolean) => Promise<void>
  setCommenti: Dispatch<SetStateAction<SocialElencoCommenti | null>>
  setConversazioni: Dispatch<SetStateAction<SocialConversazione[] | null>>
}

type Elemento =
  | { tipo: 'COMMENTO'; chiave: string; quando: string; c: SocialCommento }
  | { tipo: 'DM'; chiave: string; quando: string; d: SocialConversazione }

type FiltroTipo = 'TUTTO' | 'COMMENTI' | 'DM'
type FiltroStato = 'DA_GESTIRE' | 'TUTTI' | 'NASCOSTI'

const LIMITE_COMMENTO = 8000
const LIMITE_DM = 1000

function daGestire(e: Elemento): boolean {
  return e.tipo === 'COMMENTO' ? commentoDaGestire(e.c) : conversazioneDaGestire(e.d)
}

function campoTesto(el: EventTarget | null) {
  const t = el as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

export function SocialInbox({ account, aiDisponibile, commenti, conversazioni, errore, caricamento, generazione, onAggiorna, setCommenti, setConversazioni }: Props) {
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('TUTTO')
  const [filtroPiattaforma, setFiltroPiattaforma] = useState<SocialFiltroPiattaforma>('TUTTE')
  const [filtroStato, setFiltroStato] = useState<FiltroStato>('DA_GESTIRE')
  const [cerca, setCerca] = useState('')
  const [selezionato, setSelezionato] = useState<string | null>(null)
  const [mostraScorciatoie, setMostraScorciatoie] = useState(false)
  const listaRef = useRef<HTMLDivElement>(null)

  const elementi: Elemento[] = useMemo(() => {
    const out: Elemento[] = []
    commenti?.commenti.forEach((c) => out.push({ tipo: 'COMMENTO', chiave: `c:${c.id}`, quando: c.creatoIl, c }))
    conversazioni?.forEach((d) => out.push({ tipo: 'DM', chiave: `d:${d.id}`, quando: d.ultimoMessaggioIl ?? '', d }))
    return out.sort((a, b) => (b.quando || '').localeCompare(a.quando || ''))
  }, [commenti, conversazioni])

  const conteggi = useMemo(() => {
    const n = { tutto: 0, commenti: 0, dm: 0 }
    elementi.forEach((e) => {
      if (!daGestire(e)) return
      n.tutto++
      if (e.tipo === 'COMMENTO') n.commenti++
      else n.dm++
    })
    return n
  }, [elementi])

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    return elementi.filter((e) => {
      if (filtroTipo === 'COMMENTI' && e.tipo !== 'COMMENTO') return false
      if (filtroTipo === 'DM' && e.tipo !== 'DM') return false
      const p = e.tipo === 'COMMENTO' ? e.c.piattaforma : e.d.piattaforma
      if (filtroPiattaforma !== 'TUTTE' && p !== filtroPiattaforma) return false
      if (filtroStato === 'DA_GESTIRE' && !daGestire(e)) return false
      if (filtroStato === 'NASCOSTI' && !(e.tipo === 'COMMENTO' && e.c.nascosto)) return false
      if (q) {
        const testo =
          e.tipo === 'COMMENTO'
            ? `${e.c.autoreNome ?? ''} ${e.c.testo ?? ''} ${e.c.postTesto ?? ''}`
            : `${e.d.contattoNome ?? ''} ${e.d.ultimoMessaggio ?? ''}`
        if (!testo.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [elementi, filtroTipo, filtroPiattaforma, filtroStato, cerca])

  // L'elemento aperto resta aperto anche se un filtro "Da gestire" lo nasconderebbe dopo la risposta.
  const elementoAperto = useMemo(() => elementi.find((e) => e.chiave === selezionato) ?? null, [elementi, selezionato])

  useEffect(() => {
    if (!selezionato && visibili[0] && window.matchMedia('(min-width: 1024px)').matches) setSelezionato(visibili[0].chiave)
  }, [visibili, selezionato])

  const sposta = useCallback(
    (passo: number) => {
      if (!visibili.length) return
      const i = visibili.findIndex((e) => e.chiave === selezionato)
      const prossimo = visibili[Math.max(0, Math.min(visibili.length - 1, (i < 0 ? -1 : i) + passo))]
      setSelezionato(prossimo.chiave)
      listaRef.current?.querySelector(`[data-chiave="${CSS.escape(prossimo.chiave)}"]`)?.scrollIntoView({ block: 'nearest' })
    },
    [visibili, selezionato],
  )

  // ── Aggiornamenti locali ottimistici ──
  const aggiornaCommento = useCallback(
    (id: string, f: (c: SocialCommento) => SocialCommento | null) => {
      setCommenti((elenco) => {
        if (!elenco) return elenco
        const lista = elenco.commenti.flatMap((c) => {
          if (c.id === id) {
            const n = f(c)
            return n ? [n] : []
          }
          if (c.risposte.some((r) => r.id === id)) {
            return [
              {
                ...c,
                risposte: c.risposte.flatMap((r) => {
                  if (r.id !== id) return [r]
                  const n = f(r)
                  return n ? [n] : []
                }),
              },
            ]
          }
          return [c]
        })
        return { ...elenco, commenti: lista }
      })
    },
    [setCommenti],
  )

  const aggiornaConversazione = useCallback(
    (id: string, f: (d: SocialConversazione) => SocialConversazione) => {
      setConversazioni((lista) => lista?.map((d) => (d.id === id ? f(d) : d)) ?? lista)
    },
    [setConversazioni],
  )

  const segnaGestito = useCallback(
    async (e: Elemento, gestito: boolean) => {
      try {
        if (e.tipo === 'COMMENTO') {
          aggiornaCommento(e.c.id, (c) => ({ ...c, gestito }))
          await socialService.segnaGestito(account.pageId, e.c, 'COMMENTO', gestito)
        } else {
          aggiornaConversazione(e.d.id, (d) => ({ ...d, gestito, nonLetti: gestito ? 0 : d.nonLetti }))
          await socialService.segnaGestito(account.pageId, e.d, 'CONVERSAZIONE', gestito)
        }
        if (gestito) {
          const rimasti = elementi.filter((x) => x.chiave !== e.chiave && daGestire(x)).length
          if (rimasti === 0) {
            celebra()
            toast.success('Inbox a zero. Grande!')
          }
        }
      } catch (err) {
        toast.error(messaggioErroreSocial(err))
        void onAggiorna(true)
      }
    },
    [account.pageId, aggiornaCommento, aggiornaConversazione, elementi, onAggiorna],
  )

  const composerRef = useRef<ComposerHandle>(null)

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || campoTesto(ev.target)) return
      if (ev.key === 'j' || ev.key === 'ArrowDown') {
        ev.preventDefault()
        sposta(1)
      } else if (ev.key === 'k' || ev.key === 'ArrowUp') {
        ev.preventDefault()
        sposta(-1)
      } else if (ev.key === 'r') {
        ev.preventDefault()
        composerRef.current?.focus()
      } else if (ev.key === 'e' && elementoAperto) {
        ev.preventDefault()
        void segnaGestito(elementoAperto, !(elementoAperto.tipo === 'COMMENTO' ? elementoAperto.c.gestito : elementoAperto.d.gestito))
        sposta(1)
      } else if (ev.key === '/') {
        ev.preventDefault()
        document.getElementById('so-inbox-cerca')?.focus()
      } else if (ev.key === '?') {
        setMostraScorciatoie((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sposta, elementoAperto, segnaGestito])

  const caricato = commenti != null || conversazioni != null

  return (
    <div className="so-inbox" data-dettaglio={elementoAperto ? '' : undefined}>
      <aside className="so-inbox-lista-col">
        <div className="so-inbox-filtri">
          <div className="so-seg-chiaro" role="radiogroup" aria-label="Tipo">
            {(
              [
                ['TUTTO', 'Tutto', conteggi.tutto],
                ['COMMENTI', 'Commenti', conteggi.commenti],
                ['DM', 'Messaggi', conteggi.dm],
              ] as const
            ).map(([id, label, n]) => (
              <button key={id} type="button" role="radio" aria-checked={filtroTipo === id} data-active={filtroTipo === id ? '' : undefined} onClick={() => setFiltroTipo(id)}>
                {label}
                {n > 0 ? <span className="so-conta">{n}</span> : null}
              </button>
            ))}
          </div>
          <div className="so-inbox-filtri-riga">
            <div className="so-pillole" role="radiogroup" aria-label="Piattaforma">
              {(['TUTTE', 'FACEBOOK', 'INSTAGRAM'] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={filtroPiattaforma === p} data-active={filtroPiattaforma === p ? '' : undefined} onClick={() => setFiltroPiattaforma(p)} title={p === 'TUTTE' ? 'Tutte' : NOMI_PIATTAFORMA[p]}>
                  {p === 'TUTTE' ? 'Tutte' : <IconaPiattaforma piattaforma={p} />}
                </button>
              ))}
            </div>
            <select className="so-select" value={filtroStato} onChange={(e) => setFiltroStato(e.target.value as FiltroStato)} aria-label="Stato">
              <option value="DA_GESTIRE">Da gestire</option>
              <option value="TUTTI">Tutti</option>
              <option value="NASCOSTI">Nascosti</option>
            </select>
          </div>
          <label className="so-cerca">
            <Search className="size-4" aria-hidden />
            <input id="so-inbox-cerca" value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca persone, testo, post…" />
            <kbd>/</kbd>
          </label>
        </div>

        {errore ? (
          <div className="so-avviso" data-lieve="">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>{errore}</span>
          </div>
        ) : null}

        <div className="so-inbox-lista" ref={listaRef} role="listbox" aria-label="Commenti e messaggi">
          {!caricato && caricamento ? (
            Array.from({ length: 6 }, (_, i) => <div key={i} className="so-inbox-riga so-scheletro" style={{ height: 72 }} />)
          ) : visibili.length === 0 ? (
            <div className="so-inbox-vuoto">
              <span className="so-inbox-vuoto-icona">
                <CheckCheck className="size-6" aria-hidden />
              </span>
              <strong>{filtroStato === 'DA_GESTIRE' ? 'Tutto gestito' : 'Niente qui'}</strong>
              <span>{filtroStato === 'DA_GESTIRE' ? 'Nessun commento o messaggio aspetta una risposta.' : 'Nessun elemento con questi filtri.'}</span>
            </div>
          ) : (
            visibili.map((e) => <RigaInbox key={e.chiave} e={e} attivo={e.chiave === selezionato} onApri={() => setSelezionato(e.chiave)} />)
          )}
        </div>
        <button type="button" className="so-scorciatoie-btn" onClick={() => setMostraScorciatoie((v) => !v)}>
          <Keyboard className="size-3.5" aria-hidden /> Scorciatoie
        </button>
        {mostraScorciatoie ? (
          <div className="so-scorciatoie">
            <span><kbd>j</kbd><kbd>k</kbd> su e giù</span>
            <span><kbd>r</kbd> rispondi</span>
            <span><kbd>e</kbd> gestito e avanti</span>
            <span><kbd>/</kbd> cerca</span>
            <span><kbd>⌘</kbd><kbd>↩</kbd> invia</span>
            <span><kbd>1</kbd>–<kbd>5</kbd> sezioni</span>
          </div>
        ) : null}
      </aside>

      <section className="so-inbox-dettaglio-col">
        {elementoAperto ? (
          elementoAperto.tipo === 'COMMENTO' ? (
            <DettaglioCommento
              key={elementoAperto.chiave}
              account={account}
              commento={elementoAperto.c}
              aiDisponibile={aiDisponibile}
              composerRef={composerRef}
              onIndietro={() => setSelezionato(null)}
              onGestito={(g) => void segnaGestito(elementoAperto, g)}
              aggiornaCommento={aggiornaCommento}
              onAggiorna={onAggiorna}
            />
          ) : (
            <DettaglioConversazione
              key={elementoAperto.chiave}
              account={account}
              conversazione={elementoAperto.d}
              aiDisponibile={aiDisponibile}
              composerRef={composerRef}
              generazione={generazione}
              onIndietro={() => setSelezionato(null)}
              onGestito={(g) => void segnaGestito(elementoAperto, g)}
              aggiornaConversazione={aggiornaConversazione}
            />
          )
        ) : (
          <div className="so-inbox-vuoto so-inbox-vuoto--dettaglio">
            <span className="so-inbox-vuoto-icona">
              <Inbox className="size-6" aria-hidden />
            </span>
            <strong>Scegli un commento o un messaggio</strong>
            <span>Facebook e Instagram, commenti e DM: tutto in una coda sola.</span>
          </div>
        )}
      </section>
    </div>
  )
}

function RigaInbox({ e, attivo, onApri }: { e: Elemento; attivo: boolean; onApri: () => void }) {
  const urgente = daGestire(e)
  if (e.tipo === 'COMMENTO') {
    const c = e.c
    return (
      <button type="button" role="option" aria-selected={attivo} className="so-inbox-riga" data-chiave={e.chiave} data-attivo={attivo ? '' : undefined} data-urgente={urgente ? '' : undefined} onClick={onApri}>
        <AvatarSocial nome={c.autoreNome} src={c.autoreImmagine} piattaforma={c.piattaforma} />
        <div className="so-inbox-riga-corpo">
          <div className="so-inbox-riga-top">
            <span className="so-inbox-riga-nome">{c.autoreNome ?? 'Utente'}</span>
            <time dateTime={c.creatoIl}>{tempoFa(c.creatoIl)}</time>
          </div>
          <div className="so-inbox-riga-testo">{c.testo || (c.allegatoImmagine ? '📷 Immagine' : '—')}</div>
          <div className="so-inbox-riga-meta">
            <MessageCircle className="size-3" aria-hidden /> Commento{c.postTesto ? ` · ${c.postTesto.slice(0, 40)}` : ''}
            {c.risposto ? <span className="so-tag" data-tono="ok"><Check className="size-3" aria-hidden /> Risposto</span> : null}
            {c.gestito && !c.risposto ? <span className="so-tag" data-tono="muted">Gestito</span> : null}
            {c.nascosto ? <span className="so-tag" data-tono="warn"><EyeOff className="size-3" aria-hidden /> Nascosto</span> : null}
            {c.risposte.length ? <span className="so-tag" data-tono="muted">{c.risposte.length} risposte</span> : null}
          </div>
        </div>
        {urgente ? <span className="so-pallino" aria-label="Da gestire" /> : null}
      </button>
    )
  }
  const d = e.d
  return (
    <button type="button" role="option" aria-selected={attivo} className="so-inbox-riga" data-chiave={e.chiave} data-attivo={attivo ? '' : undefined} data-urgente={urgente ? '' : undefined} onClick={onApri}>
      <AvatarSocial nome={d.contattoNome} src={d.contattoImmagine} piattaforma={d.piattaforma} />
      <div className="so-inbox-riga-corpo">
        <div className="so-inbox-riga-top">
          <span className="so-inbox-riga-nome">{d.contattoNome ?? 'Contatto'}</span>
          <time dateTime={d.ultimoMessaggioIl ?? undefined}>{tempoFa(d.ultimoMessaggioIl)}</time>
        </div>
        <div className="so-inbox-riga-testo" data-forte={d.nonLetti > 0 ? '' : undefined}>
          {d.ultimoDaPagina ? <span className="so-inbox-tu">Tu: </span> : null}
          {d.ultimoMessaggio || 'Allegato'}
        </div>
        <div className="so-inbox-riga-meta">
          <Mail className="size-3" aria-hidden /> Messaggio diretto
          {d.nonLetti > 0 ? <span className="so-tag" data-tono="info">{d.nonLetti} nuovi</span> : null}
          {!d.finestraAperta ? <span className="so-tag" data-tono="muted"><Lock className="size-3" aria-hidden /> Fuori 24h</span> : null}
          {d.gestito ? <span className="so-tag" data-tono="muted">Gestito</span> : null}
        </div>
      </div>
      {urgente ? <span className="so-pallino" aria-label="Da gestire" /> : null}
    </button>
  )
}

function BarraAzioni({ children }: { children: React.ReactNode }) {
  return <div className="so-azioni">{children}</div>
}

function DettaglioCommento({
  account,
  commento: c,
  aiDisponibile,
  composerRef,
  onIndietro,
  onGestito,
  aggiornaCommento,
  onAggiorna,
}: {
  account: SocialAccount
  commento: SocialCommento
  aiDisponibile: boolean
  composerRef: React.RefObject<ComposerHandle | null>
  onIndietro: () => void
  onGestito: (g: boolean) => void
  aggiornaCommento: (id: string, f: (c: SocialCommento) => SocialCommento | null) => void
  onAggiorna: (silenziosa?: boolean) => Promise<void>
}) {
  const [modo, setModo] = useState<'PUBBLICA' | 'PRIVATA'>('PUBBLICA')
  const [occupato, setOccupato] = useState<string | null>(null)
  const [confermaElimina, setConfermaElimina] = useState(false)

  const esegui = async (chiave: string, f: () => Promise<void>) => {
    setOccupato(chiave)
    try {
      await f()
    } catch (err) {
      toast.error(messaggioErroreSocial(err))
      void onAggiorna(true)
    } finally {
      setOccupato(null)
    }
  }

  const nascondi = () =>
    esegui('nascondi', async () => {
      await socialService.nascondiCommento(account.pageId, c, !c.nascosto)
      aggiornaCommento(c.id, (x) => ({ ...x, nascosto: !c.nascosto }))
      toast.success(c.nascosto ? 'Commento di nuovo visibile' : 'Commento nascosto: lo vedono solo l’autore e i suoi amici')
    })

  const miPiace = () =>
    esegui('like', async () => {
      await socialService.miPiaceCommento(account.pageId, c, !c.piaceAllaPagina)
      aggiornaCommento(c.id, (x) => ({ ...x, piaceAllaPagina: !c.piaceAllaPagina, miPiace: (x.miPiace ?? 0) + (c.piaceAllaPagina ? -1 : 1) }))
    })

  const elimina = () =>
    esegui('elimina', async () => {
      await socialService.eliminaCommento(account.pageId, c)
      aggiornaCommento(c.id, () => null)
      toast.success('Commento eliminato')
      onIndietro()
    })

  const rispondi = async (testo: string) => {
    if (modo === 'PRIVATA') {
      await socialService.messaggioPrivato(account.pageId, c, testo)
      aggiornaCommento(c.id, (x) => ({ ...x, gestito: true }))
      toast.success(`Messaggio privato inviato a ${c.autoreNome ?? 'questa persona'}`)
      return
    }
    const risposta = await socialService.rispondiCommento(account.pageId, c, testo)
    aggiornaCommento(c.id, (x) => ({ ...x, risposto: true, rispostoIl: risposta.creatoIl, risposte: [...x.risposte, risposta] }))
    toast.success('Risposta pubblicata')
  }

  const iniziale = c.piattaforma === 'INSTAGRAM' && c.autoreNome ? `@${c.autoreNome} ` : ''

  return (
    <div className="so-dettaglio">
      <header className="so-dettaglio-head">
        <button type="button" className="so-icon-btn so-solo-mobile" onClick={onIndietro} aria-label="Indietro">
          <ArrowLeft className="size-4" />
        </button>
        <AvatarSocial nome={c.autoreNome} src={c.autoreImmagine} piattaforma={c.piattaforma} dimensione="lg" />
        <div className="min-w-0 flex-1">
          <div className="so-titolo truncate">{c.autoreNome ?? 'Utente'}</div>
          <div className="so-sottotitolo">
            Commento su {NOMI_PIATTAFORMA[c.piattaforma]} · {dataOra(c.creatoIl)}
          </div>
        </div>
        <button type="button" className="so-btn" data-attivo={c.gestito ? '' : undefined} onClick={() => onGestito(!c.gestito)} title="Segna come gestito (e)">
          {c.gestito ? <Undo2 className="size-4" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />}
          {c.gestito ? 'Riapri' : 'Gestito'}
        </button>
      </header>

      <div className="so-dettaglio-scroll">
        <a className="so-post-contesto" href={c.postLink ?? undefined} target="_blank" rel="noreferrer">
          {c.postImmagine ? <img src={c.postImmagine} alt="" referrerPolicy="no-referrer" /> : <span className="so-post-contesto-vuoto"><MessagesSquare className="size-5" aria-hidden /></span>}
          <div className="min-w-0">
            <div className="so-etichetta">Sul post</div>
            <p>{c.postTesto || 'Post senza testo'}</p>
          </div>
          <ExternalLink className="size-4 shrink-0" aria-hidden />
        </a>

        <div className="so-thread">
          <Bolla
            daPagina={false}
            nome={c.autoreNome}
            immagine={c.autoreImmagine}
            testo={c.testo}
            allegato={c.allegatoImmagine}
            quando={c.creatoIl}
            extra={
              <>
                {c.miPiace ? <span><Heart className="size-3" aria-hidden /> {formatNumero(c.miPiace)}</span> : null}
                {c.nascosto ? <span className="so-tag" data-tono="warn"><EyeOff className="size-3" aria-hidden /> Nascosto</span> : null}
              </>
            }
            evidenziata
          />
          {c.risposte.map((r) => (
            <Bolla
              key={r.id}
              daPagina={r.daPagina}
              nome={r.daPagina ? account.nome : r.autoreNome}
              immagine={r.daPagina ? account.immagine : r.autoreImmagine}
              testo={r.testo}
              allegato={r.allegatoImmagine}
              quando={r.creatoIl}
              firma={r.daPagina ? r.rispostoDaUtenteNome : null}
            />
          ))}
        </div>
      </div>

      <BarraAzioni>
        {c.puoMettereMiPiace ? (
          <button type="button" className="so-azione" data-attivo={c.piaceAllaPagina ? '' : undefined} onClick={() => void miPiace()} disabled={!!occupato}>
            {occupato === 'like' ? <Loader2 className="size-4 animate-spin" /> : <Heart className="size-4" aria-hidden />} {c.piaceAllaPagina ? 'Ti piace' : 'Mi piace'}
          </button>
        ) : null}
        {c.puoNascondere ? (
          <button type="button" className="so-azione" onClick={() => void nascondi()} disabled={!!occupato} title="Nascosto: resta visibile solo all’autore e ai suoi amici, che non se ne accorgono">
            {occupato === 'nascondi' ? <Loader2 className="size-4 animate-spin" /> : c.nascosto ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
            {c.nascosto ? 'Mostra' : 'Nascondi'}
          </button>
        ) : null}
        {c.puoEliminare ? (
          confermaElimina ? (
            <span className="so-conferma">
              Eliminare per sempre?
              <button type="button" className="so-azione" data-pericolo="" onClick={() => void elimina()} disabled={!!occupato}>
                {occupato === 'elimina' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" aria-hidden />} Elimina
              </button>
              <button type="button" className="so-azione" onClick={() => setConfermaElimina(false)}>
                Annulla
              </button>
            </span>
          ) : (
            <button type="button" className="so-azione" onClick={() => setConfermaElimina(true)} disabled={!!occupato}>
              <Trash2 className="size-4" aria-hidden /> Elimina
            </button>
          )
        ) : null}
        <a className="so-azione" href={c.postLink ?? undefined} target="_blank" rel="noreferrer">
          <ExternalLink className="size-4" aria-hidden /> Apri su {NOMI_PIATTAFORMA[c.piattaforma]}
        </a>
      </BarraAzioni>

      <div className="so-composer-wrap">
        <div className="so-seg-chiaro so-seg-chiaro--piccolo" role="radiogroup" aria-label="Come rispondere">
          <button type="button" role="radio" aria-checked={modo === 'PUBBLICA'} data-active={modo === 'PUBBLICA' ? '' : undefined} onClick={() => setModo('PUBBLICA')}>
            <Reply className="size-3.5" aria-hidden /> Rispondi pubblicamente
          </button>
          <button type="button" role="radio" aria-checked={modo === 'PRIVATA'} data-active={modo === 'PRIVATA' ? '' : undefined} onClick={() => setModo('PRIVATA')} title="Un solo messaggio privato per commento, entro 7 giorni">
            <Lock className="size-3.5" aria-hidden /> In privato
          </button>
        </div>
        <SocialComposer
          ref={composerRef}
          chiave={`${c.id}:${modo}`}
          iniziale={modo === 'PUBBLICA' ? iniziale : ''}
          placeholder={modo === 'PUBBLICA' ? `Rispondi a ${c.autoreNome ?? 'questo commento'}… (scrivi / per le risposte rapide)` : `Messaggio privato a ${c.autoreNome ?? 'questa persona'}…`}
          nomeContatto={c.autoreNome}
          limite={modo === 'PUBBLICA' ? LIMITE_COMMENTO : LIMITE_DM}
          aiDisponibile={aiDisponibile}
          onSuggerisci={async (tono) =>
            (await socialService.rispostaAi({ account: account.pageId, piattaforma: c.piattaforma, tipo: 'COMMENTO', oggettoId: c.id, tono })).testo
          }
          onInvia={rispondi}
          etichettaInvio={modo === 'PUBBLICA' ? 'Rispondi' : 'Invia in privato'}
        />
      </div>
    </div>
  )
}

function Bolla({
  daPagina,
  nome,
  immagine,
  testo,
  allegato,
  quando,
  extra,
  firma,
  evidenziata,
}: {
  daPagina: boolean
  nome: string | null
  immagine?: string | null
  testo: string | null
  allegato?: string | null
  quando: string
  extra?: React.ReactNode
  firma?: string | null
  evidenziata?: boolean
}) {
  return (
    <div className="so-bolla-riga" data-pagina={daPagina ? '' : undefined}>
      {!daPagina ? <AvatarSocial nome={nome} src={immagine} dimensione="sm" /> : null}
      <div className="so-bolla" data-pagina={daPagina ? '' : undefined} data-evidenziata={evidenziata ? '' : undefined}>
        {!daPagina ? <div className="so-bolla-nome">{nome ?? 'Utente'}</div> : null}
        {testo ? <p className="so-bolla-testo">{testo}</p> : null}
        {allegato ? <img className="so-bolla-img" src={allegato} alt="" referrerPolicy="no-referrer" /> : null}
        <div className="so-bolla-piede">
          <time dateTime={quando}>{tempoFa(quando)}</time>
          {firma ? <span className="so-bolla-firma">· {firma}</span> : null}
          {extra}
        </div>
      </div>
    </div>
  )
}

function DettaglioConversazione({
  account,
  conversazione: d,
  aiDisponibile,
  composerRef,
  generazione,
  onIndietro,
  onGestito,
  aggiornaConversazione,
}: {
  account: SocialAccount
  conversazione: SocialConversazione
  aiDisponibile: boolean
  composerRef: React.RefObject<ComposerHandle | null>
  generazione: number
  onIndietro: () => void
  onGestito: (g: boolean) => void
  aggiornaConversazione: (id: string, f: (d: SocialConversazione) => SocialConversazione) => void
}) {
  const [thread, setThread] = useState<SocialThread | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const fondoRef = useRef<HTMLDivElement>(null)
  const letta = useRef(false)

  const carica = useCallback(async () => {
    try {
      const t = await socialService.thread(account.pageId, d)
      setThread(t)
      setErrore(null)
    } catch (err) {
      setErrore(messaggioErroreSocial(err, 'Conversazione non disponibile'))
    }
  }, [account.pageId, d])

  // Ricarica a ogni nuovo evento realtime e quando cambia l'ultimo messaggio dell'elenco.
  useEffect(() => {
    void carica()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id, d.ultimoMessaggioIl, generazione])

  useEffect(() => {
    if (!letta.current && d.nonLetti > 0) {
      letta.current = true
      void socialService.segnaLetta(account.pageId, d)
      aggiornaConversazione(d.id, (x) => ({ ...x, nonLetti: 0 }))
    }
  }, [account.pageId, d, aggiornaConversazione])

  useEffect(() => {
    fondoRef.current?.scrollIntoView({ block: 'end' })
  }, [thread?.messaggi.length])

  const conv = thread?.conversazione ?? d
  const invia = async (testo: string) => {
    const m = await socialService.inviaMessaggio(account.pageId, conv, testo)
    setThread((t) => (t ? { ...t, messaggi: [...t.messaggi, m] } : t))
    aggiornaConversazione(d.id, (x) => ({ ...x, ultimoMessaggio: testo, ultimoMessaggioIl: m.creatoIl, ultimoDaPagina: true, nonLetti: 0 }))
  }

  const finestra = conv.finestraAperta ? (
    <span className="so-finestra" data-aperta="">
      <CircleDot className="size-3.5" aria-hidden /> Finestra aperta{conv.finestraScadeIl ? ` fino a ${dataOra(conv.finestraScadeIl)}` : ''}
    </span>
  ) : (
    <span className="so-finestra" title="Oltre le 24 ore Meta consente di rispondere solo come operatore umano, entro 7 giorni dall’ultimo messaggio della persona.">
      <Lock className="size-3.5" aria-hidden /> Oltre le 24 h: risposta come operatore (entro 7 giorni)
    </span>
  )

  return (
    <div className="so-dettaglio">
      <header className="so-dettaglio-head">
        <button type="button" className="so-icon-btn so-solo-mobile" onClick={onIndietro} aria-label="Indietro">
          <ArrowLeft className="size-4" />
        </button>
        <AvatarSocial nome={conv.contattoNome} src={conv.contattoImmagine} piattaforma={conv.piattaforma} dimensione="lg" />
        <div className="min-w-0 flex-1">
          <div className="so-titolo truncate">{conv.contattoNome ?? 'Contatto'}</div>
          <div className="so-sottotitolo">
            DM su {NOMI_PIATTAFORMA[conv.piattaforma]} · {finestra}
          </div>
        </div>
        {conv.link ? (
          <a className="so-icon-btn" href={conv.link} target="_blank" rel="noreferrer" aria-label={`Apri su ${NOMI_PIATTAFORMA[conv.piattaforma]}`} title="Apri nella casella Meta">
            <ExternalLink className="size-4" />
          </a>
        ) : null}
        <button type="button" className="so-btn" data-attivo={d.gestito ? '' : undefined} onClick={() => onGestito(!d.gestito)} title="Segna come gestito (e)">
          {d.gestito ? <Undo2 className="size-4" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />}
          {d.gestito ? 'Riapri' : 'Gestito'}
        </button>
      </header>

      <div className="so-dettaglio-scroll">
        {errore ? (
          <div className="so-avviso" data-lieve="">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>{errore}</span>
          </div>
        ) : null}
        {!thread && !errore ? (
          <div className="so-caricamento-centro">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : null}
        <div className="so-thread">
          {thread?.messaggi.map((m, i) => (
            <MessaggioDm key={m.id} m={m} precedente={thread.messaggi[i - 1]} contatto={conv} />
          ))}
          <div ref={fondoRef} />
        </div>
      </div>

      <div className="so-composer-wrap">
        <SocialComposer
          ref={composerRef}
          chiave={d.id}
          placeholder={`Scrivi a ${conv.contattoNome ?? 'questa persona'}… (scrivi / per le risposte rapide)`}
          nomeContatto={conv.contattoNome}
          limite={LIMITE_DM}
          aiDisponibile={aiDisponibile}
          onSuggerisci={async (tono) =>
            (await socialService.rispostaAi({ account: account.pageId, piattaforma: conv.piattaforma, tipo: 'MESSAGGIO', oggettoId: conv.id, tono })).testo
          }
          onInvia={invia}
        />
      </div>
    </div>
  )
}

function MessaggioDm({ m, precedente, contatto }: { m: SocialMessaggio; precedente?: SocialMessaggio; contatto: SocialConversazione }) {
  const nuovoGiorno = !precedente || new Date(precedente.creatoIl).toDateString() !== new Date(m.creatoIl).toDateString()
  return (
    <>
      {nuovoGiorno ? (
        <div className="so-separatore-giorno">
          <span>{new Date(m.creatoIl).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
      ) : null}
      <div className="so-bolla-riga" data-pagina={m.daPagina ? '' : undefined}>
        {!m.daPagina ? <AvatarSocial nome={contatto.contattoNome} src={contatto.contattoImmagine} dimensione="sm" /> : null}
        <div className="so-bolla" data-pagina={m.daPagina ? '' : undefined}>
          {m.testo ? <p className="so-bolla-testo">{m.testo}</p> : null}
          {m.allegati.map((a, i) =>
            a.tipo === 'IMMAGINE' || a.tipo === 'STICKER' ? (
              <a key={i} href={a.url ?? undefined} target="_blank" rel="noreferrer">
                <img className="so-bolla-img" src={a.anteprima ?? a.url ?? undefined} alt={a.nome ?? ''} referrerPolicy="no-referrer" />
              </a>
            ) : a.tipo === 'VIDEO' && a.url ? (
              <video key={i} className="so-bolla-img" src={a.url} controls preload="metadata" />
            ) : a.tipo === 'AUDIO' && a.url ? (
              <audio key={i} src={a.url} controls preload="metadata" />
            ) : (
              <a key={i} className="so-bolla-allegato" href={a.url ?? undefined} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" aria-hidden /> {a.nome ?? (a.tipo === 'STORIA' ? 'Risposta alla storia' : a.tipo === 'CONDIVISIONE' ? 'Contenuto condiviso' : 'Allegato')}
              </a>
            ),
          )}
          <div className="so-bolla-piede">
            <time dateTime={m.creatoIl}>{new Date(m.creatoIl).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</time>
            {m.daPagina && m.inviatoDaUtenteNome ? <span className="so-bolla-firma">· {m.inviatoDaUtenteNome}</span> : null}
          </div>
        </div>
      </div>
    </>
  )
}
