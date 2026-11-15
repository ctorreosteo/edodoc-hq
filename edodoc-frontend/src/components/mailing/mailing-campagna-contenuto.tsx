import { useEffect, useMemo, useState } from 'react'
import { FilePlus2, LayoutTemplate, Loader2, RefreshCcw } from 'lucide-react'
import { toast } from '@/lib/toast'
import { mailingService, messaggioErroreMailing, type MailingCampagna, type MailingDocumento, type MailingTemplateRiga } from '@/services/mailing-service'
import { documentoDaHtml, documentoVuoto, nuovoBlocco, normalizzaDocumento, renderEmail, templatePartenza, TEMPLATE_PARTENZA } from '@/lib/mailing-render'
import { MailingEditor } from './mailing-editor'
import { MailingMiniatura } from './mailing-anteprima'
import { ConfermaMailing } from './mailing-dialog'
import { haContenuto } from './mailing-campagna-dati'

/* Passo 3: si parte da un template (pronto o salvato) o da zero, poi l'editor a blocchi. */

function documentoIniziale(): MailingDocumento {
  const d = documentoVuoto()
  d.blocchi = [nuovoBlocco('intestazione'), nuovoBlocco('titolo'), nuovoBlocco('testo'), nuovoBlocco('pulsante'), nuovoBlocco('piedipagina')]
  return d
}

function SceltaTemplate({ onScegli }: { onScegli: (doc: MailingDocumento) => void }) {
  const [salvati, setSalvati] = useState<MailingTemplateRiga[] | null>(null)
  const [anteprime, setAnteprime] = useState<Record<number, string>>({})
  const [apro, setApro] = useState<number | null>(null)
  const pronti = useMemo(() => TEMPLATE_PARTENZA.map((t) => ({ ...t, html: renderEmail(t.documento) })), [])
  useEffect(() => {
    mailingService
      .templates()
      .then((r) => {
        setSalvati(r)
        r.slice(0, 12).forEach((t) =>
          mailingService
            .template(t.id)
            .then((x) => setAnteprime((a) => ({ ...a, [t.id]: x.design ? renderEmail(normalizzaDocumento(x.design)) : x.html })))
            .catch(() => undefined),
        )
      })
      .catch(() => setSalvati([]))
  }, [])
  const usaSalvato = async (id: number) => {
    setApro(id)
    try {
      const t = await mailingService.template(id)
      onScegli(t.design ? normalizzaDocumento(JSON.parse(JSON.stringify(t.design))) : documentoDaHtml(t.html))
    } catch (e) {
      toast.error(messaggioErroreMailing(e, 'Template non disponibile'))
    } finally {
      setApro(null)
    }
  }
  return (
    <div className="ml-cp-scegli">
      <div className="ml-cp-scegli-testa">
        <div className="ml-cp-scegli-titolo">Da dove partiamo?</div>
        <div className="ml-cp-scegli-sotto">Scegli un template e cambia i testi, oppure parti da un foglio bianco. Potrai cambiare tutto dopo.</div>
      </div>
      <div className="ml-tpl-griglia">
        <button type="button" className="ml-tpl ml-cp-bianco" onClick={() => onScegli(documentoIniziale())}>
          <div className="ml-cp-bianco-mini">
            <FilePlus2 />
            <span>Foglio bianco</span>
          </div>
          <div className="ml-tpl-info">
            <div className="ml-tpl-nome">Da zero</div>
            <div className="ml-tpl-desc">Titolo, testo, pulsante e piè di pagina pronti da riempire.</div>
          </div>
        </button>
        {pronti.map((t) => (
          <button key={t.chiave} type="button" className="ml-tpl" onClick={() => onScegli(templatePartenza().find((x) => x.chiave === t.chiave)!.documento)}>
            <div className="ml-tpl-mini">
              <MailingMiniatura html={t.html} titolo={t.nome} altezza={240} />
            </div>
            <div className="ml-tpl-info">
              <div className="ml-tpl-nome">{t.nome}</div>
              <div className="ml-tpl-desc">{t.descrizione}</div>
            </div>
          </button>
        ))}
        {(salvati ?? []).map((t) => (
          <button key={t.id} type="button" className="ml-tpl" onClick={() => void usaSalvato(t.id)} disabled={apro != null}>
            <div className="ml-tpl-mini">
              <MailingMiniatura html={anteprime[t.id] ?? null} titolo={t.nome} altezza={240} />
              {apro === t.id ? (
                <span className="ml-tpl-usa" style={{ opacity: 1 }}>
                  <Loader2 className="ml-ed-gira" /> Apro…
                </span>
              ) : null}
            </div>
            <div className="ml-tpl-info">
              <div className="ml-tpl-nome">{t.nome}</div>
              <div className="ml-tpl-meta">
                <span className="ml-badge ml-badge--neutro">{t.origine === 'SISTEMA' ? 'Di sistema' : 'Salvato'}</span>
                {t.categoria ? <span className="ml-tpl-cat">{t.categoria}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function PassoContenuto({ c, aggiorna, aiDisponibile }: { c: MailingCampagna; aggiorna: (p: Partial<MailingCampagna>) => void; aiDisponibile: boolean }) {
  const [scelta, setScelta] = useState(() => !haContenuto(c) && !c.design?.blocchi.length)
  const [conferma, setConferma] = useState(false)
  // Le campagne senza design ma con HTML diventano un blocco HTML modificabile
  const [documento, setDocumento] = useState<MailingDocumento>(() => (c.design ? normalizzaDocumento(c.design) : c.html ? documentoDaHtml(c.html) : documentoIniziale()))

  if (scelta) {
    return (
      <SceltaTemplate
        onScegli={(d) => {
          setDocumento(d)
          aggiorna({ design: d })
          setScelta(false)
        }}
      />
    )
  }
  return (
    <div className="ml-cp-contenuto">
      <div className="ml-cp-contenuto-barra">
        <span className="ml-ed-aiuto">Clicca un blocco per modificarlo. Annulla con ⌘Z, elimina con Canc.</span>
        <button type="button" className="ml-btn ml-btn--ghost ml-btn--sm" onClick={() => setConferma(true)}>
          <LayoutTemplate /> Cambia template
        </button>
      </div>
      <MailingEditor
        documento={documento}
        aiDisponibile={aiDisponibile}
        contestoAnteprima={{ oggetto: c.oggetto, preheader: c.preheader }}
        contestoProva={{ mittenteId: c.mittenteId, categoriaId: c.categoriaId }}
        onChange={(doc) => aggiorna({ design: doc })}
        onSuggerimentiAi={({ oggetti, preheader }) => {
          const patch: Partial<MailingCampagna> = {}
          if (!c.oggetto?.trim() && oggetti[0] && !c.testAb) patch.oggetto = oggetti[0]
          if (!c.preheader?.trim() && preheader && !c.testAb) patch.preheader = preheader
          if (Object.keys(patch).length) {
            aggiorna(patch)
            toast.info('Ho proposto anche oggetto e anteprima', { description: 'Li trovi nel passo Dettagli.' })
          }
        }}
      />
      <ConfermaMailing
        open={conferma}
        onOpenChange={setConferma}
        titolo="Cambiare template?"
        icona={<RefreshCcw />}
        testo="Il contenuto attuale verrà sostituito da quello del template che sceglierai."
        conferma="Scegli un altro template"
        onConferma={() => setScelta(true)}
      />
    </div>
  )
}
