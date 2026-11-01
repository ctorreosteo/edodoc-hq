import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./style/index.css"
import App from "./App.tsx"
import "./style/mobile.css"
import "./style/mobile/system.css"
import "./style/mobile/shell.css"
import "./style/sheets.css"
import "./style/sidebar.css"
import "./style/topbar.css"
import "./style/menus.css"
import { initMobileTableCards } from "./lib/mobile-table-cards"
import { initMobileLargeTitle } from "./lib/mobile-large-title"

initMobileTableCards()
initMobileLargeTitle()

createRoot(document.getElementById("root")!).render(
  <div className="w-full h-full">
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  </div>
)
