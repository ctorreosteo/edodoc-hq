import { Mail, Banknote, CalendarDays, CalendarRange, ClipboardCheck, FileText, GraduationCap, LayoutDashboard, ListChecks, LogOut, Salad, Settings, ShoppingBag, Users, Wallet, type LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router-dom"
import { Sidebar, SidebarContent, useSidebar } from "@/components/ui/sidebar"
import { Logo } from "@/components/logo"
import { useAuth } from "@/contexts/auth-context"
import { useCasellaStato } from "@/hooks/use-casella-stato"

type Voce = { titolo: string; url: string; icona: LucideIcon }

const GRUPPI: { titolo: string; voci: Voce[] }[] = [
  { titolo: "Studio", voci: [
    { titolo: "Dashboard", url: "/", icona: LayoutDashboard },
    { titolo: "Pazienti", url: "/pazienti", icona: Users },
    { titolo: "Visite", url: "/visite", icona: CalendarDays },
    { titolo: "Calendario", url: "/calendario", icona: CalendarRange },
    { titolo: "Check settimanale", url: "/check", icona: ClipboardCheck },
    { titolo: "Diete", url: "/diete", icona: Salad },
    { titolo: "Email", url: "/email", icona: Mail },
    { titolo: "Task", url: "/task", icona: ListChecks },
    { titolo: "Corsi", url: "/corsi", icona: GraduationCap },
  ] },
  { titolo: "Amministrazione", voci: [
    { titolo: "Acquisti", url: "/acquisti", icona: ShoppingBag },
    { titolo: "Pagamenti", url: "/pagamenti", icona: Banknote },
    { titolo: "Fatture", url: "/fatture", icona: FileText },
    { titolo: "Finance", url: "/finance", icona: Wallet },
    { titolo: "Impostazioni", url: "/impostazioni", icona: Settings },
  ] },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const { utente, logout } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const { nonLetti } = useCasellaStato()
  const chiudi = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar>
      <SidebarContent className="mnav">
        <div className="flex items-center gap-2 px-4 pt-5 pb-3">
          <Logo className="h-7" />
          <b className="text-sm font-bold tracking-tight">HQ</b>
        </div>

        <nav className="mnav-scroll" aria-label="Menu principale">
          {GRUPPI.map((gruppo) => (
            <div key={gruppo.titolo} className="mnav-group">
              <div className="mnav-group-trigger" aria-hidden>
                <b className="mnav-group-title">{gruppo.titolo}</b>
              </div>
              <ul className="mnav-list">
                {gruppo.voci.map((voce) => {
                  const attiva = voce.url === "/" ? pathname === "/" : pathname.startsWith(voce.url)
                  return (
                    <li key={voce.url}>
                      <Link to={voce.url} className="mnav-item" data-active={attiva ? "" : undefined} aria-current={attiva ? "page" : undefined} onClick={chiudi}>
                        <div className="mnav-item-icon" aria-hidden><voce.icona /></div>
                        <div className="mnav-item-label">{voce.titolo}</div>
                        {voce.url === "/email" && nonLetti > 0 ? <small className="mnav-badge" aria-label={`${nonLetti} email da leggere`}>{nonLetti > 99 ? "99+" : nonLetti}</small> : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="mnav-foot">
          <div className="mnav-user">
            <div className="mnav-avatar" aria-hidden>{`${utente?.nome.charAt(0) ?? ""}${utente?.cognome.charAt(0) ?? ""}`}</div>
            <div className="mnav-user-text">
              <strong className="mnav-user-name">{utente ? `${utente.nome} ${utente.cognome}` : ""}</strong>
              <small className="mnav-user-mail">{utente?.username}</small>
            </div>
          </div>
          <div className="mnav-actions">
            <button type="button" className="mnav-action" data-tone="danger" onClick={logout}>
              <LogOut aria-hidden />
              Esci
            </button>
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  )
}
