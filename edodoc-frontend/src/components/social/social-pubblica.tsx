import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe2,
  Heart,
  ImagePlus,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  Sparkles,
  ThumbsUp,
  X,
  XCircle,
  Zap,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/lib/toast'
import {
  messaggioErroreSocial,
  socialService,
  type SocialAccount,
  type SocialPiattaforma,
  type SocialPubblicazione,
  type SocialStatoPubblicazione,
  type SocialTono,
} from '@/services/social-service'
import { IconaPiattaforma } from './social-ui'
import {
  contaHashtag,
  dataOra,
  LIMITE_HASHTAG_INSTAGRAM,
  LIMITE_INSTAGRAM,
  locale,
  NOMI_PIATTAFORMA,
  tempoFa,
} from './social-utils'

// 5 MB: il limite generico degli upload di EdoDoc (LimiteUploadFilter) è 6 MB per richiesta
const MAX_BYTES = 5 * 1024 * 1024
const LIMITE_FACEBOOK = 63206

type Props = { account: SocialAccount; aiDisponibile: boolean; generazione: number; onPubblicato: () => void }

const STATI: Record<SocialStatoPubblicazione, { label: string; tono: string }> = {
  PROGRAMMATA: { label: 'Programmata', tono: 'info' },
  IN_CORSO: { label: 'In pubblicazione', tono: 'violet' },
  PUBBLICATA: { label: 'Pubblicata', tono: 'ok' },
  PARZIALE: { label: 'Parziale', tono: 'warn' },
  ERRORE: { label: 'Errore', tono: 'danger' },
  ANNULLATA: { label: 'Annullata', tono: 'muted' },
}

function prossimo(ora: number, minuti: number, giorniAvanti = 0): Date {
  const d = new Date()
  d.setDate(d.getDate() + giorniAvanti)
  d.setHours(ora, minuti, 0, 0)
  if (d.getTime() < Date.now() + 15 * 60_000) d.setDate(d.getDate() + 1)
  return d
}

export function SocialPubblica({ account, aiDisponibile, generazione, onPubblicato }: Props) {
  const haInstagram = !!account.instagramId
  const [piattaforme, setPiattaforme] = useState<SocialPiattaforma[]>(haInstagram ? ['FACEBOOK', 'INSTAGRAM'] : ['FACEBOOK'])
  const [testo, setTesto] = useState('')
  const [testoIg, setTestoIg] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [immagine, setImmagine] = useState<File | null>(null)
  const [anteprimaImg, setAnteprimaImg] = useState<string | null>(null)
  const [proporzione, setProporzione] = useState<number | null>(null)
  const [programma, setProgramma] = useState(false)
  const [quando, setQuando] = useState(() => locale(prossimo(18, 30)))
  const [invio, setInvio] = useState(false)
  const [trascina, setTrascina] = useState(false)
  const [lista, setLista] = useState<SocialPubblicazione[] | null>(null)
  const inputFile = useRef<HTMLInputElement>(null)

  const caricaLista = useCallback(async () => {
    try {
      setLista(await socialService.pubblicazioni(account.pageId))
    } catch {
      setLista((l) => l ?? [])
    }
  }, [account.pageId])

  useEffect(() => {
    void caricaLista()
  }, [caricaLista, generazione])

  // Mentre c'è qualcosa in corso o in arrivo nei prossimi minuti, la coda si aggiorna da sola.
  useEffect(() => {
    const attesa = lista?.some((p) => p.stato === 'IN_CORSO' || (p.stato === 'PROGRAMMATA' && p.programmataAlle && new Date(p.programmataAlle).getTime() - Date.now() < 5 * 60_000))
    if (!attesa) return
    const id = window.setInterval(() => void caricaLista(), 10_000)
    return () => window.clearInterval(id)
  }, [lista, caricaLista])

  useEffect(() => {
    if (!immagine) {
      setAnteprimaImg(null)
      setProporzione(null)
      return
    }
    const url = URL.createObjectURL(immagine)
    setAnteprimaImg(url)
    const img = new Image()
    img.onload = () => setProporzione(img.width / img.height)
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [immagine])

  const scegliFile = (f: File | null | undefined) => {
    if (!f) return
    if (!['image/jpeg', 'image/png'].includes(f.type)) {
      toast.error('Usa un’immagine JPG o PNG')
      return
    }
    if (f.size > MAX_BYTES) {
      toast.error('L’immagine supera 5 MB')
      return
    }
    setImmagine(f)
  }

  const alterna = (p: SocialPiattaforma) =>
    setPiattaforme((attuali) => (attuali.includes(p) ? attuali.filter((x) => x !== p) : [...attuali, p]))

  const conIg = piattaforme.includes('INSTAGRAM')
  const conFb = piattaforme.includes('FACEBOOK')
  const testoInstagram = testoIg ?? testo
  const hashtagIg = contaHashtag(testoInstagram)

  const problemi = useMemo(() => {
    const p: string[] = []
    if (!piattaforme.length) p.push('Scegli almeno una piattaforma')
    if (!testo.trim() && !immagine) p.push('Scrivi un testo o aggiungi un’immagine')
    if (conIg && !immagine) p.push('Instagram vuole un’immagine')
    if (conIg && testoInstagram.length > LIMITE_INSTAGRAM) p.push(`Su Instagram massimo ${LIMITE_INSTAGRAM} caratteri`)
    if (conIg && hashtagIg > LIMITE_HASHTAG_INSTAGRAM) p.push(`Su Instagram massimo ${LIMITE_HASHTAG_INSTAGRAM} hashtag`)
    if (conIg && proporzione != null && (proporzione < 0.8 || proporzione > 1.91)) p.push('Instagram accetta proporzioni tra 4:5 e 1,91:1')
    if (link.trim() && !/^https?:\/\//i.test(link.trim())) p.push('Il link deve iniziare con https://')
    if (programma) {
      const t = new Date(quando).getTime()
      if (!Number.isFinite(t) || t < Date.now() + 2 * 60_000) p.push('Programma almeno fra qualche minuto')
    }
    return p
  }, [piattaforme, testo, immagine, conIg, testoInstagram, hashtagIg, proporzione, link, programma, quando])

  const pubblica = async () => {
    if (problemi.length || invio) return
    setInvio(true)
    try {
      const base = { account: account.pageId, link: link.trim() || null, programmataAlle: programma ? quando : null }
      // Testi diversi per piattaforma = due pubblicazioni, una per piattaforma.
      const richieste =
        testoIg != null && conIg && conFb
          ? [
              { ...base, piattaforme: ['FACEBOOK'] as SocialPiattaforma[], testo: testo.trim() },
              { ...base, piattaforme: ['INSTAGRAM'] as SocialPiattaforma[], testo: testoIg.trim() },
            ]
          : [{ ...base, piattaforme, testo: (conIg && !conFb ? testoInstagram : testo).trim() }]
      const esiti = []
      for (const r of richieste) esiti.push(await socialService.pubblica(r, immagine))
      const errori = esiti.filter((e) => e.stato === 'ERRORE' || e.stato === 'PARZIALE')
      if (errori.length) {
        toast.error(errori[0].errore ?? 'Pubblicazione non riuscita su una piattaforma')
      } else if (programma) {
        toast.success(`Programmato per ${dataOra(new Date(quando).toISOString())}`)
      } else {
        toast.success('Pubblicato! 🎉')
      }
      setTesto('')
      setTestoIg(null)
      setLink('')
      setImmagine(null)
      void caricaLista()
      onPubblicato()
    } catch (err) {
      toast.error(messaggioErroreSocial(err, 'Pubblicazione non riuscita'))
    } finally {
      setInvio(false)
    }
  }

  const annulla = async (p: SocialPubblicazione) => {
    try {
      await socialService.annullaPubblicazione(p.id)
      toast.success('Pubblicazione annullata')
      void caricaLista()
    } catch (err) {
      toast.error(messaggioErroreSocial(err))
    }
  }

  const programmate = (lista ?? []).filter((p) => p.stato === 'PROGRAMMATA' || p.stato === 'IN_CORSO').sort((a, b) => (a.programmataAlle ?? '').localeCompare(b.programmataAlle ?? ''))
  const storico = (lista ?? []).filter((p) => p.stato !== 'PROGRAMMATA' && p.stato !== 'IN_CORSO')

  return (
    <div className="so-pubblica">
      <section className="so-card so-editor">
        <div className="so-card-head">
          <div>
            <div className="so-titolo">Nuovo post</div>
            <div className="so-sottotitolo">Scrivi una volta, pubblica dove vuoi. Subito o quando vuoi tu.</div>
          </div>
        </div>

        <div className="so-editor-piattaforme" role="group" aria-label="Dove pubblicare">
          {(['FACEBOOK', 'INSTAGRAM'] as const).map((p) => {
            const off = p === 'INSTAGRAM' && !haInstagram
            return (
              <button key={p} type="button" className="so-piattaforma-toggle" data-p={p} aria-pressed={piattaforme.includes(p)} data-active={piattaforme.includes(p) ? '' : undefined} disabled={off} onClick={() => alterna(p)} title={off ? 'Nessun profilo Instagram collegato a questa pagina' : undefined}>
                <IconaPiattaforma piattaforma={p} className="size-4" />
                <span>{NOMI_PIATTAFORMA[p]}</span>
                {piattaforme.includes(p) ? <CheckCircle2 className="size-4" aria-hidden /> : null}
              </button>
            )
          })}
        </div>

        <div
          className="so-dropzona"
          data-trascina={trascina ? '' : undefined}
          data-piena={anteprimaImg ? '' : undefined}
          onDragOver={(e) => {
            e.preventDefault()
            setTrascina(true)
          }}
          onDragLeave={() => setTrascina(false)}
          onDrop={(e) => {
            e.preventDefault()
            setTrascina(false)
            scegliFile(e.dataTransfer.files?.[0])
          }}
        >
          {anteprimaImg ? (
            <>
              <img src={anteprimaImg} alt="Immagine del post" />
              <button type="button" className="so-dropzona-rimuovi" onClick={() => setImmagine(null)} aria-label="Rimuovi immagine">
                <X className="size-4" />
              </button>
            </>
          ) : (
            <button type="button" className="so-dropzona-vuota" onClick={() => inputFile.current?.click()}>
              <ImagePlus className="size-6" aria-hidden />
              <strong>Trascina qui un’immagine</strong>
              <span>o clicca per sceglierla · JPG o PNG fino a 5 MB{conIg ? ' · necessaria per Instagram' : ''}</span>
            </button>
          )}
          <input ref={inputFile} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => scegliFile(e.target.files?.[0])} />
        </div>

        <div className="so-editor-testo">
          <div className="so-editor-testo-head">
            <span className="so-etichetta">{testoIg != null ? 'Testo per Facebook' : 'Testo'}</span>
            {aiDisponibile ? <AiDidascalia onScelta={(fb, ig) => { setTesto(fb); setTestoIg(conIg && conFb && ig !== fb ? ig : null) }} piattaforme={piattaforme} /> : null}
          </div>
          <textarea className="so-textarea" value={testo} onChange={(e) => setTesto(e.target.value)} rows={6} placeholder="Cosa vuoi raccontare oggi?" />
          <div className="so-editor-conta">
            {conFb ? <span data-oltre={testo.length > LIMITE_FACEBOOK ? '' : undefined}><IconaPiattaforma piattaforma="FACEBOOK" className="size-3" /> {testo.length}</span> : null}
            {conIg && testoIg == null ? (
              <>
                <span data-oltre={testo.length > LIMITE_INSTAGRAM ? '' : undefined}><IconaPiattaforma piattaforma="INSTAGRAM" className="size-3" /> {testo.length}/{LIMITE_INSTAGRAM}</span>
                <span data-oltre={hashtagIg > LIMITE_HASHTAG_INSTAGRAM ? '' : undefined}># {hashtagIg}/{LIMITE_HASHTAG_INSTAGRAM}</span>
              </>
            ) : null}
            {conIg && conFb ? (
              <button type="button" className="so-link" onClick={() => setTestoIg((t) => (t == null ? testo : null))}>
                {testoIg == null ? 'Testo diverso per Instagram' : 'Usa lo stesso testo'}
              </button>
            ) : null}
          </div>
          {testoIg != null ? (
            <>
              <span className="so-etichetta">Testo per Instagram</span>
              <textarea className="so-textarea" value={testoIg} onChange={(e) => setTestoIg(e.target.value)} rows={5} />
              <div className="so-editor-conta">
                <span data-oltre={testoIg.length > LIMITE_INSTAGRAM ? '' : undefined}><IconaPiattaforma piattaforma="INSTAGRAM" className="size-3" /> {testoIg.length}/{LIMITE_INSTAGRAM}</span>
                <span data-oltre={hashtagIg > LIMITE_HASHTAG_INSTAGRAM ? '' : undefined}># {hashtagIg}/{LIMITE_HASHTAG_INSTAGRAM}</span>
              </div>
            </>
          ) : null}
        </div>

        {conFb ? (
          <label className="so-campo-icona">
            <Link2 className="size-4" aria-hidden />
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link da allegare su Facebook (facoltativo)" inputMode="url" />
          </label>
        ) : null}

        <div className="so-quando">
          <div className="so-seg-chiaro" role="radiogroup" aria-label="Quando">
            <button type="button" role="radio" aria-checked={!programma} data-active={!programma ? '' : undefined} onClick={() => setProgramma(false)}>
              <Zap className="size-3.5" aria-hidden /> Subito
            </button>
            <button type="button" role="radio" aria-checked={programma} data-active={programma ? '' : undefined} onClick={() => setProgramma(true)}>
              <CalendarClock className="size-3.5" aria-hidden /> Programma
            </button>
          </div>
          {programma ? (
            <div className="so-quando-scelta">
              <input type="datetime-local" className="so-input" value={quando} min={locale(new Date(Date.now() + 5 * 60_000))} onChange={(e) => setQuando(e.target.value)} />
              <div className="so-chips">
                {[
                  ['Stasera 18:30', prossimo(18, 30)],
                  ['Domani 12:30', prossimo(12, 30, 1)],
                  ['Domani 19:00', prossimo(19, 0, 1)],
                ].map(([label, d]) => (
                  <button key={label as string} type="button" className="so-chip" onClick={() => setQuando(locale(d as Date))}>
                    {label as string}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {problemi.length ? (
          <ul className="so-problemi">
            {problemi.map((p) => (
              <li key={p}>
                <AlertTriangle className="size-3.5" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        ) : null}

        <button type="button" className="so-btn so-btn--pieno so-btn--grande" disabled={!!problemi.length || invio} onClick={() => void pubblica()}>
          {invio ? <Loader2 className="size-4 animate-spin" aria-hidden /> : programma ? <CalendarClock className="size-4" aria-hidden /> : <Send className="size-4" aria-hidden />}
          {invio ? 'Pubblicazione…' : programma ? 'Programma il post' : `Pubblica ora${piattaforme.length === 2 ? ' su entrambe' : ''}`}
        </button>
      </section>

      <section className="so-anteprime" aria-label="Anteprima">
        <div className="so-etichetta">Anteprima dal vivo</div>
        {conFb ? <AnteprimaFacebook account={account} testo={testo} immagine={anteprimaImg} link={link} /> : null}
        {conIg ? <AnteprimaInstagram account={account} testo={testoInstagram} immagine={anteprimaImg} /> : null}
        {!piattaforme.length ? <p className="so-vuoto-testo">Scegli dove pubblicare per vedere l’anteprima.</p> : null}
      </section>

      <section className="so-card so-coda">
        <div className="so-card-head">
          <div>
            <div className="so-titolo">
              <CalendarClock className="size-4" aria-hidden /> Piano editoriale
            </div>
            <div className="so-sottotitolo">Post programmati e pubblicati dal gestionale</div>
          </div>
        </div>
        {!lista ? (
          <div className="so-caricamento-centro">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : (
          <>
            {programmate.length ? (
              <ol className="so-timeline">
                {programmate.map((p) => (
                  <RigaPubblicazione key={p.id} p={p} onAnnulla={() => void annulla(p)} />
                ))}
              </ol>
            ) : (
              <p className="so-vuoto-testo">Nessun post in programma. Un buon ritmo è 3–4 post a settimana.</p>
            )}
            {storico.length ? (
              <>
                <div className="so-etichetta so-coda-sep">Storico</div>
                <ol className="so-timeline">
                  {storico.slice(0, 30).map((p) => (
                    <RigaPubblicazione key={p.id} p={p} />
                  ))}
                </ol>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}

function MiniaturaPubblicazione({ p }: { p: SocialPubblicazione }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!p.conImmagine) return
    let url: string | null = null
    let annullato = false
    void socialService.immaginePubblicazione(p.id).then((u) => {
      if (annullato) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      url = u
      setSrc(u)
    })
    return () => {
      annullato = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [p.id, p.conImmagine])
  return <span className="so-timeline-img">{src ? <img src={src} alt="" /> : null}</span>
}

function RigaPubblicazione({ p, onAnnulla }: { p: SocialPubblicazione; onAnnulla?: () => void }) {
  const s = STATI[p.stato]
  const quando = p.stato === 'PROGRAMMATA' ? p.programmataAlle : (p.pubblicataIl ?? p.creatoIl)
  return (
    <li className="so-timeline-voce" data-stato={p.stato}>
      <MiniaturaPubblicazione p={p} />
      <div className="min-w-0 flex-1">
        <div className="so-timeline-top">
          <span className="so-tag" data-tono={s.tono}>
            {p.stato === 'PROGRAMMATA' ? <Clock className="size-3" aria-hidden /> : p.stato === 'ERRORE' ? <XCircle className="size-3" aria-hidden /> : p.stato === 'IN_CORSO' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            {s.label}
          </span>
          {p.piattaforme.map((x) => (
            <IconaPiattaforma key={x} piattaforma={x} />
          ))}
          <time dateTime={quando ?? undefined}>{p.stato === 'PROGRAMMATA' ? dataOra(quando) : tempoFa(quando)}</time>
        </div>
        <p className="so-timeline-testo">{p.testo || <em>Solo immagine</em>}</p>
        {p.errore ? <p className="so-timeline-errore">{p.errore}</p> : null}
        <div className="so-timeline-piede">
          {p.creatoDaNome ? <span>di {p.creatoDaNome}</span> : null}
          {p.linkFacebook ? (
            <a href={p.linkFacebook} target="_blank" rel="noreferrer">
              Facebook <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
          {p.linkInstagram ? (
            <a href={p.linkInstagram} target="_blank" rel="noreferrer">
              Instagram <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
      {onAnnulla && p.stato === 'PROGRAMMATA' ? (
        <button type="button" className="so-icon-btn" onClick={onAnnulla} aria-label="Annulla pubblicazione" title="Annulla">
          <Ban className="size-4" />
        </button>
      ) : null}
    </li>
  )
}

function AnteprimaFacebook({ account, testo, immagine, link }: { account: SocialAccount; testo: string; immagine: string | null; link: string }) {
  let dominio = ''
  try {
    dominio = link ? new URL(link).hostname.replace(/^www\./, '') : ''
  } catch {
    dominio = ''
  }
  const lungo = testo.length > 280
  return (
    <article className="so-mock so-mock-fb">
      <header>
        <span className="so-mock-avatar">{account.immagine ? <img src={account.immagine} alt="" referrerPolicy="no-referrer" /> : null}</span>
        <div>
          <strong>{account.nome}</strong>
          <span>
            Adesso · <Globe2 className="inline size-3" aria-hidden />
          </span>
        </div>
        <MoreHorizontal className="size-5" aria-hidden />
      </header>
      {testo ? (
        <p className="so-mock-testo">
          {lungo ? `${testo.slice(0, 280)}… ` : testo}
          {lungo ? <span className="so-mock-altro">Altro…</span> : null}
        </p>
      ) : null}
      {immagine ? <img className="so-mock-img" src={immagine} alt="" /> : null}
      {!immagine && dominio ? (
        <div className="so-mock-link">
          <span>{dominio.toUpperCase()}</span>
          <strong>{link}</strong>
        </div>
      ) : null}
      <footer>
        <span>
          <ThumbsUp className="size-4" aria-hidden /> Mi piace
        </span>
        <span>
          <MessageCircle className="size-4" aria-hidden /> Commenta
        </span>
        <span>
          <Share2 className="size-4" aria-hidden /> Condividi
        </span>
      </footer>
    </article>
  )
}

function AnteprimaInstagram({ account, testo, immagine }: { account: SocialAccount; testo: string; immagine: string | null }) {
  const nome = account.instagramUsername ?? account.nome
  const corto = testo.length > 125
  return (
    <article className="so-mock so-mock-ig">
      <header>
        <span className="so-mock-avatar so-mock-avatar--ig">{account.instagramImmagine ? <img src={account.instagramImmagine} alt="" referrerPolicy="no-referrer" /> : null}</span>
        <strong>{nome}</strong>
        <MoreHorizontal className="ml-auto size-5" aria-hidden />
      </header>
      <div className="so-mock-ig-media">{immagine ? <img src={immagine} alt="" /> : <span>L’immagine è obbligatoria su Instagram</span>}</div>
      <footer>
        <div className="so-mock-ig-icone">
          <Heart className="size-6" aria-hidden />
          <MessageCircle className="size-6" aria-hidden />
          <Send className="size-6" aria-hidden />
          <Bookmark className="ml-auto size-6" aria-hidden />
        </div>
        {testo ? (
          <p className="so-mock-testo">
            <strong>{nome}</strong> {corto ? `${testo.slice(0, 125)}… ` : testo}
            {corto ? <span className="so-mock-altro">altro</span> : null}
          </p>
        ) : null}
      </footer>
    </article>
  )
}

function AiDidascalia({ onScelta, piattaforme }: { onScelta: (facebook: string, instagram: string) => void; piattaforme: SocialPiattaforma[] }) {
  const [aperto, setAperto] = useState(false)
  const [idea, setIdea] = useState('')
  const [tono, setTono] = useState<SocialTono>('CORDIALE')
  const [hashtag, setHashtag] = useState(true)
  const [emoji, setEmoji] = useState(true)
  const [carica, setCarica] = useState(false)

  const genera = async () => {
    if (!idea.trim()) return
    setCarica(true)
    try {
      const r = await socialService.didascaliaAi({ idea: idea.trim(), piattaforme: piattaforme.length ? piattaforme : ['FACEBOOK', 'INSTAGRAM'], tono, hashtag, emoji })
      const tag = r.hashtag?.length ? `\n\n${r.hashtag.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}` : ''
      const ig = r.instagram && !/#\w/.test(r.instagram) ? `${r.instagram}${tag}` : r.instagram
      onScelta(r.facebook || r.instagram, ig || r.facebook)
      setAperto(false)
      toast.success('Bozza pronta: rileggila prima di pubblicare')
    } catch (err) {
      toast.error(messaggioErroreSocial(err, 'L’AI non ha risposto'))
    } finally {
      setCarica(false)
    }
  }

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <button type="button" className="so-composer-btn so-composer-btn--ai">
          <Sparkles className="size-4" aria-hidden /> Scrivi con l’AI
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="so-popover w-96" data-vl="" data-vl-page="social">
        <div className="so-form">
          <label>
            <span>Di cosa parla il post?</span>
            <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={4} placeholder="es. 3 esercizi da fare alla scrivania per il mal di schiena, invito a prenotare una prima visita" autoFocus />
          </label>
          <label>
            <span>Tono</span>
            <select value={tono} onChange={(e) => setTono(e.target.value as SocialTono)}>
              <option value="CORDIALE">Cordiale</option>
              <option value="PROFESSIONALE">Professionale</option>
              <option value="EMPATICO">Empatico</option>
              <option value="BREVE">Breve e diretto</option>
            </select>
          </label>
          <div className="so-form-riga">
            <label className="so-check">
              <input type="checkbox" checked={hashtag} onChange={(e) => setHashtag(e.target.checked)} /> Hashtag
            </label>
            <label className="so-check">
              <input type="checkbox" checked={emoji} onChange={(e) => setEmoji(e.target.checked)} /> Emoji
            </label>
          </div>
          <button type="button" className="so-btn so-btn--pieno" onClick={() => void genera()} disabled={carica || !idea.trim()}>
            {carica ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {carica ? 'Scrivo…' : 'Genera testo'}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
