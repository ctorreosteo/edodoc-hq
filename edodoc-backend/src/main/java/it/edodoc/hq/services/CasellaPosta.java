package it.edodoc.hq.services;

import it.edodoc.hq.dto.CasellaDto;

import java.util.List;

/** La casella del dottore: Gmail reale ({@link GmailPosta}) oppure quella dimostrativa ({@link DemoPosta}). */
public interface CasellaPosta {

    CasellaDto.Casella casella();

    CasellaDto.Stato stato(String dalHistoryId);

    CasellaDto.PaginaThread elenco(String cartella, String q, String pagina);

    CasellaDto.Thread thread(String threadId);

    byte[] allegato(String messaggioId, String allegatoId);

    void modifica(List<String> threadIds, List<String> aggiungi, List<String> rimuovi);

    void cestina(List<String> threadIds);

    void ripristina(List<String> threadIds);

    CasellaDto.EsitoInvio invia(CasellaDto.Composizione composizione, List<CasellaMime.FileAllegato> allegati);

    CasellaDto.EsitoBozza salvaBozza(CasellaDto.Composizione composizione, List<CasellaMime.FileAllegato> allegati);

    CasellaDto.Bozza bozza(String bozzaId);

    void eliminaBozza(String bozzaId);
}
