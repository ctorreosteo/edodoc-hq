import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BioVista } from '@/components/planner/planner-bio-vista'
import { bioPubblica, urlClicBio, type PlannerBioPubblica } from '@/services/planner-service'
import '@/style/lux-planner.css'

/** Link in bio pubblico di uno spazio del Planner social — route /bio/:slug, senza login né layout del gestionale. */
export default function BioPubblica() {
  const { slug = '' } = useParams()
  const [bio, setBio] = useState<PlannerBioPubblica | null | undefined>(undefined)

  useEffect(() => {
    bioPubblica(slug)
      .then((b) => {
        setBio(b)
        if (b) document.title = b.titolo
      })
      .catch(() => setBio(null))
  }, [slug])

  return (
    <main className="pl-bio-pagina">
      {bio === undefined ? <div className="pl-bio-attesa" aria-label="Caricamento" /> : null}
      {bio === null ? <p className="pl-bio-assente">Questa pagina non esiste o non è più attiva.</p> : null}
      {bio ? <BioVista bio={bio} hrefDi={(k) => urlClicBio(slug, k)} /> : null}
    </main>
  )
}
