import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Loader2, MessageSquareQuote, Pencil, Plus, Send, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { messaggioErroreSocial, socialService, type SocialRispostaRapida, type SocialTono } from '@/services/social-service'

/*
  Composer dell'inbox: stesso componente per risposte ai commenti, risposte in privato e DM.
  - "/" a inizio testo apre le risposte rapide filtrate per scorciatoia o titolo;
  - {nome} nelle risposte rapide diventa il nome di battesimo del contatto;
  - ✨ chiede all'AI una bozza (il backend legge da sé commento/conversazione dall'id);
  - ⌘/Ctrl + Invio invia.
*/

export type ComposerHandle = { focus: () => void }

const TONI: { id: SocialTono; label: string }[] = [
  { id: 'CORDIALE', label: 'Cordiale' },
  { id: 'PROFESSIONALE', label: 'Professionale' },
  { id: 'EMPATICO', label: 'Empatico' },
  { id: 'BREVE', label: 'Breve' },
]

type Props = {
  placeholder: string
  nomeContatto: string | null
  limite?: number
  disabilitato?: string | null
  aiDisponibile: boolean
  onSuggerisci?: (tono: SocialTono) => Promise<string>
  onInvia: (testo: string) => Promise<void>
  etichettaInvio?: string
  /** Testo iniziale (es. "@nome " su Instagram). Cambia = il composer si reimposta. */
  iniziale?: string
  chiave: string
}

function nomeDiBattesimo(nome: string | null) {
  return (nome ?? '').trim().split(/\s+/)[0] ?? ''
}

export const SocialComposer = forwardRef<ComposerHandle, Props>(function SocialComposer(
  { placeholder, nomeContatto, limite, disabilitato, aiDisponibile, onSuggerisci, onInvia, etichettaInvio = 'Invia', iniziale = '', chiave },
  ref,
) {
  const [testo, setTesto] = useState(iniziale)
  const [invio, setInvio] = useState(false)
  const [ai, setAi] = useState(false)
  const [tono, setTono] = useState<SocialTono>('CORDIALE')
  const [rapide, setRapide] = useState<SocialRispostaRapida[] | null>(null)
  const [rapideAperte, setRapideAperte] = useState(false)
  const [gestione, setGestione] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({ focus: () => areaRef.current?.focus() }), [])

  // Bozze per elemento: cambiando commento o conversazione non si perde quello che si stava scrivendo.
  const bozze = useRef(new Map<string, string>())
  const chiavePrecedente = useRef(chiave)
  useEffect(() => {
    if (chiavePrecedente.current !== chiave) {
      bozze.current.set(chiavePrecedente.current, testo)
      chiavePrecedente.current = chiave
      setTesto(bozze.current.get(chiave) ?? iniziale)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave, iniziale])

  const caricaRapide = async () => {
    try {
      setRapide(await socialService.risposteRapide())
    } catch {
      setRapide([])
    }
  }
  useEffect(() => {
    void caricaRapide()
  }, [])

  const filtroSlash = testo.startsWith('/') && !testo.includes('\n') ? testo.slice(1).toLowerCase() : null
  useEffect(() => {
    if (filtroSlash != null) setRapideAperte(true)
  }, [filtroSlash])

  const rapideFiltrate = useMemo(() => {
    const lista = rapide ?? []
    if (!filtroSlash) return lista
    return lista.filter((r) => (r.scorciatoia ?? '').toLowerCase().includes(filtroSlash) || r.titolo.toLowerCase().includes(filtroSlash))
  }, [rapide, filtroSlash])

  const inserisciRapida = (r: SocialRispostaRapida) => {
    const corpo = r.testo.replaceAll('{nome}', nomeDiBattesimo(nomeContatto)).replace(/\s+([,.!?])/g, '$1')
    setTesto((t) => (t.startsWith('/') || !t.trim() ? corpo : `${t.trimEnd()} ${corpo}`))
    setRapideAperte(false)
    void socialService.usaRispostaRapida(r.id)
    requestAnimationFrame(() => areaRef.current?.focus())
  }

  const suggerisci = async () => {
    if (!onSuggerisci) return
    setAi(true)
    try {
      const bozza = await onSuggerisci(tono)
      setTesto(bozza)
      requestAnimationFrame(() => areaRef.current?.focus())
    } catch (err) {
      toast.error(messaggioErroreSocial(err, 'L’AI non ha risposto'))
    } finally {
      setAi(false)
    }
  }

  const invia = async () => {
    const pulito = testo.trim()
    if (!pulito || invio || disabilitato) return
    if (limite && pulito.length > limite) {
      toast.error(`Il testo supera i ${limite} caratteri`)
      return
    }
    setInvio(true)
    try {
      await onInvia(pulito)
      setTesto(iniziale)
      bozze.current.delete(chiave)
    } catch (err) {
      toast.error(messaggioErroreSocial(err, 'Invio non riuscito'))
    } finally {
      setInvio(false)
    }
  }

  const lunghezza = testo.trim().length
  return (
    <div className="so-composer" data-disabilitato={disabilitato ? '' : undefined}>
      {disabilitato ? <div className="so-composer-blocco">{disabilitato}</div> : null}
      <textarea
        ref={areaRef}
        className="so-composer-area"
        value={testo}
        placeholder={placeholder}
        rows={3}
        disabled={!!disabilitato || invio}
        onChange={(e) => setTesto(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            void invia()
          } else if (e.key === 'Escape' && rapideAperte) {
            setRapideAperte(false)
          } else if (e.key === 'Enter' && filtroSlash != null && rapideFiltrate[0]) {
            e.preventDefault()
            inserisciRapida(rapideFiltrate[0])
          }
        }}
      />
      <div className="so-composer-barra">
        <Popover open={rapideAperte} onOpenChange={setRapideAperte}>
          <PopoverTrigger asChild>
            <button type="button" className="so-composer-btn" title="Risposte rapide (scrivi / per cercarle)" disabled={!!disabilitato}>
              <MessageSquareQuote className="size-4" aria-hidden />
              <span>Rapide</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="so-popover w-80 p-0" data-vl="" data-vl-page="social" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="so-rapide-head">
              <span>Risposte rapide</span>
              <button type="button" className="so-link" onClick={() => setGestione(true)}>
                <Pencil className="size-3" aria-hidden /> Gestisci
              </button>
            </div>
            <ul className="so-rapide-lista">
              {rapideFiltrate.length ? (
                rapideFiltrate.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => inserisciRapida(r)}>
                      <span className="so-rapide-titolo">
                        {r.titolo}
                        {r.scorciatoia ? <code>/{r.scorciatoia}</code> : null}
                      </span>
                      <span className="so-rapide-testo">{r.testo}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="so-rapide-vuoto">{rapide == null ? 'Caricamento…' : 'Nessuna risposta rapida trovata'}</li>
              )}
            </ul>
          </PopoverContent>
        </Popover>

        {aiDisponibile && onSuggerisci ? (
          <div className="so-composer-ai">
            <button type="button" className="so-composer-btn so-composer-btn--ai" onClick={() => void suggerisci()} disabled={ai || !!disabilitato} title="Bozza scritta dall’AI, da rileggere prima di inviare">
              {ai ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              <span>{ai ? 'Scrivo…' : 'Suggerisci'}</span>
            </button>
            <select className="so-composer-tono" value={tono} onChange={(e) => setTono(e.target.value as SocialTono)} aria-label="Tono della risposta" disabled={!!disabilitato}>
              {TONI.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <span className="so-composer-conta" data-oltre={limite && lunghezza > limite ? '' : undefined}>
          {limite ? `${lunghezza}/${limite}` : lunghezza || ''}
        </span>
        <span className="so-composer-hint">⌘↩</span>
        <button type="button" className="so-btn so-btn--invia" onClick={() => void invia()} disabled={!lunghezza || invio || !!disabilitato}>
          {invio ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          {etichettaInvio}
        </button>
      </div>

      <GestioneRisposteRapide aperto={gestione} onChiudi={() => setGestione(false)} rapide={rapide ?? []} onCambiate={caricaRapide} />
    </div>
  )
})

function GestioneRisposteRapide({
  aperto,
  onChiudi,
  rapide,
  onCambiate,
}: {
  aperto: boolean
  onChiudi: () => void
  rapide: SocialRispostaRapida[]
  onCambiate: () => Promise<void>
}) {
  const [modifica, setModifica] = useState<{ id?: number; titolo: string; testo: string; scorciatoia: string } | null>(null)
  const [salvo, setSalvo] = useState(false)

  const salva = async () => {
    if (!modifica || !modifica.titolo.trim() || !modifica.testo.trim()) return
    setSalvo(true)
    try {
      await socialService.salvaRispostaRapida({
        id: modifica.id,
        titolo: modifica.titolo.trim(),
        testo: modifica.testo.trim(),
        scorciatoia: modifica.scorciatoia.trim().replace(/^\//, '') || null,
      })
      setModifica(null)
      await onCambiate()
    } catch (err) {
      toast.error(messaggioErroreSocial(err, 'Non salvata'))
    } finally {
      setSalvo(false)
    }
  }

  const elimina = async (r: SocialRispostaRapida) => {
    try {
      await socialService.eliminaRispostaRapida(r.id)
      await onCambiate()
    } catch (err) {
      toast.error(messaggioErroreSocial(err, 'Non eliminata'))
    }
  }

  return (
    <Dialog open={aperto} onOpenChange={(o) => (!o ? onChiudi() : undefined)}>
      <DialogContent className="so-dialog max-w-xl" data-vl="" data-vl-page="social">
        <DialogHeader>
          <DialogTitle>Risposte rapide</DialogTitle>
          <DialogDescription>Le trovi in ogni risposta. {'{nome}'} diventa il nome della persona a cui rispondi.</DialogDescription>
        </DialogHeader>
        {modifica ? (
          <div className="so-form">
            <label>
              <span>Titolo</span>
              <input value={modifica.titolo} onChange={(e) => setModifica({ ...modifica, titolo: e.target.value })} maxLength={80} autoFocus />
            </label>
            <label>
              <span>Scorciatoia</span>
              <input value={modifica.scorciatoia} onChange={(e) => setModifica({ ...modifica, scorciatoia: e.target.value })} placeholder="es. prenota" maxLength={30} />
            </label>
            <label>
              <span>Testo</span>
              <textarea value={modifica.testo} onChange={(e) => setModifica({ ...modifica, testo: e.target.value })} rows={5} maxLength={2000} />
            </label>
            <DialogFooter>
              <button type="button" className="so-btn" onClick={() => setModifica(null)}>
                <X className="size-4" aria-hidden /> Annulla
              </button>
              <button type="button" className="so-btn so-btn--pieno" onClick={() => void salva()} disabled={salvo}>
                {salvo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />} Salva
              </button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <ul className="so-rapide-gestione">
              {rapide.map((r) => (
                <li key={r.id}>
                  <div className="min-w-0">
                    <div className="so-rapide-titolo">
                      {r.titolo}
                      {r.scorciatoia ? <code>/{r.scorciatoia}</code> : null}
                      <span className="so-rapide-usi">{r.usi} usi</span>
                    </div>
                    <div className="so-rapide-testo">{r.testo}</div>
                  </div>
                  <button type="button" className="so-icon-btn" onClick={() => setModifica({ id: r.id, titolo: r.titolo, testo: r.testo, scorciatoia: r.scorciatoia ?? '' })} aria-label="Modifica">
                    <Pencil className="size-4" />
                  </button>
                  <button type="button" className="so-icon-btn" onClick={() => void elimina(r)} aria-label="Elimina">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <button type="button" className="so-btn so-btn--pieno" onClick={() => setModifica({ titolo: '', testo: '', scorciatoia: '' })}>
                <Plus className="size-4" aria-hidden /> Nuova risposta
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
