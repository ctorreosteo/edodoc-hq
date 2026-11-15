import { useEffect, useState } from 'react'
import { Building2, Check, FolderOpen, Loader2, Pause, Pencil, Play, Plus, Power, Save, Target, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  mailingService,
  messaggioErroreMailing,
  type MailingCategoria,
  type MailingImpostazioni,
  type MailingStato,
} from '@/services/mailing-service'
import { ConfermaMailing } from './mailing-dialog'
import { MailingMittenti } from './mailing-mittenti'
import { Interruttore, Scheletro } from './mailing-ui'
import { formatNumero } from './mailing-utils'

export function MailingImpostazioniTab({ onStatoCambiato }: { stato: MailingStato; onStatoCambiato: () => void }) {
  const [imp, setImp] = useState<MailingImpostazioni | null>(null)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    mailingService
      .impostazioni()
      .then(setImp)
      .catch((err) => setErrore(messaggioErroreMailing(err, 'Impostazioni non disponibili')))
  }, [])

  return (
    <div className="ml-impostazioni">
      <div className="ml-impostazioni-colonna">
        {errore ? (
          <div className="ml-avviso" data-tono="errore" role="alert">
            {errore}
          </div>
        ) : null}
        {imp ? (
          <InterruttoreInvii imp={imp} onSalvate={(i) => { setImp(i); onStatoCambiato() }} />
        ) : !errore ? (
          <div className="ml-card">
            <Scheletro altezza={70} />
          </div>
        ) : null}
        <MailingMittenti onCambiati={onStatoCambiato} />
      </div>
      <div className="ml-impostazioni-colonna">
        {imp ? (
          <>
            <DatiLegali imp={imp} onSalvate={setImp} />
            <Categorie imp={imp} onCambiate={(categorie) => setImp({ ...imp, categorie })} />
          </>
        ) : !errore ? (
          <div className="ml-card">
            <Scheletro altezza={220} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ───────────────────────── Interruttore generale ─────────────────────────

function InterruttoreInvii({ imp, onSalvate }: { imp: MailingImpostazioni; onSalvate: (i: MailingImpostazioni) => void }) {
  const [conferma, setConferma] = useState(false)
  const accendo = !imp.invioAbilitato
  const applica = async () => {
    try {
      const i = await mailingService.salvaImpostazioni({ ...imp, invioAbilitato: accendo })
      onSalvate(i)
      toast.success(accendo ? 'Invii attivi: le email in coda stanno partendo' : 'Invii in pausa: nessuna email parte finché non li riattivi')
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Impostazione non salvata'))
      return false
    }
  }
  return (
    <section className="ml-card ml-interruttore" data-acceso={imp.invioAbilitato ? '' : undefined}>
      <span className="ml-interruttore-icona" aria-hidden>
        {imp.invioAbilitato ? <Play className="size-5" /> : <Pause className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="ml-card-titolo">{imp.invioAbilitato ? 'Gli invii sono attivi' : 'Gli invii sono in pausa'}</div>
        <div className="ml-card-sottotitolo">
          {imp.invioAbilitato
            ? 'Campagne e automazioni partono regolarmente, nel rispetto delle quote di ogni mittente.'
            : 'Puoi preparare tutto: le email restano in coda e partono quando riattivi gli invii.'}
        </div>
      </div>
      <Interruttore attivo={imp.invioAbilitato} onChange={() => setConferma(true)} etichetta="Invii attivi" tono="ok" />
      <ConfermaMailing
        open={conferma}
        onOpenChange={setConferma}
        icona={<Power className="size-5" aria-hidden />}
        titolo={accendo ? 'Attivare gli invii?' : 'Mettere in pausa tutti gli invii?'}
        testo={
          accendo
            ? 'Da questo momento partono le campagne programmate, le automazioni attive e le email già in coda. Controlla di aver verificato almeno un mittente.'
            : 'Si fermano subito campagne e automazioni. Niente va perso: le email restano in coda e ripartono quando riattivi.'
        }
        conferma={accendo ? 'Attiva gli invii' : 'Metti in pausa'}
        pericolo={!accendo}
        onConferma={applica}
      />
    </section>
  )
}

// ───────────────────────── Indirizzo e attribuzione ─────────────────────────

function DatiLegali({ imp, onSalvate }: { imp: MailingImpostazioni; onSalvate: (i: MailingImpostazioni) => void }) {
  const [indirizzo, setIndirizzo] = useState(imp.indirizzoPostale)
  const [finestra, setFinestra] = useState(imp.finestraAttribuzioneGiorni)
  const [salvando, setSalvando] = useState(false)
  const modificato = indirizzo !== imp.indirizzoPostale || finestra !== imp.finestraAttribuzioneGiorni
  const salva = async () => {
    setSalvando(true)
    try {
      const i = await mailingService.salvaImpostazioni({ ...imp, indirizzoPostale: indirizzo.trim(), finestraAttribuzioneGiorni: finestra })
      onSalvate(i)
      toast.success('Impostazioni salvate')
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Impostazioni non salvate'))
    } finally {
      setSalvando(false)
    }
  }
  return (
    <section className="ml-card">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <Building2 className="size-4" aria-hidden /> Piè di pagina e risultati
          </div>
          <div className="ml-card-sottotitolo">Dati che compaiono in ogni email e regola con cui contiamo visite e fatturato.</div>
        </div>
      </div>
      <div className="ml-form">
        <div className="ml-campo">
          <label htmlFor="ml-indirizzo">Indirizzo postale</label>
          <textarea id="ml-indirizzo" className="ml-textarea" rows={2} value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} placeholder="Dr. Edoardo Bo · Via …, 00100 Città" />
          <span className="ml-campo-aiuto">Obbligatorio per legge nelle email promozionali: compare nel piè di pagina insieme al link per disiscriversi.</span>
        </div>
        <div className="ml-campo">
          <label htmlFor="ml-finestra">
            <Target className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
            Finestra di attribuzione
          </label>
          <div className="ml-input-unita">
            <input id="ml-finestra" className="ml-input" type="number" min={1} max={90} value={finestra} onChange={(e) => setFinestra(Math.max(1, Math.min(90, Number(e.target.value) || 1)))} />
            <span>giorni</span>
          </div>
          <span className="ml-campo-aiuto">
            Se una persona clicca un’email e prenota o acquista entro {formatNumero(finestra)} giorni, il risultato viene attribuito a quell’email.
          </span>
        </div>
        <div className="ml-azioni-riga ml-azioni-riga--fine">
          <button type="button" className="ml-btn ml-btn--pieno ml-btn--sm" onClick={() => void salva()} disabled={!modificato || salvando || !indirizzo.trim()}>
            {salvando ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
            {modificato ? 'Salva' : 'Salvato'}
          </button>
        </div>
      </div>
    </section>
  )
}

// ───────────────────────── Categorie ─────────────────────────

function Categorie({ imp, onCambiate }: { imp: MailingImpostazioni; onCambiate: (c: MailingCategoria[]) => void }) {
  const [modifica, setModifica] = useState<{ id: number | null; nome: string; descrizione: string } | null>(null)
  const [inCorso, setInCorso] = useState<number | 'form' | null>(null)
  const categorie = [...imp.categorie].sort((a, b) => a.ordine - b.ordine)

  const salva = async () => {
    if (!modifica || !modifica.nome.trim()) return
    setInCorso('form')
    try {
      const esistente = categorie.find((c) => c.id === modifica.id)
      const input = { nome: modifica.nome.trim(), descrizione: modifica.descrizione.trim() || null, ordine: esistente?.ordine ?? categorie.length, attiva: esistente?.attiva ?? true }
      const c = modifica.id ? await mailingService.aggiornaCategoria(modifica.id, input) : await mailingService.creaCategoria(input)
      onCambiate(modifica.id ? categorie.map((x) => (x.id === c.id ? c : x)) : [...categorie, c])
      setModifica(null)
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Categoria non salvata'))
    } finally {
      setInCorso(null)
    }
  }

  const alterna = async (c: MailingCategoria) => {
    setInCorso(c.id)
    try {
      const n = await mailingService.aggiornaCategoria(c.id, { nome: c.nome, descrizione: c.descrizione, ordine: c.ordine, attiva: !c.attiva })
      onCambiate(categorie.map((x) => (x.id === n.id ? n : x)))
    } catch (err) {
      toast.error(messaggioErroreMailing(err, 'Categoria non aggiornata'))
    } finally {
      setInCorso(null)
    }
  }

  const form = modifica ? (
    <form
      className="ml-categoria-form"
      onSubmit={(e) => {
        e.preventDefault()
        void salva()
      }}
    >
      <label className="sr-only" htmlFor="ml-cat-nome">Nome</label>
      <input id="ml-cat-nome" className="ml-input" value={modifica.nome} onChange={(e) => setModifica({ ...modifica, nome: e.target.value })} placeholder="Es. Newsletter mensile" autoFocus maxLength={80} />
      <label className="sr-only" htmlFor="ml-cat-descr">Descrizione</label>
      <input id="ml-cat-descr" className="ml-input" value={modifica.descrizione} onChange={(e) => setModifica({ ...modifica, descrizione: e.target.value })} placeholder="Come la vede chi riceve, nel centro preferenze" maxLength={200} />
      <div className="ml-azioni-riga ml-azioni-riga--fine">
        <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost" onClick={() => setModifica(null)}>
          <X className="size-3.5" aria-hidden /> Annulla
        </button>
        <button type="submit" className="ml-btn ml-btn--sm ml-btn--pieno" disabled={!modifica.nome.trim() || inCorso === 'form'}>
          {inCorso === 'form' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />} Salva
        </button>
      </div>
    </form>
  ) : null

  return (
    <section className="ml-card">
      <div className="ml-card-testa">
        <div>
          <div className="ml-card-titolo">
            <FolderOpen className="size-4" aria-hidden /> Categorie di email
          </div>
          <div className="ml-card-sottotitolo">
            Chi riceve può scegliere quali tipi di email vuole dal centro preferenze, invece di disiscriversi da tutto.
          </div>
        </div>
        {!modifica ? (
          <button type="button" className="ml-btn ml-btn--sm" onClick={() => setModifica({ id: null, nome: '', descrizione: '' })}>
            <Plus className="size-3.5" aria-hidden /> Nuova
          </button>
        ) : null}
      </div>
      {modifica?.id == null ? form : null}
      {categorie.length === 0 && !modifica ? (
        <p className="ml-vuoto-riga">Nessuna categoria: tutte le email sono «generali».</p>
      ) : (
        <ul className="ml-categorie-lista">
          {categorie.map((c) =>
            modifica?.id === c.id ? (
              <li key={c.id} className="ml-categoria-in-modifica">
                {form}
              </li>
            ) : (
              <li key={c.id} data-spenta={c.attiva ? undefined : ''}>
                <span className="min-w-0 flex-1">
                  <span className="ml-riga-titolo">{c.nome}</span>
                  <span className="ml-riga-sotto">
                    {c.descrizione ?? 'Senza descrizione'}
                    {c.esclusi ? ` · ${formatNumero(c.esclusi)} persone non la vogliono` : ''}
                  </span>
                </span>
                <button type="button" className="ml-btn ml-btn--sm ml-btn--ghost ml-btn--icona" onClick={() => setModifica({ id: c.id, nome: c.nome, descrizione: c.descrizione ?? '' })} aria-label={`Modifica ${c.nome}`}>
                  <Pencil className="size-3.5" aria-hidden />
                </button>
                {inCorso === c.id ? <Loader2 className="size-4 animate-spin ml-muto" aria-hidden /> : null}
                <Interruttore attivo={c.attiva} onChange={() => void alterna(c)} etichetta={`${c.nome} ${c.attiva ? 'attiva' : 'spenta'}`} disabilitato={inCorso != null} />
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}
