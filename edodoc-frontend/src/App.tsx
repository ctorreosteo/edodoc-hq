import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AppSidebar } from "@/components/app-sidebar"
import { AppToaster } from "@/components/app-toaster"
import { Logo } from "@/components/logo"
import { MenuGenerale } from "@/components/menu-contestuali"
import { ModeToggle } from "@/components/mode-toggle"
import { PillolaObiettivo } from "@/components/obiettivi/pillola"
import { Caricamento } from "@/components/stati"
import { ThemeProvider } from "@/components/theme-provider"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AuthProvider, useAuth } from "@/contexts/auth-context"
import { AzioniProvider } from "@/contexts/azioni-context"
import Acquisti from "@/pages/Acquisti"
import Calendario from "@/pages/Calendario"
import Check from "@/pages/Check"
import Corsi from "@/pages/Corsi"
import Corso from "@/pages/Corso"
import Dashboard from "@/pages/Dashboard"
import Dieta from "@/pages/Dieta"
import Diete from "@/pages/Diete"
import Email from "@/pages/Email"
import EmailMarketing from "@/pages/EmailMarketing"
import PreferenzeEmail from "@/pages/PreferenzeEmail"
import FirmaAccettazione from "@/pages/FirmaAccettazione"
import VerificaFirma from "@/pages/VerificaFirma"
import Fatture from "@/pages/Fatture"
import Finance from "@/pages/Finance"
import Impostazioni from "@/pages/Impostazioni"
import Login from "@/pages/Login"
import Pagamenti from "@/pages/Pagamenti"
import Obiettivi from "@/pages/Obiettivi"
import Pazienti from "@/pages/Pazienti"
import Planner from "@/pages/Planner"
import BioPubblica from "@/pages/BioPubblica"
import TiktokOauthCallback from "@/pages/TiktokOauthCallback"
import { PlannerRoute } from "@/components/planner-route"
import Prenotazioni from "@/pages/Prenotazioni"
import Task from "@/pages/Task"
import Visite from "@/pages/Visite"
import YouTube from "@/pages/YouTube"
import YoutubeOauthCallback from "@/pages/YoutubeOauthCallback"
import Social from "@/pages/Social"
import { SocialRoute } from "@/components/social-route"

const TITOLI: Record<string, string> = {
  "/": "Dashboard", "/obiettivi": "Obiettivi", "/pazienti": "Pazienti", "/visite": "Visite", "/discovery": "Discovery", "/calendario": "Calendario", "/check": "Check settimanale", "/email": "Email", "/email-marketing": "Email Marketing", "/task": "Task", "/corsi": "Corsi", "/diete": "Diete",
  "/acquisti": "Acquisti", "/pagamenti": "Pagamenti", "/fatture": "Fatture", "/finance": "Finance", "/impostazioni": "Impostazioni",
  "/planner": "Planner social", "/oauth/tiktok/callback": "Collegamento TikTok",
  "/youtube": "YouTube", "/oauth/youtube/callback": "Collegamento YouTube", "/meta": "Meta",
}

function Gestionale() {
  const { pathname } = useLocation()
  return (
    <AzioniProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header data-app-header className="bg-background sticky top-0 z-50 flex shrink-0 flex-col border-b pt-[env(safe-area-inset-top,0px)]">
            <div data-app-topbar className="flex h-16 items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4 hidden sm:block" />
              <Logo className="h-5 mr-2 sm:hidden" />
              <span className="text-sm sm:text-base font-semibold">{TITOLI[pathname] ?? (pathname.startsWith("/corsi/") ? TITOLI["/corsi"] : pathname.startsWith("/diete/") ? TITOLI["/diete"] : "EdoDoc HQ")}</span>
              <div data-app-actions className="ml-auto flex items-center gap-1">
                <PillolaObiettivo />
                <ModeToggle />
              </div>
            </div>
          </header>
          <MenuGenerale>
            <main data-app-page className="w-full flex flex-1 flex-col gap-4 sm:gap-6 p-3 sm:p-6 min-w-0">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/obiettivi" element={<Obiettivi />} />
                <Route path="/pazienti" element={<Pazienti />} />
                <Route path="/visite" element={<Visite />} />
                <Route path="/discovery" element={<Prenotazioni />} />
                <Route path="/prenotazioni" element={<Navigate to="/discovery" replace />} />
                <Route path="/calendario" element={<Calendario />} />
                <Route path="/check" element={<Check />} />
                <Route path="/email" element={<Email />} />
                <Route path="/email-marketing" element={<EmailMarketing />} />
                <Route path="/planner" element={<PlannerRoute><Planner /></PlannerRoute>} />
                <Route path="/oauth/tiktok/callback" element={<PlannerRoute><TiktokOauthCallback /></PlannerRoute>} />
                <Route path="/meta" element={<SocialRoute><Social /></SocialRoute>} />
                <Route path="/youtube" element={<YouTube />} />
                <Route path="/oauth/youtube/callback" element={<YoutubeOauthCallback />} />
                <Route path="/task" element={<Task />} />
                <Route path="/diete" element={<Diete />} />
                <Route path="/diete/:id" element={<Dieta />} />
                <Route path="/corsi" element={<Corsi />} />
                <Route path="/corsi/:id" element={<Corso />} />
                <Route path="/acquisti" element={<Acquisti />} />
                <Route path="/pagamenti" element={<Pagamenti />} />
                <Route path="/fatture" element={<Fatture />} />
                <Route path="/finance" element={<Finance />} />
                <Route path="/impostazioni" element={<Impostazioni />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </MenuGenerale>
        </SidebarInset>
      </SidebarProvider>
    </AzioniProvider>
  )
}

function Radice() {
  const { utente, pronto } = useAuth()
  const { pathname } = useLocation()
  // Link in bio del Planner social: pagina pubblica (dal profilo Instagram), senza login né layout del gestionale.
  if (pathname.startsWith("/bio/")) {
    return (
      <Routes>
        <Route path="/bio/:slug" element={<BioPubblica />} />
      </Routes>
    )
  }
  // Centro preferenze dell'Email Marketing: link in fondo a ogni email, pubblico, senza login né layout.
  if (pathname.startsWith("/preferenze-email/")) {
    return (
      <Routes>
        <Route path="/preferenze-email/:token" element={<PreferenzeEmail />} />
      </Routes>
    )
  }
  // Accettazione firmata online: link personale mandato al paziente e verifica del modulo firmato, senza login.
  if (pathname.startsWith("/firma/") || pathname.startsWith("/verifica-firma/")) {
    return (
      <Routes>
        <Route path="/firma/:token" element={<FirmaAccettazione />} />
        <Route path="/verifica-firma/:codice" element={<VerificaFirma />} />
      </Routes>
    )
  }
  if (!pronto) return <Caricamento etichetta="Verifica accesso…" />
  return utente ? <Gestionale /> : <Login />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Radice />
        <AppToaster />
      </AuthProvider>
    </ThemeProvider>
  )
}
