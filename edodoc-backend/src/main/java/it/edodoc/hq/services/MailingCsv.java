package it.edodoc.hq.services;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Lettura del CSV di import contatti: colonne email, nome, cognome con intestazioni italiane o inglesi (anche
 * l'export di Mailchimp: "Email Address", "First Name", "Last Name"), separatore {@code ,} o {@code ;}, BOM UTF-8,
 * campi tra virgolette con {@code ""} come virgoletta. Senza intestazione riconoscibile, se la prima riga contiene
 * un'email si assume l'ordine email, nome, cognome.
 */
public final class MailingCsv {

    public static final int RIGHE_MAX = 20_000;

    /** Email accettata per l'invio: niente spazi, un @, dominio con un punto e TLD di almeno 2 lettere. */
    public static final Pattern EMAIL = Pattern.compile(
            "^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\\.[a-z]{2,}$");

    private static final Set<String> INTESTAZIONI_EMAIL = Set.of(
            "email", "e-mail", "e mail", "mail", "indirizzo email", "indirizzo e-mail", "email address",
            "e-mail address", "posta elettronica", "indirizzo di posta elettronica");
    private static final Set<String> INTESTAZIONI_NOME = Set.of(
            "nome", "first name", "firstname", "first_name", "fname", "name", "nome di battesimo", "given name");
    private static final Set<String> INTESTAZIONI_COGNOME = Set.of(
            "cognome", "last name", "lastname", "last_name", "lname", "surname", "family name");

    public record Riga(int numero, String email, String nome, String cognome) {
    }

    /** {@code righe} valide; {@code errori} leggibili (al massimo 50), {@code nonValidi} = righe con email non valida. */
    public record Esito(List<Riga> righe, int righeLette, int nonValidi, List<String> errori) {
    }

    private MailingCsv() {
    }

    public static Esito leggi(String testo) {
        if (testo == null) {
            throw new IllegalArgumentException("Il file è vuoto.");
        }
        String contenuto = testo.startsWith("﻿") ? testo.substring(1) : testo;
        List<String> linee = contenuto.lines().toList();
        int primaPiena = 0;
        while (primaPiena < linee.size() && linee.get(primaPiena).isBlank()) {
            primaPiena++;
        }
        if (primaPiena >= linee.size()) {
            throw new IllegalArgumentException("Il file è vuoto.");
        }
        char separatore = separatore(linee.get(primaPiena));
        List<List<String>> record = record(contenuto, separatore);
        record.removeIf(r -> r.stream().allMatch(String::isBlank));
        if (record.isEmpty()) {
            throw new IllegalArgumentException("Il file è vuoto.");
        }

        List<String> intestazione = record.get(0);
        int colEmail = colonna(intestazione, INTESTAZIONI_EMAIL);
        int colNome = colonna(intestazione, INTESTAZIONI_NOME);
        int colCognome = colonna(intestazione, INTESTAZIONI_COGNOME);
        int inizio = 1;
        if (colEmail < 0) {
            if (!intestazione.isEmpty() && intestazione.get(0).contains("@")) {
                colEmail = 0;
                colNome = intestazione.size() > 1 ? 1 : -1;
                colCognome = intestazione.size() > 2 ? 2 : -1;
                inizio = 0;
            } else {
                throw new IllegalArgumentException("Manca la colonna email: la prima riga deve avere le intestazioni "
                        + "(email, nome, cognome).");
            }
        }
        int dati = record.size() - inizio;
        if (dati > RIGHE_MAX) {
            throw new IllegalArgumentException("Il file ha " + dati + " righe: il massimo è " + RIGHE_MAX
                    + ". Dividilo in più file.");
        }

        List<Riga> righe = new ArrayList<>();
        List<String> errori = new ArrayList<>();
        int nonValidi = 0;
        for (int i = inizio; i < record.size(); i++) {
            List<String> r = record.get(i);
            int numero = i + 1;
            String email = normalizzaEmail(campo(r, colEmail));
            if (email == null) {
                nonValidi++;
                if (errori.size() < 50) {
                    String grezza = campo(r, colEmail);
                    errori.add("Riga " + numero + ": email non valida" + (grezza == null || grezza.isBlank()
                            ? " (vuota)" : " (" + abbrevia(grezza) + ")"));
                }
                continue;
            }
            righe.add(new Riga(numero, email, testoBreve(campo(r, colNome)), testoBreve(campo(r, colCognome))));
        }
        return new Esito(righe, dati, nonValidi, errori);
    }

    /** Email minuscola senza spazi se valida per l'invio, altrimenti null. */
    public static String normalizzaEmail(String email) {
        if (email == null) {
            return null;
        }
        String e = email.trim().toLowerCase(Locale.ROOT);
        if (e.startsWith("mailto:")) {
            e = e.substring("mailto:".length()).trim();
        }
        if (e.isEmpty() || e.length() > 254 || !EMAIL.matcher(e).matches()) {
            return null;
        }
        return e;
    }

    static char separatore(String intestazione) {
        long virgole = intestazione.chars().filter(ch -> ch == ',').count();
        long puntiEVirgola = intestazione.chars().filter(ch -> ch == ';').count();
        return puntiEVirgola > virgole ? ';' : ',';
    }

    /** Spezza il CSV in record rispettando le virgolette (anche con a capo dentro un campo). */
    static List<List<String>> record(String testo, char separatore) {
        List<List<String>> out = new ArrayList<>();
        List<String> corrente = new ArrayList<>();
        StringBuilder campo = new StringBuilder();
        boolean traVirgolette = false;
        int n = testo.length();
        for (int i = 0; i < n; i++) {
            char ch = testo.charAt(i);
            if (traVirgolette) {
                if (ch == '"') {
                    if (i + 1 < n && testo.charAt(i + 1) == '"') {
                        campo.append('"');
                        i++;
                    } else {
                        traVirgolette = false;
                    }
                } else {
                    campo.append(ch);
                }
            } else if (ch == '"') {
                traVirgolette = true;
            } else if (ch == separatore) {
                corrente.add(campo.toString());
                campo.setLength(0);
            } else if (ch == '\n' || ch == '\r') {
                if (ch == '\r' && i + 1 < n && testo.charAt(i + 1) == '\n') {
                    i++;
                }
                corrente.add(campo.toString());
                campo.setLength(0);
                out.add(corrente);
                corrente = new ArrayList<>();
                if (out.size() > RIGHE_MAX + 1_000) {
                    throw new IllegalArgumentException("Il file ha più di " + RIGHE_MAX + " righe: dividilo in più file.");
                }
            } else {
                campo.append(ch);
            }
        }
        if (campo.length() > 0 || !corrente.isEmpty()) {
            corrente.add(campo.toString());
            out.add(corrente);
        }
        return out;
    }

    private static int colonna(List<String> intestazione, Set<String> nomi) {
        for (int i = 0; i < intestazione.size(); i++) {
            if (nomi.contains(chiaveIntestazione(intestazione.get(i)))) {
                return i;
            }
        }
        return -1;
    }

    static String chiaveIntestazione(String h) {
        if (h == null) {
            return "";
        }
        String s = Normalizer.normalize(h.trim(), Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return s.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    private static String campo(List<String> r, int indice) {
        return indice >= 0 && indice < r.size() ? r.get(indice) : null;
    }

    private static String testoBreve(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim().replaceAll("\\s+", " ");
        if (t.isEmpty()) {
            return null;
        }
        return t.length() > 120 ? t.substring(0, 120) : t;
    }

    private static String abbrevia(String s) {
        String t = s.trim();
        return t.length() > 60 ? t.substring(0, 60) + "…" : t;
    }
}
