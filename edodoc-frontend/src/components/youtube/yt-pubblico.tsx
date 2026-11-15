import { Compass, Globe2, Link2, MonitorSmartphone, MousePointerClick, Search, Share2, UserCheck, Users } from 'lucide-react'
import type { YoutubePubblico } from '@/services/youtube-service'
import { ListaBarre, Pannello, Vuoto } from './yt-shared'
import { fmt } from '@/lib/youtube'

function Demografia({ dati }: { dati: YoutubePubblico['demografia'] }) {
  if (!dati.length) {
    return <Vuoto>YouTube mostra età e genere solo sopra una certa soglia di visualizzazioni.</Vuoto>
  }
  const max = Math.max(...dati.map((d) => Math.max(d.maschi, d.femmine)), 1)
  const maschi = dati.reduce((s, d) => s + d.maschi, 0)
  const femmine = dati.reduce((s, d) => s + d.femmine, 0)
  return (
    <div>
      <div className="yt-gender">
        <div style={{ flexGrow: femmine || 1 }} className="yt-gender-f">
          <p>Donne {fmt.pct(femmine, 0)}</p>
        </div>
        <div style={{ flexGrow: maschi || 1 }} className="yt-gender-m">
          <p>Uomini {fmt.pct(maschi, 0)}</p>
        </div>
      </div>
      <div className="yt-pyramid" role="table" aria-label="Età e genere">
        {dati.map((d) => (
          <div key={d.fascia} className="yt-pyr-row" role="row" title={`${d.fascia}: donne ${fmt.pct(d.femmine)} · uomini ${fmt.pct(d.maschi)}`}>
            <div className="yt-pyr-side yt-pyr-side--f" role="cell">
              <p>{fmt.pct(d.femmine, 1)}</p>
              <div style={{ width: `${(d.femmine / max) * 100}%` }} />
            </div>
            <p className="yt-pyr-age" role="rowheader">{d.fascia}</p>
            <div className="yt-pyr-side yt-pyr-side--m" role="cell">
              <div style={{ width: `${(d.maschi / max) * 100}%` }} />
              <p>{fmt.pct(d.maschi, 1)}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="yt-legend">
        <p><i style={{ background: 'var(--yt-c4)' }} />Donne</p>
        <p><i style={{ background: 'var(--yt-c2)' }} />Uomini</p>
      </div>
    </div>
  )
}

export function PubblicoTab({ dati }: { dati: YoutubePubblico }) {
  const iscritti = dati.iscrizione.find((v) => v.chiave === 'SUBSCRIBED')
  const non = dati.iscrizione.find((v) => v.chiave === 'UNSUBSCRIBED')
  const totIscr = (iscritti?.valore ?? 0) + (non?.valore ?? 0) || 1
  return (
    <div className="yt-stack">
      <div className="yt-grid-2">
        <Pannello titolo="Chi guarda" sottotitolo="Quota di spettatori per età e genere (utenti con accesso)" icona={<Users />}>
          <Demografia dati={dati.demografia} />
        </Pannello>
        <Pannello titolo="Iscritti o nuovi?" sottotitolo="Quanta parte delle visualizzazioni arriva da chi è già iscritto" icona={<UserCheck />}>
          {dati.iscrizione.length ? (
            <div className="yt-split">
              <div className="yt-split-bar">
                <div style={{ width: `${((non?.valore ?? 0) / totIscr) * 100}%` }} className="yt-split-a" />
                <div style={{ width: `${((iscritti?.valore ?? 0) / totIscr) * 100}%` }} className="yt-split-b" />
              </div>
              <div className="yt-split-legend">
                <div>
                  <i className="yt-split-a" aria-hidden />
                  <b>{fmt.pct(((non?.valore ?? 0) / totIscr) * 100, 0)}</b>
                  <p>Non iscritti · {fmt.int(non?.valore)} visual. · durata media {fmt.durata(non?.secondario)}</p>
                </div>
                <div>
                  <i className="yt-split-b" aria-hidden />
                  <b>{fmt.pct(((iscritti?.valore ?? 0) / totIscr) * 100, 0)}</b>
                  <p>Iscritti · {fmt.int(iscritti?.valore)} visual. · durata media {fmt.durata(iscritti?.secondario)}</p>
                </div>
              </div>
              <p className="yt-hint">
                {(non?.valore ?? 0) / totIscr > 0.7
                  ? 'Il canale vive di scoperta: la maggior parte arriva da fuori. Chiedi l’iscrizione nei primi 30 secondi, quando chi guarda ha appena ricevuto valore.'
                  : 'Il pubblico fedele pesa molto: punta su serie e appuntamenti fissi, e cura le notifiche.'}
              </p>
            </div>
          ) : (
            <Vuoto>Nessun dato nel periodo.</Vuoto>
          )}
        </Pannello>
      </div>

      <div className="yt-grid-2">
        <Pannello titolo="Come ti trovano" sottotitolo="Fonti di traffico, con le ore di visione" icona={<Compass />}>
          <ListaBarre voci={dati.fonti} colore="var(--yt-c1)" secondario={(v) => (v.secondario != null ? `${fmt.ore(v.secondario)} di visione` : null)} />
        </Pannello>
        <Pannello titolo="Cosa cercano su YouTube" sottotitolo="Le ricerche che portano ai tuoi video: sono i titoli dei prossimi" icona={<Search />}>
          {dati.ricerche.length ? (
            <div className="yt-cloud">
              {dati.ricerche.map((r, i) => (
                <em key={r.chiave} style={{ fontSize: `${Math.max(0.78, 1.35 - i * 0.025)}rem` }} title={`${fmt.int(r.valore)} visualizzazioni`}>
                  {r.etichetta}
                  <small>{fmt.compact(r.valore)}</small>
                </em>
              ))}
            </div>
          ) : (
            <Vuoto>Nessuna ricerca nel periodo.</Vuoto>
          )}
        </Pannello>
      </div>

      <div className="yt-grid-3">
        <Pannello titolo="Paesi" icona={<Globe2 />}>
          <ListaBarre voci={dati.paesi} max={8} colore="var(--yt-c3)" />
        </Pannello>
        <Pannello titolo="Dispositivi" icona={<MonitorSmartphone />}>
          <ListaBarre voci={dati.dispositivi} colore="var(--yt-c2)" />
          {dati.sistemiOperativi.length ? (
            <p className="yt-hint">Sistemi: {dati.sistemiOperativi.slice(0, 4).map((s) => s.etichetta).join(', ')}.</p>
          ) : null}
        </Pannello>
        <Pannello titolo="Dove guardano" icona={<MousePointerClick />}>
          <ListaBarre voci={dati.luoghiRiproduzione} colore="var(--yt-c4)" />
        </Pannello>
        <Pannello titolo="Siti che ti mandano traffico" icona={<Link2 />}>
          <ListaBarre voci={dati.sitiEsterni} max={8} colore="var(--yt-c5)" />
        </Pannello>
        <Pannello titolo="Dove condividono" icona={<Share2 />}>
          <ListaBarre voci={dati.condivisioni} max={8} colore="var(--yt-c1)" />
        </Pannello>
      </div>
    </div>
  )
}
