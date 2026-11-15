import type { PlannerCanale, PlannerFormato } from "@/services/planner-service"

/*
  UTM automatici del Planner social, come il backend (PlannerUtm.java): utm_source = canale, utm_medium = social,
  utm_campaign = titolo del post in minuscolo con trattini (o "post-<id>"), utm_content = formato. Un link che ha già
  utm_source resta com'è. Vanno cambiati insieme.
*/

const SORGENTI: Record<PlannerCanale, string> = {
  FACEBOOK: "facebook",
  INSTAGRAM: "instagram",
  YOUTUBE: "youtube",
  GOOGLE_BUSINESS: "google_business",
  TIKTOK: "tiktok",
  LINKEDIN: "linkedin",
  X: "x",
  THREADS: "threads",
  PINTEREST: "pinterest",
}

export function slugUtm(testo: string | null | undefined): string {
  if (!testo) return ""
  const s = testo
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
  return s.length > 60 ? s.slice(0, 60).replace(/-+$/, "") : s
}

export function linkConUtm(
  link: string | null | undefined,
  canale: PlannerCanale,
  formato: PlannerFormato | null,
  titolo: string | null | undefined,
  postId: number | null,
  utm: boolean,
): string {
  if (!link || !utm || link.includes("utm_source=")) return link ?? ""
  const i = link.indexOf("#")
  const base = i >= 0 ? link.slice(0, i) : link
  const coda = i >= 0 ? link.slice(i) : ""
  const campagna = slugUtm(titolo) || (postId ? `post-${postId}` : "post")
  const q = new URLSearchParams({ utm_source: SORGENTI[canale], utm_medium: "social", utm_campaign: campagna })
  if (formato) q.set("utm_content", formato.toLowerCase())
  return `${base}${base.includes("?") ? "&" : "?"}${q.toString()}${coda}`
}
