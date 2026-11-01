import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AlertOctagon, Archive, ArrowLeft, ChevronDown, Download, File, FileImage, FileSpreadsheet, FileText, Forward, Inbox, Loader2, Mail,
  PenLine, Reply, ReplyAll, RotateCcw, Star, Trash2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LuxAvatar } from '@/components/lux'
import { toast } from '@/lib/toast'
import {
  casellaService,
  messaggioErrore,
  type EmailAllegato,
  type EmailCasella,
  type EmailEtichetta,
  type EmailMessaggio,
  type EmailThread,
} from '@/services/casella-service'
import { EmailCorpo } from './email-corpo'
import { dataCompleta, dataRelativa, dimensioneFile, ETICHETTE_NASCOSTE, inizialiIndirizzo, nomeIndirizzo, type ModoComposer } from './email-utils'

export type AzioneThread = 'archivia' | 'inArrivo' | 'cestina' | 'ripristina' | 'spam' | 'nonSpam' | 'nonLetto' | 'speciale' | 'nonSpeciale'

function IconaFile({ mime }: { mime: string | null }) {
  const m = mime ?? ''
  if (m.startsWith('image/')) return <FileImage aria-hidden />
  if (m === 'application/pdf' || m.startsWith('text/')) return <FileText aria-hidden />
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return <FileSpreadsheet aria-hidden />
  return <File aria-hidden />
}

function salvaBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function Allegati({ allegati }: { allegati: EmailAllegato[] }) {
  const [anteprima, setAnteprima] = useState<{ url: string; a: EmailAllegato } | null>(null)
  const [carica, setCarica] = useState<string | null>(null)
  const visibili = allegati.filter((a) => !a.inline || !a.mimeType?.startsWith('image/'))
  if (visibili.length === 0) return null

  const apri = async (a: EmailAllegato) => {
    const anteprimabile = (a.mimeType?.startsWith('image/') && !a.mimeType.includes('svg')) || a.mimeType === 'application/pdf'
    setCarica(a.allegatoId)
    try {
      const blob = await casellaService.allegato(a, anteprimabile)
      if (anteprimabile) setAnteprima({ url: URL.createObjectURL(new Blob([blob], { type: a.mimeType ?? undefined })), a })
      else salvaBlob(blob, a.nome)
    } catch (err) {
      toast.error(messaggioErrore(err, 'Allegato non disponibile'))
    } finally {
      setCarica(null)
    }
  }

  return (
    <>
      <ul className="em-allegati">
        {visibili.map((a) => (
          <li key={a.allegatoId}>
            <button type="button" className="em-allegato" onClick={() => void apri(a)} title={`${a.nome} · ${dimensioneFile(a.dimensione)}`}>
              <span className="em-allegato-ico" data-tipo={a.mimeType?.split('/')[0]}>
                {carica === a.allegatoId ? <Loader2 className="animate-spin" aria-hidden /> : <IconaFile mime={a.mimeType} />}
              </span>
              <span className="em-allegato-testo">
                <strong>{a.nome}</strong>
                <small>{dimensioneFile(a.dimensione)}</small>
              </span>
            </button>
            <button
              type="button"
              className="em-allegato-scarica"
              aria-label={`Scarica ${a.nome}`}
              onClick={async () => {
                try {
                  salvaBlob(await casellaService.allegato(a), a.nome)
                } catch (err) {
                  toast.error(messaggioErrore(err, 'Allegato non disponibile'))
                }
              }}
            >
              <Download />
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={Boolean(anteprima)}
        onOpenChange={(o) => {
          if (!o && anteprima) {
            URL.revokeObjectURL(anteprima.url)
            setAnteprima(null)
          }
        }}
      >
        <DialogContent className="em-anteprima sm:max-w-5xl" data-vl="" data-vl-page="email">
          <DialogTitle className="em-anteprima-titolo">{anteprima?.a.nome}</DialogTitle>
          <DialogDescription className="sr-only">Anteprima dell'allegato</DialogDescription>
          {anteprima?.a.mimeType === 'application/pdf' ? (
            <iframe title={anteprima.a.nome} src={anteprima.url} className="em-anteprima-pdf" />
          ) : anteprima ? (
            <img src={anteprima.url} alt={anteprima.a.nome} className="em-anteprima-img" />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Messaggio({
  m,
  espanso,
  mia,
  onToggle,
  onRispondi,
  onApriBozza,
  onScrivi,
}: {
  m: EmailMessaggio
  espanso: boolean
  mia: string
  onToggle: () => void
  onRispondi: (modo: Exclude<ModoComposer, 'nuova' | 'bozza'>, m: EmailMessaggio) => void
  onApriBozza: (bozzaId: string) => void
  onScrivi: (email: string) => void
}) {
  const [dettagli, setDettagli] = useState(false)
  const [i1, i2] = inizialiIndirizzo(m.da)
  const destinatari = [...m.a, ...m.cc].map((x) => nomeIndirizzo(x, mia)).join(', ')

  if (m.bozza) {
    return (
      <article className="em-msg em-msg--bozza">
        <button type="button" className="em-msg-bozza" onClick={() => m.bozzaId && onApriBozza(m.bozzaId)} disabled={!m.bozzaId}>
          <PenLine aria-hidden />
          <span><strong>Bozza</strong> · {m.anteprima || 'senza testo'}</span>
          <span className="em-msg-bozza-cta">Continua a scrivere</span>
        </button>
      </article>
    )
  }

  return (
    <article className="em-msg" data-espanso={espanso ? '' : undefined} data-non-letto={m.nonLetto ? '' : undefined}>
      <header className="em-msg-testa" onClick={onToggle}>
        <LuxAvatar first={i1} second={i2} className="em-msg-av" />
        <div className="em-msg-chi">
          <div className="em-msg-riga1">
            <strong className="em-msg-nome">{nomeIndirizzo(m.da, mia)}</strong>
            {espanso && m.da ? <span className="em-msg-email">&lt;{m.da.email}&gt;</span> : null}
          </div>
          {espanso ? (
            <button
              type="button"
              className="em-msg-a"
              onClick={(e) => {
                e.stopPropagation()
                setDettagli((d) => !d)
              }}
            >
              a {destinatari || 'nessuno'} <ChevronDown aria-hidden data-aperto={dettagli ? '' : undefined} />
            </button>
          ) : (
            <span className="em-msg-anteprima">{m.anteprima}</span>
          )}
        </div>
        <time className="em-msg-data" title={dataCompleta(m.data)} dateTime={new Date(m.data).toISOString()}>
          {espanso ? `${dataCompleta(m.data)} (${dataRelativa(m.data)})` : dataRelativa(m.data)}
        </time>
        {espanso ? (
          <div className="em-msg-azioni" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="em-icon-btn" title="Rispondi" aria-label="Rispondi" onClick={() => onRispondi('rispondi', m)}><Reply /></button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="em-icon-btn" aria-label="Altre azioni"><ChevronDown /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" data-vl="" data-vl-page="email" className="em-menu">
                <DropdownMenuItem onSelect={() => onRispondi('rispondi', m)}><Reply /> Rispondi</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onRispondi('rispondiTutti', m)}><ReplyAll /> Rispondi a tutti</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onRispondi('inoltra', m)}><Forward /> Inoltra</DropdownMenuItem>
                {m.da ? <DropdownMenuItem onSelect={() => onScrivi(m.da!.email)}><Mail /> Nuova email a {nomeIndirizzo(m.da)}</DropdownMenuItem> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </header>
      {espanso && dettagli ? (
        <dl className="em-msg-dettagli">
          <dt>Da</dt><dd>{m.da ? `${nomeIndirizzo(m.da)} <${m.da.email}>` : '—'}</dd>
          <dt>A</dt><dd>{m.a.map((x) => x.email).join(', ') || '—'}</dd>
          {m.cc.length ? (<><dt>Cc</dt><dd>{m.cc.map((x) => x.email).join(', ')}</dd></>) : null}
          {m.ccn.length ? (<><dt>Ccn</dt><dd>{m.ccn.map((x) => x.email).join(', ')}</dd></>) : null}
          <dt>Data</dt><dd>{dataCompleta(m.data)}</dd>
          <dt>Oggetto</dt><dd>{m.oggetto}</dd>
        </dl>
      ) : null}
      {espanso ? (
        <div className="em-msg-corpo">
          <div className="em-carta">
            <EmailCorpo html={m.html ?? ''} onMailto={onScrivi} />
          </div>
          <Allegati allegati={m.allegati} />
        </div>
      ) : null}
    </article>
  )
}

interface EmailLetturaProps {
  thread: EmailThread | null
  caricamento: boolean
  errore: string | null
  casella: EmailCasella
  etichette: EmailEtichetta[]
  composer: ReactNode
  onAzione: (azione: AzioneThread) => void
  onRispondi: (modo: Exclude<ModoComposer, 'nuova' | 'bozza'>, m?: EmailMessaggio) => void
  onApriBozza: (bozzaId: string) => void
  onScrivi: (email: string) => void
  onChiudi: () => void
  onRiprova: () => void
}

export function EmailLettura({
  thread, caricamento, errore, casella, etichette, composer, onAzione, onRispondi, onApriBozza, onScrivi, onChiudi, onRiprova,
}: EmailLetturaProps) {
  const [espansi, setEspansi] = useState<Set<string>>(new Set())
  const [mostraVecchi, setMostraVecchi] = useState(false)

  useEffect(() => {
    if (!thread) return
    const veri = thread.messaggi.filter((m) => !m.bozza)
    const ultimo = veri[veri.length - 1]
    setEspansi(new Set([...veri.filter((m) => m.nonLetto).map((m) => m.id), ...(ultimo ? [ultimo.id] : [])]))
    setMostraVecchi(false)
  }, [thread?.id, thread?.messaggi.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const perId = useMemo(() => new Map(etichette.map((e) => [e.id, e])), [etichette])

  if (caricamento && !thread) {
    return (
      <div className="em-lettura em-lettura--vuota" aria-busy>
        <div className="em-scheletro-lettura">
          <span className="w-2/3" /><span className="w-1/3" /><span className="h-40" /><span className="w-1/2" />
        </div>
      </div>
    )
  }
  if (errore) {
    return (
      <div className="em-lettura em-lettura--vuota">
        <div className="em-vuoto">
          <AlertOctagon aria-hidden />
          <p>{errore}</p>
          <button type="button" className="em-btn" onClick={onRiprova}>Riprova</button>
        </div>
      </div>
    )
  }
  if (!thread) {
    return (
      <div className="em-lettura em-lettura--vuota">
        <div className="em-vuoto em-vuoto--lettura">
          <div className="em-vuoto-orb" aria-hidden><Mail /></div>
          <p>Seleziona un'email per leggerla</p>
        </div>
      </div>
    )
  }

  const veri = thread.messaggi
  const inArrivo = thread.etichette.includes('INBOX')
  const nelCestino = thread.etichette.includes('TRASH')
  const spam = thread.etichette.includes('SPAM')
  const speciale = thread.etichette.includes('STARRED')
  const chip = thread.etichette.filter((id) => !ETICHETTE_NASCOSTE.has(id) && perId.get(id)?.tipo === 'USER').map((id) => perId.get(id)!)

  // Gmail: con molti messaggi, quelli in mezzo già letti si raccolgono in "N meno recenti".
  const indiciVisibili = new Set<number>()
  if (mostraVecchi || veri.length <= 4) veri.forEach((_, i) => indiciVisibili.add(i))
  else {
    indiciVisibili.add(0)
    veri.forEach((m, i) => {
      if (i >= veri.length - 2 || espansi.has(m.id) || m.bozza) indiciVisibili.add(i)
    })
  }
  const nascosti = veri.length - indiciVisibili.size

  return (
    <div className="em-lettura">
      <div className="em-lettura-main">
        <div className="em-lettura-barra" role="toolbar" aria-label="Azioni sulla conversazione">
          <button type="button" className="em-icon-btn em-solo-stretto" onClick={onChiudi} aria-label="Torna all'elenco"><ArrowLeft /></button>
          {nelCestino ? (
            <button type="button" className="em-icon-btn" title="Ripristina" aria-label="Ripristina" onClick={() => onAzione('ripristina')}><RotateCcw /></button>
          ) : inArrivo ? (
            <button type="button" className="em-icon-btn" title="Archivia" aria-label="Archivia" onClick={() => onAzione('archivia')}><Archive /></button>
          ) : !spam ? (
            <button type="button" className="em-icon-btn" title="Sposta in arrivo" aria-label="Sposta in arrivo" onClick={() => onAzione('inArrivo')}><Inbox /></button>
          ) : null}
          {spam ? (
            <button type="button" className="em-btn" onClick={() => onAzione('nonSpam')}>Non è spam</button>
          ) : (
            <button type="button" className="em-icon-btn" title="Segnala spam" aria-label="Segnala spam" onClick={() => onAzione('spam')}><AlertOctagon /></button>
          )}
          {!nelCestino ? (
            <button type="button" className="em-icon-btn" title="Elimina" aria-label="Elimina" onClick={() => onAzione('cestina')}><Trash2 /></button>
          ) : null}
          <span className="em-barra-sep" aria-hidden />
          <button type="button" className="em-icon-btn" title="Segna come da leggere" aria-label="Segna come da leggere" onClick={() => onAzione('nonLetto')}><Mail /></button>
          <button
            type="button"
            className="em-icon-btn"
            data-attivo={speciale ? '' : undefined}
            title={speciale ? 'Togli da speciali' : 'Speciale'}
            aria-label="Speciale"
            aria-pressed={speciale}
            onClick={() => onAzione(speciale ? 'nonSpeciale' : 'speciale')}
          >
            <Star className={speciale ? 'em-stella-piena' : undefined} />
          </button>
          <span className="flex-1" />
        </div>

        <div className="em-lettura-scroll">
          <header className="em-lettura-testa">
            <h2 className="em-lettura-oggetto">{thread.oggetto?.trim() || '(nessun oggetto)'}</h2>
            {chip.length ? (
              <div className="em-lettura-chip">
                {chip.map((e) => (
                  <span key={e.id} className="em-chip-etichetta" style={{ '--em-et': e.coloreSfondo ?? 'var(--vl-ink-3)' } as CSSProperties}>{e.nome}</span>
                ))}
              </div>
            ) : null}
          </header>

          <div className="em-thread">
            {veri.map((m, i) => {
              if (!indiciVisibili.has(i)) {
                if (i === 1 && nascosti > 0) {
                  return (
                    <button key="vecchi" type="button" className="em-thread-vecchi" onClick={() => setMostraVecchi(true)}>
                      <span>{nascosti}</span> messaggi meno recenti
                    </button>
                  )
                }
                return null
              }
              return (
                <Messaggio
                  key={m.id}
                  m={m}
                  mia={casella.email}
                  espanso={espansi.has(m.id)}
                  onToggle={() =>
                    setEspansi((s) => {
                      const n = new Set(s)
                      if (n.has(m.id)) n.delete(m.id)
                      else n.add(m.id)
                      return n
                    })
                  }
                  onRispondi={onRispondi}
                  onApriBozza={onApriBozza}
                  onScrivi={onScrivi}
                />
              )
            })}
          </div>

          {composer ?? (
            <div className="em-rispondi-barra">
              <button type="button" className="em-btn em-btn--grande" onClick={() => onRispondi('rispondi')}><Reply aria-hidden /> Rispondi</button>
              <button type="button" className="em-btn em-btn--grande" onClick={() => onRispondi('rispondiTutti')}><ReplyAll aria-hidden /> Rispondi a tutti</button>
              <button type="button" className="em-btn em-btn--grande" onClick={() => onRispondi('inoltra')}><Forward aria-hidden /> Inoltra</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
