package it.edodoc.hq.services;

import java.util.Map;

/**
 * Passa da Apple e Google: titolo e testo restano generici, mai un nome o un dato sanitario.
 * pazienteId null: la notifica è per il dottore. dati dice all'app quale schermata aprire.
 */
public record Notifica(Long pazienteId, String titolo, String testo, Map<String, Object> dati) {
}
