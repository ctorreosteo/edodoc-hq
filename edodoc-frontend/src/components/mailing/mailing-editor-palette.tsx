import { useDraggable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Columns2, Copy, GripVertical, Trash2 } from 'lucide-react'
import type { MailingBlocco, MailingDocumento, MailingTipoBlocco } from '@/services/mailing-service'
import { ETICHETTE_BLOCCO } from '@/lib/mailing-render'
import { GRUPPI_PALETTE, ICONE_BLOCCO, riassunto } from './mailing-editor-dati'

/* Colonna sinistra dell'editor: blocchi da trascinare (o cliccare) e struttura riordinabile del documento. */


const DESCRIZIONI: Record<MailingTipoBlocco, string> = {
  intestazione: 'Logo o nome del dottore',
  titolo: 'Grande e leggibile',
  testo: 'Paragrafi, elenchi, link',
  immagine: 'Foto o grafica',
  pulsante: 'Invito all\'azione',
  divisore: 'Linea sottile',
  spazio: 'Respiro tra i blocchi',
  colonne: '2 o 3 affiancate',
  social: 'Link ai profili',
  video: 'Copertina YouTube',
  recensione: 'Parole di un paziente',
  html: 'Codice su misura',
  piedipagina: 'Disiscrizione e indirizzo',
}


function VocePalette({ tipo, onAggiungi }: { tipo: MailingTipoBlocco; onAggiungi: (tipo: MailingTipoBlocco) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${tipo}`, data: { origine: 'palette', tipo } })
  const Icona = ICONE_BLOCCO[tipo]
  return (
    <button
      ref={setNodeRef}
      type="button"
      className="ml-ed-voce"
      data-trascina={isDragging ? '' : undefined}
      onClick={() => onAggiungi(tipo)}
      title={`${ETICHETTE_BLOCCO[tipo]}: ${DESCRIZIONI[tipo]}. Clicca per aggiungere o trascina nell'email.`}
      {...attributes}
      {...listeners}
    >
      <span className="ml-ed-voce-icona" aria-hidden>
        <Icona />
      </span>
      <span className="ml-ed-voce-nome">{ETICHETTE_BLOCCO[tipo]}</span>
      <span className="ml-ed-voce-desc">{DESCRIZIONI[tipo]}</span>
    </button>
  )
}

export function FantasmaPalette({ tipo }: { tipo: MailingTipoBlocco }) {
  const Icona = ICONE_BLOCCO[tipo]
  return (
    <div className="ml-ed-fantasma">
      <Icona />
      {ETICHETTE_BLOCCO[tipo]}
    </div>
  )
}

export function PaletteBlocchi({ onAggiungi }: { onAggiungi: (tipo: MailingTipoBlocco) => void }) {
  return (
    <div className="ml-ed-palette">
      {GRUPPI_PALETTE.map((g) => (
        <div key={g.titolo} className="ml-ed-palette-gruppo">
          <div className="ml-ed-palette-titolo">{g.titolo}</div>
          <div className="ml-ed-palette-griglia">
            {g.tipi.map((t) => (
              <VocePalette key={t} tipo={t} onAggiungi={onAggiungi} />
            ))}
          </div>
        </div>
      ))}
      <div className="ml-ed-palette-suggerimento">Trascina un blocco nell'anteprima oppure cliccalo: finisce sotto quello selezionato.</div>
    </div>
  )
}


function RigaStruttura({
  b,
  selezionato,
  onSeleziona,
  onEvidenzia,
  onDuplica,
  onElimina,
  selezione,
}: {
  b: MailingBlocco
  selezionato: boolean
  selezione: string | null
  onSeleziona: (id: string) => void
  onEvidenzia: (id: string | null) => void
  onDuplica: (id: string) => void
  onElimina: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id, data: { origine: 'struttura' } })
  const Icona = ICONE_BLOCCO[b.tipo]
  return (
    <li
      ref={setNodeRef}
      className="ml-ed-strato"
      data-selezionato={selezionato ? '' : undefined}
      data-trascina={isDragging ? '' : undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onMouseEnter={() => onEvidenzia(b.id)}
      onMouseLeave={() => onEvidenzia(null)}
    >
      <div className="ml-ed-strato-riga">
        <button type="button" className="ml-ed-strato-maniglia" aria-label={`Trascina ${ETICHETTE_BLOCCO[b.tipo]}`} {...attributes} {...listeners}>
          <GripVertical />
        </button>
        <button type="button" className="ml-ed-strato-corpo" onClick={() => onSeleziona(b.id)} aria-current={selezionato ? 'true' : undefined}>
          <Icona className="ml-ed-strato-icona" />
          <span className="ml-ed-strato-nome">{ETICHETTE_BLOCCO[b.tipo]}</span>
          <span className="ml-ed-strato-riassunto">{riassunto(b)}</span>
        </button>
        <div className="ml-ed-strato-azioni">
          <button type="button" aria-label="Duplica" title="Duplica" onClick={() => onDuplica(b.id)}>
            <Copy />
          </button>
          <button type="button" aria-label="Elimina" title="Elimina" data-pericolo="" onClick={() => onElimina(b.id)}>
            <Trash2 />
          </button>
        </div>
      </div>
      {b.colonne ? (
        <ul className="ml-ed-strato-figli">
          {b.colonne.map((col, c) =>
            col.map((f) => {
              const IconaF = ICONE_BLOCCO[f.tipo]
              return (
                <li key={f.id} data-selezionato={selezione === f.id ? '' : undefined} onMouseEnter={() => onEvidenzia(f.id)} onMouseLeave={() => onEvidenzia(b.id)}>
                  <button type="button" className="ml-ed-strato-corpo" onClick={() => onSeleziona(f.id)}>
                    <span className="ml-ed-strato-col">{c + 1}</span>
                    <IconaF className="ml-ed-strato-icona" />
                    <span className="ml-ed-strato-nome">{ETICHETTE_BLOCCO[f.tipo]}</span>
                    <span className="ml-ed-strato-riassunto">{riassunto(f)}</span>
                  </button>
                </li>
              )
            }),
          )}
        </ul>
      ) : null}
    </li>
  )
}

export function StrutturaBlocchi({
  documento,
  selezione,
  onSeleziona,
  onEvidenzia,
  onDuplica,
  onElimina,
}: {
  documento: MailingDocumento
  selezione: string | null
  onSeleziona: (id: string) => void
  onEvidenzia: (id: string | null) => void
  onDuplica: (id: string) => void
  onElimina: (id: string) => void
}) {
  if (documento.blocchi.length === 0) {
    return (
      <div className="ml-ed-struttura-vuota">
        <Columns2 />
        <div>L'email è vuota</div>
        <small>Aggiungi i blocchi dalla scheda Blocchi: qui li vedrai in ordine e potrai riordinarli trascinandoli.</small>
      </div>
    )
  }
  return (
    <SortableContext items={documento.blocchi.map((b) => b.id)} strategy={verticalListSortingStrategy}>
      <ul className="ml-ed-struttura" aria-label="Struttura dell'email">
        {documento.blocchi.map((b) => (
          <RigaStruttura
            key={b.id}
            b={b}
            selezionato={selezione === b.id}
            selezione={selezione}
            onSeleziona={onSeleziona}
            onEvidenzia={onEvidenzia}
            onDuplica={onDuplica}
            onElimina={onElimina}
          />
        ))}
      </ul>
    </SortableContext>
  )
}
