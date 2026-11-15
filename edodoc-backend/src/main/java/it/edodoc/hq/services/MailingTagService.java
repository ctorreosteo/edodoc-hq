package it.edodoc.hq.services;

import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingCategoria;
import it.edodoc.hq.models.MailingTag;
import it.edodoc.hq.repositories.MailingCategoriaRepository;
import it.edodoc.hq.repositories.MailingTagRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Tag dei contatti e categorie del centro preferenze. I tag di sistema non si rinominano né si eliminano. */
@Service
public class MailingTagService {

    static final Pattern COLORE = Pattern.compile("#[0-9a-fA-F]{6}");

    private final MailingTagRepository tagRepository;
    private final MailingCategoriaRepository categoriaRepository;
    private final NamedParameterJdbcTemplate jdbc;

    public MailingTagService(MailingTagRepository tagRepository, MailingCategoriaRepository categoriaRepository,
                             NamedParameterJdbcTemplate jdbc) {
        this.tagRepository = tagRepository;
        this.categoriaRepository = categoriaRepository;
        this.jdbc = jdbc;
    }

    // ── Tag ──

    /** Tutti i tag con il numero di contatti (una sola query GROUP BY). */
    @Transactional(readOnly = true)
    public List<MailingDto.Tag> tag() {
        Map<Long, Integer> conteggi = new HashMap<>();
        jdbc.query("SELECT tag_id, COUNT(*) AS n FROM mailing_contatti_tag GROUP BY tag_id", Map.of(),
                rs -> {
                    conteggi.put(rs.getLong("tag_id"), rs.getInt("n"));
                });
        return tagRepository.findAllByOrderByNomeAsc().stream()
                .map(t -> dto(t, conteggi.getOrDefault(t.getId(), 0)))
                .toList();
    }

    @Transactional
    public MailingDto.Tag creaTag(MailingDto.TagInput input) {
        String nome = nomeValido(input == null ? null : input.nome());
        if (tagRepository.findByNomeIgnoreCase(nome).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già un tag con questo nome.");
        }
        MailingTag tag = tagRepository.save(MailingTag.builder()
                .nome(nome).colore(colore(input.colore())).sistema(false).creatoIl(MailingTempo.adesso()).build());
        return dto(tag, 0);
    }

    /** I tag di sistema accettano solo il cambio di colore. */
    @Transactional
    public MailingDto.Tag aggiornaTag(long tagId, MailingDto.TagInput input) {
        MailingTag tag = trovaTag(tagId);
        if (input == null) {
            throw new IllegalArgumentException("Dati del tag mancanti.");
        }
        if (input.nome() != null) {
            String nome = nomeValido(input.nome());
            if (!nome.equals(tag.getNome())) {
                if (Boolean.TRUE.equals(tag.getSistema())) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "I tag di sistema non si rinominano: li usa il gestionale.");
                }
                tagRepository.findByNomeIgnoreCase(nome).filter(t -> !t.getId().equals(tagId)).ifPresent(t -> {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Esiste già un tag con questo nome.");
                });
                tag.setNome(nome);
            }
        }
        tag.setColore(colore(input.colore()));
        tag = tagRepository.save(tag);
        return dto(tag, conteggio(tagId));
    }

    @Transactional
    public void eliminaTag(long tagId) {
        MailingTag tag = trovaTag(tagId);
        if (Boolean.TRUE.equals(tag.getSistema())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "I tag di sistema non si eliminano: li usa il gestionale.");
        }
        tagRepository.delete(tag);
    }

    private int conteggio(long tagId) {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM mailing_contatti_tag WHERE tag_id = :id",
                Map.of("id", tagId), Integer.class);
        return n == null ? 0 : n;
    }

    private MailingTag trovaTag(long tagId) {
        return tagRepository.findById(tagId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tag non trovato"));
    }

    static MailingDto.Tag dto(MailingTag t, Integer contatti) {
        return new MailingDto.Tag(t.getId(), t.getNome(), t.getColore(), Boolean.TRUE.equals(t.getSistema()), contatti);
    }

    static String nomeValido(String nome) {
        if (!StringUtils.hasText(nome)) {
            throw new IllegalArgumentException("Il nome del tag è obbligatorio.");
        }
        String n = nome.trim().replaceAll("\\s+", " ");
        if (n.length() > 120) {
            throw new IllegalArgumentException("Il nome del tag è troppo lungo (massimo 120 caratteri).");
        }
        return n;
    }

    static String colore(String colore) {
        if (!StringUtils.hasText(colore)) {
            return null;
        }
        String c = colore.trim();
        if (!COLORE.matcher(c).matches()) {
            throw new IllegalArgumentException("Colore non valido: usa il formato #rrggbb.");
        }
        return c.toLowerCase();
    }

    // ── Categorie ──

    /** Categorie in ordine, con il numero di contatti che le hanno escluse (una query GROUP BY). */
    @Transactional(readOnly = true)
    public List<MailingDto.Categoria> categorie() {
        Map<Long, Integer> esclusi = new HashMap<>();
        jdbc.query("SELECT categoria_id, COUNT(*) AS n FROM mailing_contatti_categorie_escluse GROUP BY categoria_id",
                Map.of(), rs -> {
                    esclusi.put(rs.getLong("categoria_id"), rs.getInt("n"));
                });
        return categoriaRepository.findAllByOrderByOrdineAsc().stream()
                .map(c -> dto(c, esclusi.getOrDefault(c.getId(), 0)))
                .toList();
    }

    @Transactional
    public MailingDto.Categoria creaCategoria(MailingDto.CategoriaInput input) {
        if (input == null) {
            throw new IllegalArgumentException("Dati della categoria mancanti.");
        }
        MailingCategoria c = new MailingCategoria();
        applica(c, input, true);
        c = categoriaRepository.save(c);
        return dto(c, 0);
    }

    @Transactional
    public MailingDto.Categoria aggiornaCategoria(long categoriaId, MailingDto.CategoriaInput input) {
        if (input == null) {
            throw new IllegalArgumentException("Dati della categoria mancanti.");
        }
        MailingCategoria c = categoriaRepository.findById(categoriaId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria non trovata"));
        applica(c, input, false);
        c = categoriaRepository.save(c);
        Integer esclusi = jdbc.queryForObject(
                "SELECT COUNT(*) FROM mailing_contatti_categorie_escluse WHERE categoria_id = :id",
                Map.of("id", categoriaId), Integer.class);
        return dto(c, esclusi == null ? 0 : esclusi);
    }

    private void applica(MailingCategoria c, MailingDto.CategoriaInput input, boolean nuova) {
        if (nuova || input.nome() != null) {
            if (!StringUtils.hasText(input.nome())) {
                throw new IllegalArgumentException("Il nome della categoria è obbligatorio.");
            }
            String nome = input.nome().trim();
            if (nome.length() > 80) {
                throw new IllegalArgumentException("Il nome della categoria è troppo lungo (massimo 80 caratteri).");
            }
            c.setNome(nome);
        }
        if (input.descrizione() != null) {
            String d = input.descrizione().trim();
            if (d.length() > 300) {
                throw new IllegalArgumentException("La descrizione è troppo lunga (massimo 300 caratteri).");
            }
            c.setDescrizione(d.isEmpty() ? null : d);
        }
        if (input.ordine() != null) {
            c.setOrdine(input.ordine());
        } else if (nuova) {
            c.setOrdine(categoriaRepository.findAllByOrderByOrdineAsc().stream()
                    .mapToInt(x -> x.getOrdine() == null ? 0 : x.getOrdine()).max().orElse(0) + 1);
        }
        if (input.attiva() != null) {
            c.setAttiva(input.attiva());
        } else if (nuova) {
            c.setAttiva(true);
        }
    }

    static MailingDto.Categoria dto(MailingCategoria c, Integer esclusi) {
        return new MailingDto.Categoria(c.getId(), c.getNome(), c.getDescrizione(),
                c.getOrdine() == null ? 0 : c.getOrdine(), Boolean.TRUE.equals(c.getAttiva()), esclusi);
    }
}
