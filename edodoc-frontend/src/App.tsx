import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { AppSidebar } from "@/components/app-sidebar"
import { AppToaster } from "@/components/app-toaster"
import { Logo } from "@/components/logo"
import { MenuGenerale } from "@/components/menu-contestuali"
import { ModeToggle } from "@/components/mode-toggle"
import { Caricamento } from "@/components/stati"
import { ThemeProvider } from "@/components/theme-provider"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AuthProvider, useAuth } from "@/contexts/auth-context"
import { AzioniProvider } from "@/contexts/azioni-context"
import Acquisti from "@/pages/Acquisti"
import Check from "@/pages/Check"
import Corsi from "@/pages/Corsi"
import Corso from "@/pages/Corso"
import Dashboard from "@/pages/Dashboard"
import Email from "@/pages/Email"
import Fatture from "@/pages/Fatture"
import Finance from "@/pages/Finance"
import Impostazioni from "@/pages/Impostazioni"
import Login from "@/pages/Login"
import Pagamenti from "@/pages/Pagamenti"
import Pazienti from "@/pages/Pazienti"
import Task from "@/pages/Task"
import Visite from "@/pages/Visite"

const TITOLI: Record<string, string> = {
  "/": "Dashboard", "/pazienti": "Pazienti", "/visite": "Visite", "/check": "Check settimanale", "/email": "Email", "/task": "Task", "/corsi": "Corsi",
  "/acquisti": "Acquisti", "/pagamenti": "Pagamenti", "/fatture": "Fatture", "/finance": "Finance", "/impostazioni": "Impostazioni",
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
              <span className="text-sm sm:text-base font-semibold">{TITOLI[pathname] ?? (pathname.startsWith("/corsi/") ? TITOLI["/corsi"] : "EdoDoc HQ")}</span>
              <div data-app-actions className="ml-auto flex items-center gap-1">
                <ModeToggle />
              </div>
            </div>
          </header>
          <MenuGenerale>
            <main data-app-page className="w-full flex flex-1 flex-col gap-4 sm:gap-6 p-3 sm:p-6 min-w-0">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/pazienti" element={<Pazienti />} />
                <Route path="/visite" element={<Visite />} />
                <Route path="/check" element={<Check />} />
                <Route path="/email" element={<Email />} />
                <Route path="/task" element={<Task />} />
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
