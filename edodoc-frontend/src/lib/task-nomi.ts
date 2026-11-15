/** "Nome Cognome", come nel resto di EdoDoc. */
export const nomeCompleto = (o: { nome?: string | null; cognome?: string | null }) => `${o.nome ?? ""} ${o.cognome ?? ""}`.trim()
