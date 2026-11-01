package it.edodoc.hq.services;

import it.edodoc.hq.dto.AgendaDto;

import java.util.List;

/** Da dove arriva il calendario: Google, oppure quello dimostrativo in locale. */
public interface AgendaFonte {

    String PRINCIPALE = "primary";

    enum Ambito { QUESTO, SEGUENTI, TUTTI }

    AgendaDto.Stato stato();

    AgendaDto.Eventi eventi(List<String> calendari, String da, String a);

    AgendaDto.Evento evento(String calendarioId, String eventoId);

    List<AgendaDto.Evento> cerca(String q, List<String> calendari);

    AgendaDto.Novita novita(List<String> calendari, long dal);

    AgendaDto.Evento crea(String calendarioId, AgendaDto.EventoRequest req, boolean notifica);

    AgendaDto.Evento modifica(String calendarioId, String eventoId, AgendaDto.EventoRequest req, Ambito ambito, boolean notifica);

    void elimina(String calendarioId, String eventoId, Ambito ambito, boolean notifica);

    AgendaDto.Evento sposta(String calendarioId, String eventoId, String destinazione, boolean notifica);

    AgendaDto.Evento rispondi(String calendarioId, String eventoId, AgendaDto.RispostaRequest req, Ambito ambito);

    List<AgendaDto.Disponibilita> disponibilita(AgendaDto.DisponibilitaRequest req);
}
