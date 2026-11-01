/**
 * Telefono (sotto 640px): etichetta ogni cella delle tabelle con il testo
 * dell'intestazione corrispondente (`data-label`), così `mobile.css` può
 * mostrare le righe come schede "etichetta / valore".
 *
 * In più marca il ruolo di alcune celle (`data-m-role`) per una scheda più curata:
 * - "title":   la prima cella significativa (nome, paziente, descrizione…) → titolo in grassetto
 * - "actions": cella fatta solo di pulsanti/link-icona → riga azioni in fondo alla scheda
 * - "check":   cella con la sola casella di spunta → in alto a destra
 *
 * Opt-out: `data-mobile-cards="off"` sulla tabella (nessuna trasformazione),
 * `data-mobile-cards-title="off"` per tenere la scheda senza titolo automatico.
 *
 * Sopra 640px il modulo resta inerte: nessun attributo, nessun effetto.
 */
const PHONE_QUERY = "(max-width: 639px)";
const MIN_COLUMNS = 3;
const SKIP_SELECTOR = [
  "table.visite-mobile-compact-table",
  'table[class*="rdp"]',
  "[data-chat-shell] table",
  'table[data-mobile-cards="off"]',
].join(", ");

/** Intestazioni che di solito identificano la riga: diventano il titolo della scheda. */
const TITLE_LABEL =
  /^(nome|nominativo|paziente|cliente|titolo|descrizione|fornitore|dipendente|osteopata|utente|candidato|tirocinante|persona|account|ragione sociale|oggetto|voce|servizio|trattamento|conto)\b/i;
const ACTIONS_LABEL = /^(azion[ei]|actions?|operazioni|gestisci|modifica)$/i;
const SKIP_TITLE_LABEL = /^(#|n\.?|n°|id|avatar|foto|stato|status|seleziona)$/i;
const INTERACTIVE = "button, a, [role='button'], [role='checkbox'], input, select, [data-slot='dropdown-menu-trigger']";

function headerLabels(table: HTMLTableElement): string[] {
  const head = table.tHead;
  if (!head || head.rows.length === 0) return [];
  const row = head.rows[head.rows.length - 1];
  const labels: string[] = [];
  for (const th of Array.from(row.cells)) {
    const text = (th.textContent ?? "").replace(/\s+/g, " ").trim();
    for (let i = 0; i < (th.colSpan || 1); i++) labels.push(text);
  }
  return labels;
}

function isEmptyCell(cell: HTMLTableCellElement): boolean {
  if ((cell.textContent ?? "").trim()) return false;
  return !cell.querySelector("img, svg, button, input, select, textarea, a, [role]");
}

/** Testo della cella che NON sta dentro un controllo (pulsante, link, menu…). */
function looseText(cell: HTMLTableCellElement): string {
  if (!cell.querySelector(INTERACTIVE)) return (cell.textContent ?? "").replace(/\s+/g, " ").trim();
  let text = "";
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent?.closest(INTERACTIVE)) continue;
    text += node.textContent ?? "";
  }
  return text.replace(/\s+/g, " ").trim();
}

function isCheckCell(cell: HTMLTableCellElement): boolean {
  if ((cell.textContent ?? "").trim()) return false;
  return !!cell.querySelector("[role='checkbox'], input[type='checkbox']");
}

function isActionsCell(cell: HTMLTableCellElement, label: string): boolean {
  const controls = cell.querySelectorAll("button, a, [role='button']");
  if (controls.length === 0) return false;
  if (ACTIONS_LABEL.test(label) || label === "") return looseText(cell) === "";
  // Solo pulsanti-icona (nessun testo fuori o dentro i pulsanti)
  return looseText(cell) === "" && !(cell.textContent ?? "").trim();
}

type Role = "title" | "actions" | "menu" | "check";

function cellRoles(cells: HTMLTableCellElement[], labels: string[], wantTitle: boolean): Map<HTMLTableCellElement, Role> {
  const roles = new Map<HTMLTableCellElement, Role>();
  let column = 0;
  const candidates: { cell: HTMLTableCellElement; label: string }[] = [];
  for (const cell of cells) {
    const span = cell.colSpan || 1;
    const label = span > 1 ? "" : labels[column] ?? "";
    column += span;
    if (span > 1 || isEmptyCell(cell)) continue;
    if (isCheckCell(cell)) {
      roles.set(cell, "check");
      continue;
    }
    if (isActionsCell(cell, label)) {
      roles.set(cell, "actions");
      continue;
    }
    const editable = cell.querySelector("input, textarea, select, [data-slot='select-trigger']");
    if (!editable && !SKIP_TITLE_LABEL.test(label) && (cell.textContent ?? "").trim()) {
      candidates.push({ cell, label });
    }
  }
  // Un solo pulsante-icona (menu "…"): va in alto a destra, non serve una riga intera.
  const actionCells = [...roles].filter(([, r]) => r === "actions").map(([c]) => c);
  if (actionCells.length === 1) {
    const only = actionCells[0];
    const controls = only.querySelectorAll("button, a, [role='button']");
    if (controls.length === 1 && !(only.textContent ?? "").trim()) roles.set(only, "menu");
  }
  if (wantTitle && candidates.length > 0) {
    const preferred = candidates.slice(0, 4).find((c) => TITLE_LABEL.test(c.label));
    const pick = preferred ?? candidates[0];
    // Un titolo troppo lungo (note, testi) non è un buon titolo: si resta sulla scheda semplice.
    if ((pick.cell.textContent ?? "").trim().length <= 90) roles.set(pick.cell, "title");
  }
  return roles;
}

function labelTable(table: HTMLTableElement): void {
  if (table.matches(SKIP_SELECTOR)) return;
  const labels = headerLabels(table);
  if (labels.length < MIN_COLUMNS) {
    if (table.dataset.mobileCards === "on") delete table.dataset.mobileCards;
    return;
  }
  if (table.dataset.mobileCards !== "on") table.dataset.mobileCards = "on";
  const wantTitle = table.dataset.mobileCardsTitle !== "off";
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      const cells = Array.from(row.cells);
      // Righe già curate a mano da una pagina (data-m-cell): niente ruoli automatici.
      const custom = cells.some((c) => c.dataset.mCell !== undefined);
      const roles = custom ? new Map<HTMLTableCellElement, Role>() : cellRoles(cells, labels, wantTitle);
      let column = 0;
      for (const cell of cells) {
        const span = cell.colSpan || 1;
        const label = span > 1 ? "" : labels[column] ?? "";
        if (cell.dataset.label !== label) cell.dataset.label = label;
        if (isEmptyCell(cell)) {
          if (cell.dataset.empty === undefined) cell.dataset.empty = "";
        } else if (cell.dataset.empty !== undefined) {
          delete cell.dataset.empty;
        }
        const role = roles.get(cell);
        if (role) {
          if (cell.dataset.mRole !== role) cell.dataset.mRole = role;
        } else if (cell.dataset.mRole !== undefined) {
          delete cell.dataset.mRole;
        }
        column += span;
      }
    }
  }
}

export function initMobileTableCards(): void {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") return;
  const media = window.matchMedia(PHONE_QUERY);
  let scheduled = false;

  const run = () => {
    scheduled = false;
    if (!media.matches) return;
    document.querySelectorAll<HTMLTableElement>("table").forEach(labelTable);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  media.addEventListener("change", schedule);
  schedule();
}
