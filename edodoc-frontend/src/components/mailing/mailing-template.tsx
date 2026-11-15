import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, FilePlus2, LayoutTemplate, Loader2, MoreHorizontal, Pencil, Save, Search, Sparkles, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingDocumento,
  type MailingStato,
  type MailingTemplate,
  type MailingTemplateRiga,
} from '@/services/mailing-service'
import { documentoDaHtml, documentoVuoto, normalizzaDocumento, renderEmail, templatePartenza, TEMPLATE_PARTENZA } from '@/lib/mailing-render'
import { MailingEditor } from './mailing-editor'
import { MailingMiniatura, SchermoIntero, TornaIndietro } from './mailing-anteprima'
import { ConfermaMailing, MailingDialog } from './mailing-dialog'
import { Vuoto } from './mailing-ui'
import { tempoFa } from './mailing-utils'
import '@/style/lux-mailing.css'
import '@/style/lux-mailing-editor.css'

/*
  Scheda Template: galleria con miniature vere (render dell'email), template pronti e salvati.
  Ogni template si apre nell'editor a tutto schermo.
*/

const cache = new Map<number, Promise<MailingTemplate>>()

function caricaTemplate(id: number, forza = false): Promise<MailingTemplate> {
  if (forza || !cache.has(id)) {
    const p = mailingService.template(id)
    p.catch(() => cache.delete(id))
    cache.set(id, p)
  }
  return cache.get(id)!
}

/** Documento modificabile di un template: quelli importati (senza design) diventano un unico blocco HTML. */
function documentoDi(t: MailingTemplate): MailingDocumento {
  return t.design ? normalizzaDocumento(t.design) : documentoDaHtml(t.html ?? '')
}

const ETICHETTA_ORIGINE: Record<MailingTemplateRiga['origine'], string> = { EDITOR: 'Tuo', SISTEMA: 'Di sistema' }

type Filtro = 'tutti' | 'pronti' | 'miei'

function MiniaturaSalvata({ riga }: { riga: MailingTemplateRiga }) {
  const [html, setHtml] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    let vivo = true
    const io = new IntersectionObserver(
      (v) => {
        if (!v.some((x) => x.isIntersecting)) return
        io.disconnect()
        caricaTemplate(riga.id)
          .then((t) => vivo && setHtml(t.design ? renderEmail(normalizzaDocumento(t.design)) : t.html || renderEmail(documentoVuoto())))
          .catch(() => vivo && setHtml(''))
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => {
      vivo = false
      io.disconnect()
    }
  }, [riga.id, riga.aggiornatoIl])
  return (
    <div ref={box}>
      <MailingMiniatura html={html} titolo={riga.nome} />
    </div>
  )
}

// ───────────────────────── Editor a tutto schermo ─────────────────────────

type Apertura = { tipo: 'esistente'; id: number } | { tipo: 'nuovo'; nome: string; categoria: string | null; documento: MailingDocumento }

export function EditorTemplate({ apertura, aiDisponibile, categorie, onChiudi, onSalvato }: { apertura: Apertura; aiDisponibile: boolean; categorie: string[]; onChiudi: () => void; onSalvato: (t: MailingTemplate) => void }) {
  const [id, setId] = useState<number | null>(apertura.tipo === 'esistente' ? apertura.id : null)
  const [nome, setNome] = useState(apertura.tipo === 'nuovo' ? apertura.nome : '')
  const [categoria, setCategoria] = useState(apertura.tipo === 'nuovo' ? apertura.categoria ?? '' : '')
  const [documento, setDocumento] = useState<MailingDocumento | null>(apertura.tipo === 'nuovo' ? apertura.documento : null)
  const [errore, setErrore] = useState<string | null>(null)
  const [sporco, setSporco] = useState(apertura.tipo === 'nuovo')
  const [salvando, setSalvando] = useState(false)
  const [conferma, setConferma] = useState(false)
  const corrente = useRef<{ doc: MailingDocumento; html: string } | null>(null)

  useEffect(() => {
    if (apertura.tipo !== 'esistente') return
    let vivo = true
    caricaTemplate(apertura.id, true)
      .then((t) => {
        if (!vivo) return
        setNome(t.nome)
        setCategoria(t.categoria ?? '')
        setDocumento(documentoDi(t))
      })
      .catch((e) => vivo && setErrore(messaggioErroreMailing(e, 'Template non trovato')))
    return () => {
      vivo = false
    }
  }, [apertura])

  const salva = useCallback(async () => {
    const doc = corrente.current?.doc ?? documento
    if (!doc) return false
    if (!nome.trim()) {
      toast.error('Dai un nome al template')
      return false
    }
    setSalvando(true)
    try {
      const input = { nome: nome.trim(), categoria: categoria.trim() || null, design: doc, html: renderEmail(doc) }
      const t = id ? await mailingService.aggiornaTemplate(id, input) : await mailingService.creaTemplate(input)
      cache.set(t.id, Promise.resolve(t))
      setId(t.id)
      setSporco(false)
      onSalvato(t)
      toast.success('Template salvato')
      return true
    } catch (e) {
      toast.error(messaggioErroreMailing(e, 'Template non salvato'))
      return false
    } finally {
      setSalvando(false)
    }
  }, [categoria, documento, id, nome, onSalvato])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void salva()
      }
    }
    const via = (e: BeforeUnloadEvent) => {
      if (sporco) e.preventDefault()
    }
    window.addEventListener('keydown', k)
    window.addEventListener('beforeunload', via)
    return () => {
      window.removeEventListener('keydown', k)
      window.removeEventListener('beforeunload', via)
    }
  }, [salva, sporco])

  const esci = () => (sporco ? setConferma(true) : onChiudi())

  return (
    <SchermoIntero etichetta={`Modifica template ${nome}`} onEsc={esci}>
      <header className="ml-schermo-testa">
        <TornaIndietro onClick={esci} etichetta="Template" />
        <div className="ml-schermo-titoli">
          <input className="ml-schermo-nome" value={nome} onChange={(e) => (setNome(e.target.value), setSporco(true))} placeholder="Nome del template" aria-label="Nome del template" />
          <input
            className="ml-input ml-btn--sm ml-schermo-categoria"
            list="ml-categorie-template"
            value={categoria}
            onChange={(e) => (setCategoria(e.target.value), setSporco(true))}
            placeholder="Categoria"
            aria-label="Categoria"
          />
          <datalist id="ml-categorie-template">
            {categorie.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="ml-schermo-azioni">
          <span className="ml-salvataggio" data-stato={salvando ? 'salvo' : sporco ? 'sporco' : 'ok'} aria-live="polite">
            {salvando ? <Loader2 className="ml-ed-gira" /> : sporco ? <span className="ml-salvataggio-punto" /> : <Check />}
            {salvando ? 'Salvataggio…' : sporco ? 'Modifiche non salvate' : 'Salvato'}
          </span>
          <button type="button" className="ml-btn ml-btn--pieno" onClick={() => void salva()} disabled={salvando || !documento}>
            <Save /> Salva
          </button>
        </div>
      </header>
      <div className="ml-schermo-corpo">
        {errore ? (
          <Vuoto icona={<LayoutTemplate />} titolo="Non riesco ad aprire il template" testo={errore} azioni={<button className="ml-btn" onClick={onChiudi}>Torna alla galleria</button>} />
        ) : documento ? (
          <MailingEditor
            documento={documento}
            aiDisponibile={aiDisponibile}
            onChange={(doc, html) => {
              corrente.current = { doc, html }
              setSporco(true)
            }}
          />
        ) : (
          <div className="ml-schermo-attesa">
            <Loader2 className="ml-ed-gira" /> Apro il template…
          </div>
        )}
      </div>
      <ConfermaMailing
        open={conferma}
        onOpenChange={setConferma}
        titolo="Uscire senza salvare?"
        testo="Hai modifiche non salvate a questo template. Se esci adesso andranno perse."
        conferma="Esci senza salvare"
        pericolo
        onConferma={() => onChiudi()}
      >
        <button
          type="button"
          className="ml-btn ml-schermo-salva-esci"
          onClick={async () => {
            if (await salva()) onChiudi()
          }}
        >
          <Save /> Salva ed esci
        </button>
      </ConfermaMailing>
    </SchermoIntero>
  )
}

// ───────────────────────── Galleria ─────────────────────────

function CartaPronta({ t, onUsa }: { t: (typeof TEMPLATE_PARTENZA)[number]; onUsa: () => void }) {
  const html = useMemo(() => renderEmail(t.documento), [t])
  return (
    <button type="button" className="ml-tpl" onClick={onUsa} aria-label={`Usa il template ${t.nome}`}>
      <div className="ml-tpl-mini">
        <MailingMiniatura html={html} titolo={t.nome} />
        <span className="ml-tpl-usa">
          <Sparkles /> Usa questo
        </span>
      </div>
      <div className="ml-tpl-info">
        <div className="ml-tpl-nome">{t.nome}</div>
        <div className="ml-tpl-desc">{t.descrizione}</div>
        <div className="ml-tpl-meta">
          <span className="ml-badge ml-badge--info">Pronto</span>
          <span className="ml-tpl-cat">{t.categoria}</span>
        </div>
      </div>
    </button>
  )
}

function CartaSalvata({ r, onApri, onDuplica, onRinomina, onElimina }: { r: MailingTemplateRiga; onApri: () => void; onDuplica: () => void; onRinomina: () => void; onElimina: () => void }) {
  return (
    <div className="ml-tpl" role="group" aria-label={r.nome}>
      <button type="button" className="ml-tpl-mini" onClick={onApri} aria-label={`Apri ${r.nome}`}>
        <MiniaturaSalvata riga={r} />
        <span className="ml-tpl-usa">
          <Pencil /> Modifica
        </span>
      </button>
      <div className="ml-tpl-info">
        <div className="ml-tpl-riga">
          <button type="button" className="ml-tpl-nome ml-tpl-nome-btn" onClick={onApri}>
            {r.nome}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ml-ed-icona-btn" aria-label={`Azioni per ${r.nome}`}>
                <MoreHorizontal />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="ml-ed-menu" data-vl="" data-vl-page="mailing">
              <DropdownMenuItem className="ml-ed-menu-voce ml-ed-menu-voce--riga" onSelect={onApri}>
                <Pencil /> Modifica
              </DropdownMenuItem>
              <DropdownMenuItem className="ml-ed-menu-voce ml-ed-menu-voce--riga" onSelect={onDuplica}>
                <Copy /> Duplica
              </DropdownMenuItem>
              <DropdownMenuItem className="ml-ed-menu-voce ml-ed-menu-voce--riga" onSelect={onRinomina}>
                <LayoutTemplate /> Rinomina
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="ml-ed-menu-voce ml-ed-menu-voce--riga ml-ed-menu-voce--pericolo" onSelect={onElimina}>
                <Trash2 /> Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="ml-tpl-meta">
          <span className={`ml-badge ${r.origine === 'SISTEMA' ? 'ml-badge--info' : 'ml-badge--neutro'}`}>{ETICHETTA_ORIGINE[r.origine]}</span>
          {r.categoria ? <span className="ml-tpl-cat">{r.categoria}</span> : null}
          {r.aggiornatoIl ? <span className="ml-tpl-data">{tempoFa(r.aggiornatoIl)}</span> : null}
        </div>
      </div>
    </div>
  )
}

export function MailingTemplateTab({ stato }: { stato: MailingStato }) {
  const [righe, setRighe] = useState<MailingTemplateRiga[] | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [apertura, setApertura] = useState<Apertura | null>(null)
  const [rinomina, setRinomina] = useState<{ r: MailingTemplateRiga; nome: string; categoria: string } | null>(null)
  const [elimina, setElimina] = useState<MailingTemplateRiga | null>(null)

  const carica = useCallback(() => {
    mailingService
      .templates()
      .then((r) => {
        setRighe(r)
        setErrore(null)
      })
      .catch((e) => setErrore(messaggioErroreMailing(e, 'Template non disponibili')))
  }, [])
  useEffect(carica, [carica])

  const categorie = useMemo(() => {
    const s = new Set<string>(TEMPLATE_PARTENZA.map((t) => t.categoria))
    righe?.forEach((r) => r.categoria && s.add(r.categoria))
    return [...s].sort((a, b) => a.localeCompare(b, 'it'))
  }, [righe])

  const testo = q.trim().toLowerCase()
  const pronti = TEMPLATE_PARTENZA.filter((t) => (filtro === 'tutti' || filtro === 'pronti') && (!categoria || t.categoria === categoria) && (!testo || `${t.nome} ${t.descrizione}`.toLowerCase().includes(testo)))
  const salvati = (righe ?? []).filter(
    (r) =>
      filtro !== 'pronti' &&
      (!categoria || r.categoria === categoria) &&
      (!testo || r.nome.toLowerCase().includes(testo)),
  )
  const conta = { tutti: TEMPLATE_PARTENZA.length + (righe?.length ?? 0), pronti: TEMPLATE_PARTENZA.length, miei: righe?.length ?? 0 }

  const usaPronto = (chiave: string) => {
    const t = templatePartenza().find((x) => x.chiave === chiave)
    if (t) setApertura({ tipo: 'nuovo', nome: t.nome, categoria: t.categoria, documento: t.documento })
  }

  const duplica = async (r: MailingTemplateRiga) => {
    try {
      const t = await caricaTemplate(r.id)
      const doc = documentoDi(t)
      await mailingService.creaTemplate({ nome: `${t.nome} (copia)`, categoria: t.categoria, design: t.design ? doc : null, html: t.design ? renderEmail(doc) : t.html })
      toast.success('Template duplicato')
      carica()
    } catch (e) {
      toast.error(messaggioErroreMailing(e, 'Template non duplicato'))
    }
  }

  return (
    <div className="ml-tpl-pagina">
      <div className="ml-tpl-barra">
        <div className="ml-tpl-cerca">
          <Search aria-hidden />
          <input className="ml-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un template" aria-label="Cerca un template" />
        </div>
        <div className="ml-seg" role="tablist" aria-label="Origine">
          {(
            [
              ['tutti', 'Tutti'],
              ['pronti', 'Pronti'],
              ['miei', 'Salvati'],
            ] as [Filtro, string][]
          )
            .map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={filtro === k} data-active={filtro === k ? '' : undefined} onClick={() => setFiltro(k)}>
                {l} <span className="ml-tpl-conta">{conta[k]}</span>
              </button>
            ))}
        </div>
        <button type="button" className="ml-btn ml-btn--pieno ml-tpl-nuovo" onClick={() => setApertura({ tipo: 'nuovo', nome: 'Nuovo template', categoria: null, documento: documentoVuoto() })}>
          <FilePlus2 /> Nuovo template
        </button>
      </div>
      {categorie.length > 1 ? (
        <div className="ml-tpl-categorie" role="group" aria-label="Categorie">
          <button type="button" className={`ml-chip${!categoria ? ' ml-chip--attivo' : ''}`} aria-pressed={!categoria} onClick={() => setCategoria(null)}>
            Tutte le categorie
          </button>
          {categorie.map((c) => (
            <button key={c} type="button" className={`ml-chip${categoria === c ? ' ml-chip--attivo' : ''}`} aria-pressed={categoria === c} onClick={() => setCategoria(categoria === c ? null : c)}>
              {c}
            </button>
          ))}
        </div>
      ) : null}

      {pronti.length ? (
        <section className="ml-tpl-sezione" aria-label="Template pronti">
          <div className="ml-tpl-sezione-titolo">
            <Sparkles /> Pronti all'uso
            <span>Disegnati per EdoDoc: scegline uno e cambia solo i testi.</span>
          </div>
          <div className="ml-tpl-griglia">
            {pronti.map((t) => (
              <CartaPronta key={t.chiave} t={t} onUsa={() => usaPronto(t.chiave)} />
            ))}
          </div>
        </section>
      ) : null}

      {filtro !== 'pronti' ? (
        <section className="ml-tpl-sezione" aria-label="Template salvati">
          <div className="ml-tpl-sezione-titolo">
            <LayoutTemplate /> I tuoi template
          </div>
          {errore ? (
            <Vuoto icona={<LayoutTemplate />} titolo="Template non disponibili" testo={errore} azioni={<button className="ml-btn" onClick={carica}>Riprova</button>} />
          ) : righe == null ? (
            <div className="ml-tpl-griglia">
              {[0, 1, 2].map((i) => (
                <div key={i} className="ml-tpl ml-tpl--attesa">
                  <span className="ml-skeleton" style={{ height: 300, display: 'block' }} />
                  <div className="ml-tpl-info">
                    <span className="ml-skeleton" style={{ height: 14, width: '60%', display: 'block' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : salvati.length ? (
            <div className="ml-tpl-griglia">
              {salvati.map((r) => (
                <CartaSalvata
                  key={r.id}
                  r={r}
                  onApri={() => setApertura({ tipo: 'esistente', id: r.id })}
                  onDuplica={() => void duplica(r)}
                  onRinomina={() => setRinomina({ r, nome: r.nome, categoria: r.categoria ?? '' })}
                  onElimina={() => setElimina(r)}
                />
              ))}
            </div>
          ) : (
            <Vuoto
              className="ml-tpl-vuoto"
              icona={<LayoutTemplate />}
              titolo={testo || categoria ? 'Nessun template corrisponde' : 'Ancora nessun template salvato'}
              testo={testo || categoria ? 'Prova a cambiare la ricerca o la categoria.' : 'Parti da uno di quelli pronti qui sopra, personalizzalo con logo e colori di EdoDoc e salvalo: lo ritrovi qui per le prossime campagne.'}
            />
          )}
        </section>
      ) : null}

      {apertura ? (
        <EditorTemplate
          apertura={apertura}
          aiDisponibile={stato.aiDisponibile}
          categorie={categorie}
          onChiudi={() => {
            setApertura(null)
            carica()
          }}
          onSalvato={() => undefined}
        />
      ) : null}

      <MailingDialog open={!!rinomina} onOpenChange={(o) => !o && setRinomina(null)} titolo="Rinomina template" icona={<Pencil />}>
        {rinomina ? (
          <form
            className="ml-tpl-form"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                const t = await caricaTemplate(rinomina.r.id)
                const aggiornato = await mailingService.aggiornaTemplate(t.id, { nome: rinomina.nome.trim() || t.nome, categoria: rinomina.categoria.trim() || null, design: t.design, html: t.html })
                cache.set(t.id, Promise.resolve(aggiornato))
                setRinomina(null)
                carica()
              } catch (err) {
                toast.error(messaggioErroreMailing(err, 'Template non rinominato'))
              }
            }}
          >
            <label className="ml-campo">
              <span className="ml-campo-etichetta">Nome</span>
              <input className="ml-input" autoFocus value={rinomina.nome} onChange={(e) => setRinomina({ ...rinomina, nome: e.target.value })} />
            </label>
            <label className="ml-campo">
              <span className="ml-campo-etichetta">Categoria</span>
              <input className="ml-input" list="ml-categorie-rinomina" value={rinomina.categoria} onChange={(e) => setRinomina({ ...rinomina, categoria: e.target.value })} placeholder="Es. Newsletter" />
              <datalist id="ml-categorie-rinomina">
                {categorie.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <div className="ml-dialog-piede">
              <button type="button" className="ml-btn ml-btn--ghost" onClick={() => setRinomina(null)}>
                Annulla
              </button>
              <button type="submit" className="ml-btn ml-btn--pieno">
                Salva
              </button>
            </div>
          </form>
        ) : null}
      </MailingDialog>

      <ConfermaMailing
        open={!!elimina}
        onOpenChange={(o) => !o && setElimina(null)}
        titolo="Eliminare il template?"
        icona={<Trash2 />}
        testo={elimina ? `"${elimina.nome}" sparirà dalla galleria. Le campagne già create con questo template non cambiano.` : ''}
        conferma="Elimina"
        pericolo
        onConferma={async () => {
          if (!elimina) return
          try {
            await mailingService.eliminaTemplate(elimina.id)
            cache.delete(elimina.id)
            toast.success('Template eliminato')
            carica()
          } catch (e) {
            toast.error(messaggioErroreMailing(e, 'Template non eliminato'))
            return false
          }
        }}
      />
    </div>
  )
}
