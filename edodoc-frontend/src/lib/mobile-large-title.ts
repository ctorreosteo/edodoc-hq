/**
 * Telefono (sotto 640px): "titolo grande" alla iOS.
 * Il titolo nella barra in alto resta nascosto finché il titolo grande della pagina (il primo h1
 * dentro `[data-app-page]`) è visibile; quando scorre via, il titolo in alto compare con una dissolvenza.
 * Scrive solo `data-m-title` sull'header; lo stile sta in src/style/mobile/system.css.
 *
 * Sopra 640px il modulo è inerte: nessun attributo, nessun effetto.
 */
const PHONE_QUERY = "(max-width: 639px)";

function findScrollRoot(): Element | null {
  const inset = document.querySelector('[data-slot="sidebar-inset"]');
  if (!inset) return null;
  const overflow = getComputedStyle(inset).overflowY;
  return overflow === "auto" || overflow === "scroll" ? inset : null;
}

export function initMobileLargeTitle(): void {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
  const media = window.matchMedia(PHONE_QUERY);
  let observer: IntersectionObserver | null = null;
  let observed: Element | null = null;
  let observedTop = 0;
  let scheduled = false;

  const header = () => document.querySelector<HTMLElement>('[data-slot="sidebar-inset"] > header');

  const stop = () => {
    observer?.disconnect();
    observer = null;
    observed = null;
    header()?.removeAttribute("data-m-title");
  };

  const sync = () => {
    scheduled = false;
    if (!media.matches) return stop();
    const head = header();
    const page = document.querySelector("[data-app-page]");
    const h1 = page?.querySelector("h1") ?? null;
    if (!head || !h1) {
      // Nessun titolo grande: il titolo in alto si vede sempre.
      observer?.disconnect();
      observer = null;
      observed = null;
      head?.setAttribute("data-m-title", "shown");
      return;
    }
    // La barra può cambiare altezza dopo il primo giro (es. banner "password in scadenza"):
    // in quel caso l'osservatore va ricreato con il nuovo margine.
    const top = head.getBoundingClientRect().height;
    if (observed === h1 && Math.abs(observedTop - top) < 1) return;
    observer?.disconnect();
    observed = h1;
    observedTop = top;
    observer = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        const visible = e.isIntersecting || e.boundingClientRect.top > top;
        header()?.setAttribute("data-m-title", visible ? "hidden" : "shown");
      },
      { root: findScrollRoot(), rootMargin: `-${Math.ceil(top)}px 0px 0px 0px`, threshold: [0, 0.01] }
    );
    observer.observe(h1);
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  media.addEventListener("change", schedule);
  schedule();
}
