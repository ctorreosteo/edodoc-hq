import { useState, type ReactNode } from 'react'
import { Bookmark, ChevronLeft, ChevronRight, Globe, Heart, MessageCircle, MoreHorizontal, Music2, Play, Repeat2, Send, Share, ThumbsUp } from 'lucide-react'
import { PULSANTI_GOOGLE } from '@/lib/planner-canali'
import type { PlannerCanale, PlannerFormato, PlannerMedia, PlannerOpzioni } from '@/services/planner-service'
import { urlMedia } from '@/services/planner-service'
import { AvatarCanale, IconaCanale } from './planner-ui'
import { durata } from '@/lib/planner-formato'

/*
  Anteprime del Planner: come apparirà il post su ciascun canale, mentre lo si scrive. Sono impaginazioni
  indicative (ogni app cambia spesso le sue), fatte per controllare tagli del testo, proporzioni e ordine dei media.
*/

export type DatiAnteprima = {
  canale: PlannerCanale
  formato: PlannerFormato
  testo: string
  titolo: string
  media: PlannerMedia[]
  nome: string
  immagine: string | null
  link: string
  primoCommento: string
  opzioni: PlannerOpzioni
}

/** Testo con hashtag, menzioni e link evidenziati; tagliato con «altro» come fanno le app. */
export function TestoSocial({ testo, taglio, classe = '' }: { testo: string; taglio?: number; classe?: string }) {
  const [tutto, setTutto] = useState(false)
  const lungo = taglio != null && [...testo].length > taglio
  const visibile = lungo && !tutto ? [...testo].slice(0, taglio).join('').trimEnd() : testo
  const parti = visibile.split(/((?:^|(?<=\s))[#@][\p{L}\p{N}_.]+|https?:\/\/\S+)/u)
  return (
    <span className={`pl-testo-social ${classe}`}>
      {parti.map((p, i) =>
        /^[#@]/.test(p) || /^https?:\/\//.test(p) ? (
          <span key={i} className="pl-tag">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
      {lungo && !tutto ? (
        <>
          {'… '}
          <button type="button" className="pl-altro" onClick={() => setTutto(true)}>
            altro
          </button>
        </>
      ) : null}
    </span>
  )
}

function Supporto({ m, classe = '', copri = true }: { m: PlannerMedia | undefined; classe?: string; copri?: boolean }) {
  if (!m) {
    return <div className={`pl-ap-vuoto ${classe}`}>Aggiungi un'immagine o un video</div>
  }
  if (m.tipo === 'VIDEO') {
    return (
      <div className={`pl-ap-supporto ${classe}`} data-copri={copri ? '' : undefined}>
        <video src={urlMedia(m.url)} poster={urlMedia(m.anteprimaUrl)} muted playsInline loop preload="metadata" onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />
        <span className="pl-ap-play" aria-hidden>
          <Play className="size-4" />
        </span>
        {m.durataSecondi ? <span className="pl-ap-durata">{durata(m.durataSecondi)}</span> : null}
      </div>
    )
  }
  return (
    <div className={`pl-ap-supporto ${classe}`} data-copri={copri ? '' : undefined}>
      <img src={urlMedia(m.url)} alt="" loading="lazy" />
    </div>
  )
}

/** Più media in fila con frecce e pallini (caroselli). */
function Carosello({ media, classe }: { media: PlannerMedia[]; classe: string }) {
  const [i, setI] = useState(0)
  const n = media.length
  const idx = Math.min(i, Math.max(0, n - 1))
  return (
    <div className="pl-ap-carosello">
      <Supporto m={media[idx]} classe={classe} />
      {n > 1 ? (
        <>
          {idx > 0 ? (
            <button type="button" className="pl-ap-freccia" data-lato="sx" onClick={() => setI(idx - 1)} aria-label="Precedente">
              <ChevronLeft className="size-4" />
            </button>
          ) : null}
          {idx < n - 1 ? (
            <button type="button" className="pl-ap-freccia" data-lato="dx" onClick={() => setI(idx + 1)} aria-label="Successivo">
              <ChevronRight className="size-4" />
            </button>
          ) : null}
          <span className="pl-ap-contatore">
            {idx + 1}/{n}
          </span>
          <div className="pl-ap-pallini" aria-hidden>
            {media.map((m, k) => (
              <span key={m.id} data-on={k === idx ? '' : undefined} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Testata({ d, sotto, destra }: { d: DatiAnteprima; sotto?: ReactNode; destra?: ReactNode }) {
  return (
    <div className="pl-ap-testata">
      <AvatarCanale canale={d.canale} immagine={d.immagine} nome={d.nome} dimensione="sm" />
      <div className="pl-ap-testata-testi">
        <div className="pl-ap-nome">{d.nome}</div>
        {sotto ? <div className="pl-ap-sotto">{sotto}</div> : null}
      </div>
      {destra ?? <MoreHorizontal className="size-4 pl-ap-muto" aria-hidden />}
    </div>
  )
}

function Verticale({ d, children, barra }: { d: DatiAnteprima; children?: ReactNode; barra?: ReactNode }) {
  return (
    <div className="pl-ap-telefono" data-c={d.canale}>
      <Supporto m={d.media[0]} classe="pl-ap-916" />
      <div className="pl-ap-sopra">
        {d.formato === 'STORIA' ? (
          <>
            <div className="pl-ap-storia-barre" aria-hidden>
              {Math.max(1, d.media.length) > 0 ? <span /> : null}
            </div>
            <div className="pl-ap-storia-testa">
              <AvatarCanale canale={d.canale} immagine={d.immagine} nome={d.nome} dimensione="sm" />
              <span className="pl-ap-nome-chiaro">{d.nome}</span>
              <span className="pl-ap-muto-chiaro">ora</span>
            </div>
          </>
        ) : null}
        {children}
      </div>
      {barra}
    </div>
  )
}

export function Anteprima({ d }: { d: DatiAnteprima }) {
  const testo = d.testo
  switch (d.canale) {
    case 'INSTAGRAM': {
      if (d.formato === 'STORIA') return <Verticale d={d} />
      if (d.formato === 'REEL') {
        return (
          <Verticale
            d={d}
            barra={
              <div className="pl-ap-rail" aria-hidden>
                <Heart className="size-5" />
                <MessageCircle className="size-5" />
                <Send className="size-5" />
              </div>
            }
          >
            <div className="pl-ap-reel-basso">
              <div className="pl-ap-reel-autore">
                <AvatarCanale canale={d.canale} immagine={d.immagine} nome={d.nome} dimensione="sm" />
                <span className="pl-ap-nome-chiaro">{d.nome}</span>
              </div>
              <TestoSocial testo={testo} taglio={60} classe="pl-ap-chiaro" />
              <div className="pl-ap-audio">
                <Music2 className="size-3" /> Audio originale
              </div>
            </div>
          </Verticale>
        )
      }
      return (
        <div className="pl-ap-card" data-c="INSTAGRAM">
          <Testata d={d} />
          {d.formato === 'CAROSELLO' ? <Carosello media={d.media} classe="pl-ap-45" /> : <Supporto m={d.media[0]} classe="pl-ap-45" />}
          <div className="pl-ap-azioni-ig" aria-hidden>
            <Heart className="size-5" />
            <MessageCircle className="size-5" />
            <Send className="size-5" />
            <Bookmark className="size-5 ml-auto" />
          </div>
          <div className="pl-ap-didascalia">
            <b>{d.nome.replace(/^@/, '')}</b> <TestoSocial testo={testo} taglio={125} />
          </div>
          {d.primoCommento ? (
            <div className="pl-ap-commento">
              <b>{d.nome.replace(/^@/, '')}</b> <TestoSocial testo={d.primoCommento} taglio={80} />
            </div>
          ) : null}
        </div>
      )
    }
    case 'FACEBOOK': {
      if (d.formato === 'STORIA') return <Verticale d={d} />
      if (d.formato === 'REEL') {
        return (
          <Verticale d={d} barra={<div className="pl-ap-rail" aria-hidden><ThumbsUp className="size-5" /><MessageCircle className="size-5" /><Share className="size-5" /></div>}>
            <div className="pl-ap-reel-basso">
              <div className="pl-ap-reel-autore">
                <AvatarCanale canale={d.canale} immagine={d.immagine} nome={d.nome} dimensione="sm" />
                <span className="pl-ap-nome-chiaro">{d.nome}</span>
              </div>
              <TestoSocial testo={testo} taglio={70} classe="pl-ap-chiaro" />
            </div>
          </Verticale>
        )
      }
      return (
        <div className="pl-ap-card" data-c="FACEBOOK">
          <Testata d={d} sotto={<>Adesso · <Globe className="inline size-3" /></>} />
          {testo ? (
            <div className="pl-ap-corpo">
              <TestoSocial testo={testo} taglio={260} />
            </div>
          ) : null}
          {d.media.length > 1 ? (
            <div className="pl-ap-griglia" data-n={Math.min(d.media.length, 4)}>
              {d.media.slice(0, 4).map((m, i) => (
                <div key={m.id} className="pl-ap-griglia-cella">
                  <Supporto m={m} classe="pl-ap-11" />
                  {i === 3 && d.media.length > 4 ? <span className="pl-ap-piu">+{d.media.length - 4}</span> : null}
                </div>
              ))}
            </div>
          ) : d.media.length === 1 ? (
            <Supporto m={d.media[0]} classe="pl-ap-auto" copri={false} />
          ) : d.link ? (
            <div className="pl-ap-link">
              <div className="pl-ap-link-dominio">{dominio(d.link)}</div>
              <div className="pl-ap-link-titolo">{d.link}</div>
            </div>
          ) : null}
          <div className="pl-ap-azioni-fb" aria-hidden>
            <span><ThumbsUp className="size-4" /> Mi piace</span>
            <span><MessageCircle className="size-4" /> Commenta</span>
            <span><Share className="size-4" /> Condividi</span>
          </div>
        </div>
      )
    }
    case 'TIKTOK':
      return (
        <Verticale
          d={d}
          barra={
            <div className="pl-ap-rail" aria-hidden>
              <AvatarCanale canale={d.canale} immagine={d.immagine} nome={d.nome} dimensione="sm" />
              <Heart className="size-6" />
              <MessageCircle className="size-6" />
              <Bookmark className="size-6" />
              <Share className="size-6" />
            </div>
          }
        >
          <div className="pl-ap-reel-basso">
            <span className="pl-ap-nome-chiaro">{d.nome.startsWith('@') ? d.nome : d.nome}</span>
            {d.formato === 'CAROSELLO' && d.titolo ? <b className="pl-ap-chiaro">{d.titolo}</b> : null}
            <TestoSocial testo={testo} taglio={80} classe="pl-ap-chiaro" />
            <div className="pl-ap-audio">
              <Music2 className="size-3" /> suono originale
            </div>
          </div>
          {d.formato === 'CAROSELLO' && d.media.length > 1 ? <span className="pl-ap-contatore">1/{d.media.length}</span> : null}
        </Verticale>
      )
    case 'YOUTUBE': {
      if (d.formato === 'SHORT') {
        return (
          <Verticale d={d} barra={<div className="pl-ap-rail" aria-hidden><ThumbsUp className="size-5" /><MessageCircle className="size-5" /><Share className="size-5" /></div>}>
            <div className="pl-ap-reel-basso">
              <span className="pl-ap-nome-chiaro">{d.nome}</span>
              <b className="pl-ap-chiaro">{d.titolo || 'Titolo dello Short'}</b>
            </div>
          </Verticale>
        )
      }
      return (
        <div className="pl-ap-card pl-ap-yt" data-c="YOUTUBE">
          <Supporto m={d.media[0]} classe="pl-ap-169" />
          <div className="pl-ap-yt-riga">
            <AvatarCanale canale={d.canale} immagine={d.immagine} nome={d.nome} dimensione="sm" />
            <div>
              <div className="pl-ap-yt-titolo">{d.titolo || 'Titolo del video'}</div>
              <div className="pl-ap-sotto">
                {d.nome} · 0 visualizzazioni · adesso
                {d.opzioni.privacy && d.opzioni.privacy !== 'public' ? ` · ${d.opzioni.privacy === 'unlisted' ? 'non in elenco' : 'privato'}` : ''}
              </div>
            </div>
          </div>
          {testo ? (
            <div className="pl-ap-yt-descrizione">
              <TestoSocial testo={testo} taglio={160} />
            </div>
          ) : null}
        </div>
      )
    }
    case 'GOOGLE_BUSINESS': {
      const pulsante = typeof d.opzioni.pulsante === 'string' ? PULSANTI_GOOGLE[d.opzioni.pulsante] : null
      return (
        <div className="pl-ap-card pl-ap-gbp" data-c="GOOGLE_BUSINESS">
          <Testata d={d} sotto="Adesso" destra={<IconaCanale canale="GOOGLE_BUSINESS" className="size-4" />} />
          {d.media[0] && d.media[0].tipo === 'IMMAGINE' ? <Supporto m={d.media[0]} classe="pl-ap-43" /> : null}
          {d.formato !== 'AGGIORNAMENTO' ? (
            <div className="pl-ap-gbp-evento">
              <b>{String(d.opzioni.titoloEvento || (d.formato === 'OFFERTA' ? "Titolo dell'offerta" : "Titolo dell'evento"))}</b>
              <span>
                {String(d.opzioni.inizio || '…').replace('T', ' ')} – {String(d.opzioni.fine || '…').replace('T', ' ')}
              </span>
            </div>
          ) : null}
          <div className="pl-ap-corpo">
            <TestoSocial testo={testo} taglio={240} />
          </div>
          {pulsante ? <div className="pl-ap-gbp-cta">{pulsante}</div> : null}
          {d.formato === 'OFFERTA' && d.opzioni.codice ? <div className="pl-ap-gbp-codice">Codice: {String(d.opzioni.codice)}</div> : null}
        </div>
      )
    }
    case 'LINKEDIN':
      return (
        <div className="pl-ap-card" data-c="LINKEDIN">
          <Testata d={d} sotto={<>Adesso · <Globe className="inline size-3" /></>} />
          <div className="pl-ap-corpo">
            <TestoSocial testo={testo} taglio={210} />
          </div>
          {d.media.length > 1 ? (
            <div className="pl-ap-griglia" data-n={Math.min(d.media.length, 4)}>
              {d.media.slice(0, 4).map((m) => (
                <div key={m.id} className="pl-ap-griglia-cella">
                  <Supporto m={m} classe="pl-ap-11" />
                </div>
              ))}
            </div>
          ) : d.media[0] ? (
            <Supporto m={d.media[0]} classe="pl-ap-auto" copri={false} />
          ) : null}
          <div className="pl-ap-azioni-fb" aria-hidden>
            <span><ThumbsUp className="size-4" /> Consiglia</span>
            <span><MessageCircle className="size-4" /> Commenta</span>
            <span><Repeat2 className="size-4" /> Diffondi</span>
            <span><Send className="size-4" /> Invia</span>
          </div>
        </div>
      )
    case 'X':
    case 'THREADS':
      return (
        <div className="pl-ap-card pl-ap-thread" data-c={d.canale}>
          <AvatarCanale canale={d.canale} immagine={d.immagine} nome={d.nome} dimensione="sm" />
          <div className="pl-ap-thread-corpo">
            <div className="pl-ap-nome">
              {d.nome} <span className="pl-ap-muto">· ora</span>
            </div>
            <TestoSocial testo={testo} />
            {d.media.length > 0 ? (
              <div className="pl-ap-griglia pl-ap-griglia--tonda" data-n={Math.min(d.media.length, 4)}>
                {d.media.slice(0, 4).map((m) => (
                  <div key={m.id} className="pl-ap-griglia-cella">
                    <Supporto m={m} classe={d.media.length === 1 ? 'pl-ap-auto' : 'pl-ap-11'} copri={d.media.length > 1} />
                  </div>
                ))}
              </div>
            ) : null}
            <div className="pl-ap-azioni-x" aria-hidden>
              <MessageCircle className="size-4" />
              <Repeat2 className="size-4" />
              <Heart className="size-4" />
              <Share className="size-4" />
            </div>
          </div>
        </div>
      )
    case 'PINTEREST':
      return (
        <div className="pl-ap-pin" data-c="PINTEREST">
          <Supporto m={d.media[0]} classe="pl-ap-23" />
          <div className="pl-ap-pin-titolo">{d.titolo || 'Titolo del pin'}</div>
          {testo ? (
            <div className="pl-ap-sotto">
              <TestoSocial testo={testo} taglio={90} />
            </div>
          ) : null}
          <div className="pl-ap-pin-autore">
            <AvatarCanale canale={d.canale} immagine={d.immagine} nome={d.nome} dimensione="sm" />
            <span>{d.nome}</span>
          </div>
        </div>
      )
  }
}

function dominio(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, '').toUpperCase()
  } catch {
    return link
  }
}
