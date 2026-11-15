package it.edodoc.hq.services;

import it.edodoc.hq.models.PlannerMedia;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Regole dei canali del Planner social: formati, limiti di testo e di media. Il frontend ne ha una copia più ricca
 * (anche gli avvisi non bloccanti) in {@code src/lib/planner-canali.ts}: i limiti vanno cambiati insieme.
 */
public final class PlannerCanali {

    public static final String FACEBOOK = "FACEBOOK";
    public static final String INSTAGRAM = "INSTAGRAM";
    public static final String YOUTUBE = "YOUTUBE";
    public static final String GOOGLE_BUSINESS = "GOOGLE_BUSINESS";
    public static final String TIKTOK = "TIKTOK";
    public static final String LINKEDIN = "LINKEDIN";
    public static final String X = "X";
    public static final String THREADS = "THREADS";
    public static final String PINTEREST = "PINTEREST";

    public static final List<String> TUTTI =
            List.of(FACEBOOK, INSTAGRAM, YOUTUBE, GOOGLE_BUSINESS, TIKTOK, LINKEDIN, X, THREADS, PINTEREST);

    /** Canali che il gestionale sa pubblicare da solo (se collegati). */
    public static final Set<String> NATIVI = Set.of(FACEBOOK, INSTAGRAM, YOUTUBE, GOOGLE_BUSINESS, TIKTOK);

    public static final Map<String, List<String>> FORMATI = Map.of(
            FACEBOOK, List.of("POST", "REEL", "STORIA"),
            INSTAGRAM, List.of("POST", "CAROSELLO", "REEL", "STORIA"),
            YOUTUBE, List.of("VIDEO", "SHORT"),
            GOOGLE_BUSINESS, List.of("AGGIORNAMENTO", "EVENTO", "OFFERTA"),
            TIKTOK, List.of("VIDEO", "CAROSELLO"),
            LINKEDIN, List.of("POST"),
            X, List.of("POST"),
            THREADS, List.of("POST"),
            PINTEREST, List.of("POST"));

    private static final Map<String, Integer> MAX_TESTO = Map.of(
            FACEBOOK, 63_206,
            INSTAGRAM, 2_200,
            YOUTUBE, 5_000,
            GOOGLE_BUSINESS, 1_500,
            TIKTOK, 2_200,
            LINKEDIN, 3_000,
            X, 280,
            THREADS, 500,
            PINTEREST, 500);

    private static final Map<String, String> NOMI = Map.of(
            FACEBOOK, "Facebook",
            INSTAGRAM, "Instagram",
            YOUTUBE, "YouTube",
            GOOGLE_BUSINESS, "Google Business",
            TIKTOK, "TikTok",
            LINKEDIN, "LinkedIn",
            X, "X",
            THREADS, "Threads",
            PINTEREST, "Pinterest");

    public static final int MAX_TITOLO_YOUTUBE = 100;
    public static final int MAX_TITOLO_PINTEREST = 100;
    public static final int MAX_HASHTAG_INSTAGRAM = 30;

    private PlannerCanali() {
    }

    public static String canale(String valore) {
        String c = valore == null ? "" : valore.trim().toUpperCase(Locale.ROOT);
        if (!TUTTI.contains(c)) {
            throw new IllegalArgumentException("Canale non riconosciuto: " + valore);
        }
        return c;
    }

    public static String formato(String canale, String valore) {
        List<String> ammessi = FORMATI.get(canale);
        String f = valore == null || valore.isBlank() ? ammessi.get(0) : valore.trim().toUpperCase(Locale.ROOT);
        if (!ammessi.contains(f)) {
            throw new IllegalArgumentException(nome(canale) + " non ha il formato " + valore + ".");
        }
        return f;
    }

    public static String nome(String canale) {
        return NOMI.getOrDefault(canale, canale);
    }

    public static int maxTesto(String canale) {
        return MAX_TESTO.getOrDefault(canale, 63_206);
    }

    /**
     * Controllo bloccante prima di programmare: testo e media adatti a canale e formato. Messaggio in italiano o null.
     */
    public static String problema(String canale, String formato, String testo, String titolo, List<PlannerMedia> media) {
        String nome = nome(canale);
        int lunghezza = testo == null ? 0 : testo.codePointCount(0, testo.length());
        if (lunghezza > maxTesto(canale)) {
            return nome + ": il testo supera i " + maxTesto(canale) + " caratteri.";
        }
        long immagini = media.stream().filter(m -> PlannerMedia.TIPO_IMMAGINE.equals(m.getTipo())).count();
        long video = media.size() - immagini;
        boolean vuoto = lunghezza == 0;
        switch (canale) {
            case FACEBOOK -> {
                if ("REEL".equals(formato) && (video != 1 || immagini > 0)) {
                    return "Facebook: un reel è un solo video.";
                }
                if ("STORIA".equals(formato) && media.size() != 1) {
                    return "Facebook: una storia è una sola immagine o un solo video.";
                }
                if ("POST".equals(formato)) {
                    if (video > 1 || (video == 1 && immagini > 0)) {
                        return "Facebook: un post ha fino a 10 immagini oppure un solo video.";
                    }
                    if (immagini > 10) {
                        return "Facebook: al massimo 10 immagini per post.";
                    }
                    if (media.isEmpty() && vuoto) {
                        return "Facebook: scrivi un testo o aggiungi un media.";
                    }
                }
            }
            case INSTAGRAM -> {
                if (hashtag(testo) > MAX_HASHTAG_INSTAGRAM) {
                    return "Instagram: al massimo 30 hashtag.";
                }
                switch (formato) {
                    case "POST" -> {
                        if (immagini != 1 || video > 0) {
                            return "Instagram: un post è una sola immagine (per un video scegli Reel, per più immagini Carosello).";
                        }
                    }
                    case "CAROSELLO" -> {
                        if (media.size() < 2 || media.size() > 10) {
                            return "Instagram: un carosello ha da 2 a 10 immagini o video.";
                        }
                    }
                    case "REEL" -> {
                        if (video != 1 || immagini > 0) {
                            return "Instagram: un reel è un solo video.";
                        }
                    }
                    default -> {
                        if (media.size() != 1) {
                            return "Instagram: una storia è una sola immagine o un solo video.";
                        }
                    }
                }
            }
            case YOUTUBE -> {
                if (video != 1 || immagini > 0) {
                    return "YouTube: serve un solo video.";
                }
                if (titolo == null || titolo.isBlank()) {
                    return "YouTube: il titolo del video è obbligatorio.";
                }
                if (titolo.length() > MAX_TITOLO_YOUTUBE) {
                    return "YouTube: il titolo supera i 100 caratteri.";
                }
            }
            case GOOGLE_BUSINESS -> {
                if (video > 0) {
                    return "Google Business: i post della scheda accettano solo un'immagine, non video.";
                }
                if (immagini > 1) {
                    return "Google Business: al massimo un'immagine.";
                }
                if (vuoto) {
                    return "Google Business: il testo è obbligatorio.";
                }
            }
            case TIKTOK -> {
                if ("VIDEO".equals(formato) && (video != 1 || immagini > 0)) {
                    return "TikTok: serve un solo video.";
                }
                if ("CAROSELLO".equals(formato) && (video > 0 || immagini < 1 || immagini > 35)) {
                    return "TikTok: un carosello ha da 1 a 35 immagini.";
                }
            }
            case LINKEDIN -> {
                if (video > 1 || (video == 1 && immagini > 0) || immagini > 9) {
                    return "LinkedIn: fino a 9 immagini oppure un solo video.";
                }
                if (media.isEmpty() && vuoto) {
                    return "LinkedIn: scrivi un testo o aggiungi un media.";
                }
            }
            case X -> {
                if (video > 1 || (video == 1 && immagini > 0) || immagini > 4) {
                    return "X: fino a 4 immagini oppure un solo video.";
                }
                if (media.isEmpty() && vuoto) {
                    return "X: scrivi un testo o aggiungi un media.";
                }
            }
            case THREADS -> {
                if (media.size() > 10) {
                    return "Threads: al massimo 10 media.";
                }
                if (media.isEmpty() && vuoto) {
                    return "Threads: scrivi un testo o aggiungi un media.";
                }
            }
            case PINTEREST -> {
                if (media.size() != 1) {
                    return "Pinterest: un pin è una sola immagine o un solo video.";
                }
                if (titolo != null && titolo.length() > MAX_TITOLO_PINTEREST) {
                    return "Pinterest: il titolo supera i 100 caratteri.";
                }
            }
            default -> {
                return null;
            }
        }
        return null;
    }

    static int hashtag(String testo) {
        if (testo == null) {
            return 0;
        }
        return (int) java.util.regex.Pattern.compile("(?<![\\p{L}\\p{N}_])#[\\p{L}\\p{N}_]+").matcher(testo).results().count();
    }

    static String iso(LocalDateTime ora) {
        return ora == null ? null : SocialTempo.iso(ora.atZone(SocialTempo.ROMA).toInstant());
    }
}
