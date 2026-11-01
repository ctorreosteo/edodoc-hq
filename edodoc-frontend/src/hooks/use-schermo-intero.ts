import { useLayoutEffect } from "react"

/*
  Pagine "app" sul telefono (chat, agenda): la pagina riempie l'area sotto la barra e scorre solo
  il contenuto interno (messaggi, griglia oraria), invece di scorrere tutto il contenitore.

  L'aggancio del gestionale all'area visibile (anche con la tastiera aperta) vale già per tutte le pagine
  (useAreaVisibile, montato nell'App); qui si aggiunge solo data-schermo-intero su <html>. Le regole stanno
  in style/mobile/schermo-intero.css e valgono solo sotto i 768px.

  Qui lo SidebarInset ha overflow hidden ma può restare scorso: lo scroll della pagina di prima, o quello
  che iOS e scrollIntoView fanno su tutti i contenitori. Il dito non lo riporta su, e la pagina resta
  spostata in alto (barra tagliata, fascia vuota in fondo): lo si tiene sempre a 0.
*/

export function useSchermoIntero({ immersivo = false }: { immersivo?: boolean } = {}) {
  useLayoutEffect(() => {
    const html = document.documentElement
    html.setAttribute("data-schermo-intero", immersivo ? "immersivo" : "")

    const inset = document.querySelector<HTMLElement>('[data-slot="sidebar-inset"]')
    const azzera = () => {
      if (inset && inset.scrollTop !== 0) inset.scrollTop = 0
    }
    azzera()
    inset?.addEventListener("scroll", azzera, { passive: true })
    document.addEventListener("visibilitychange", azzera)
    window.visualViewport?.addEventListener("resize", azzera)

    return () => {
      inset?.removeEventListener("scroll", azzera)
      document.removeEventListener("visibilitychange", azzera)
      window.visualViewport?.removeEventListener("resize", azzera)
      html.removeAttribute("data-schermo-intero")
    }
  }, [immersivo])
}
