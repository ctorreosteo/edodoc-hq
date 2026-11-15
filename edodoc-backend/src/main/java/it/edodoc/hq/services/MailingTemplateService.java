package it.edodoc.hq.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.edodoc.hq.dto.MailingDto;
import it.edodoc.hq.models.MailingTemplate;
import it.edodoc.hq.repositories.MailingTemplateRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/** Template dell'Email Marketing: documento a blocchi dell'editor ({@code design}) e sua resa HTML. */
@Service
public class MailingTemplateService {

    private final MailingTemplateRepository repository;
    private final ObjectMapper objectMapper;

    public MailingTemplateService(MailingTemplateRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<MailingDto.TemplateRiga> lista() {
        return repository.findAllByOrderByNomeAsc().stream()
                .map(t -> new MailingDto.TemplateRiga(t.getId(), t.getNome(), t.getCategoria(), t.getOrigine().name(),
                        MailingTempo.iso(t.getAggiornatoIl() != null ? t.getAggiornatoIl() : t.getCreatoIl())))
                .toList();
    }

    @Transactional(readOnly = true)
    public MailingDto.Template dettaglio(long id) {
        return dto(trova(id));
    }

    @Transactional
    public MailingDto.Template crea(MailingDto.TemplateInput in, Long utenteId) {
        MailingTemplate t = new MailingTemplate();
        t.setOrigine(MailingTemplate.Origine.EDITOR);
        t.setCreatoDaUtenteId(utenteId);
        t.setCreatoIl(MailingTempo.adesso());
        applica(t, in);
        return dto(repository.save(t));
    }

    @Transactional
    public MailingDto.Template aggiorna(long id, MailingDto.TemplateInput in) {
        MailingTemplate t = trova(id);
        applica(t, in);
        t.setAggiornatoIl(MailingTempo.adesso());
        return dto(repository.save(t));
    }

    @Transactional
    public MailingDto.Template elimina(long id) {
        MailingTemplate t = trova(id);
        MailingDto.Template dto = dto(t);
        repository.delete(t);
        return dto;
    }

    private void applica(MailingTemplate t, MailingDto.TemplateInput in) {
        if (in == null) {
            throw new IllegalArgumentException("Dati del template mancanti");
        }
        String nome = in.nome() != null ? in.nome().trim() : "";
        if (nome.isEmpty() || nome.length() > 160) {
            throw new IllegalArgumentException("Il nome del template è obbligatorio (massimo 160 caratteri)");
        }
        t.setNome(nome);
        t.setCategoria(StringUtils.hasText(in.categoria()) ? tronca(in.categoria().trim(), 60) : null);
        if (in.design() != null && !in.design().isNull()) {
            t.setDesign(in.design().toString());
        }
        if (in.html() != null) {
            t.setHtml(in.html());
        }
        if (!StringUtils.hasText(t.getHtml())) {
            throw new IllegalArgumentException("Il template è vuoto");
        }
    }

    private MailingTemplate trova(long id) {
        return repository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Template non trovato"));
    }

    private MailingDto.Template dto(MailingTemplate t) {
        return new MailingDto.Template(t.getId(), t.getNome(), t.getCategoria(), t.getOrigine().name(), json(t.getDesign()),
                t.getHtml(), MailingTempo.iso(t.getAggiornatoIl() != null ? t.getAggiornatoIl() : t.getCreatoIl()));
    }

    private JsonNode json(String s) {
        if (!StringUtils.hasText(s)) {
            return null;
        }
        try {
            return objectMapper.readTree(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static String tronca(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
