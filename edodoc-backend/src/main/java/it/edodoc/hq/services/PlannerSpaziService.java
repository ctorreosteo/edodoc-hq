package it.edodoc.hq.services;

import it.edodoc.hq.dto.PlannerDto;
import it.edodoc.hq.models.PlannerAccount;
import it.edodoc.hq.models.PlannerBrand;
import it.edodoc.hq.repositories.PlannerAccountRepository;
import it.edodoc.hq.repositories.PlannerBrandRepository;
import it.edodoc.hq.repositories.PlannerPostRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Spazi di lavoro del Planner social («EdoDoc», …): ognuno con i suoi account e i suoi post.
 * Lo spazio predefinito non si elimina e raccoglie gli account integrati non assegnati.
 */
@Service
public class PlannerSpaziService {

    private final PlannerBrandRepository brandRepository;
    private final PlannerAccountRepository accountRepository;
    private final PlannerPostRepository postRepository;
    private final PlannerDestinazioniService destinazioni;
    private final PlannerTiktokClient tiktok;

    public PlannerSpaziService(PlannerBrandRepository brandRepository, PlannerAccountRepository accountRepository,
                               PlannerPostRepository postRepository, PlannerDestinazioniService destinazioni,
                               PlannerTiktokClient tiktok) {
        this.brandRepository = brandRepository;
        this.accountRepository = accountRepository;
        this.postRepository = postRepository;
        this.destinazioni = destinazioni;
        this.tiktok = tiktok;
    }

    /** Lo spazio chiesto; null o inesistente = il predefinito (creato se manca). */
    @Transactional
    public PlannerBrand risolvi(Long id) {
        List<PlannerBrand> tutti = brandRepository.findAllByOrderByPosizioneAscIdAsc();
        if (id != null) {
            Optional<PlannerBrand> b = tutti.stream().filter(x -> x.getId().equals(id)).findFirst();
            if (b.isPresent()) {
                return b.get();
            }
        }
        return tutti.stream().filter(PlannerBrand::isPredefinito).findFirst()
                .orElseGet(() -> tutti.isEmpty()
                        ? brandRepository.save(PlannerBrand.builder().nome("EdoDoc").colore("#19c463")
                        .predefinito(true).posizione(1).creatoIl(LocalDateTime.now()).build())
                        : tutti.get(0));
    }

    @Transactional(readOnly = true)
    public List<PlannerDto.Spazio> spazi() {
        List<PlannerAccount> account = accountRepository.findAllByOrderByIdAsc();
        return brandRepository.findAllByOrderByPosizioneAscIdAsc().stream().map(b -> new PlannerDto.Spazio(
                b.getId(), b.getNome(), b.getColore(), b.getDescrizione(), b.isPredefinito(), b.getPosizione(),
                account.stream().filter(a -> a.getBrandId().equals(b.getId())).map(this::dto).toList())).toList();
    }

    @Transactional
    public PlannerDto.Spazio crea(PlannerDto.SpazioRequest req) {
        PlannerBrand b = new PlannerBrand();
        applica(b, req);
        b.setPosizione(brandRepository.findAllByOrderByPosizioneAscIdAsc().stream()
                .mapToInt(PlannerBrand::getPosizione).max().orElse(0) + 1);
        b.setCreatoIl(LocalDateTime.now());
        b = brandRepository.save(b);
        return new PlannerDto.Spazio(b.getId(), b.getNome(), b.getColore(), b.getDescrizione(), false, b.getPosizione(), List.of());
    }

    @Transactional
    public void aggiorna(Long id, PlannerDto.SpazioRequest req) {
        PlannerBrand b = brandRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Spazio non trovato."));
        applica(b, req);
        brandRepository.save(b);
    }

    @Transactional
    public void elimina(Long id) {
        PlannerBrand b = brandRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Spazio non trovato."));
        if (b.isPredefinito()) {
            throw new IllegalArgumentException("Lo spazio predefinito non si elimina.");
        }
        if (postRepository.existsByBrandId(id)) {
            throw new IllegalArgumentException("Lo spazio ha dei post: eliminali o spostali prima.");
        }
        accountRepository.findByBrandIdOrderByIdAsc(id).stream()
                .filter(a -> PlannerAccount.TIPO_OAUTH.equals(a.getTipo()))
                .forEach(tiktok::revoca);
        brandRepository.delete(b);
        destinazioni.invalida();
    }

    /** Sposta un account integrato (pagina Meta, YouTube, scheda Google) in uno spazio. */
    @Transactional
    public void assegna(PlannerDto.AssegnaRequest req) {
        String canale = PlannerCanali.canale(req.canale());
        String account = StringUtils.hasText(req.account()) ? req.account().trim() : null;
        boolean esiste = destinazioni.integratiConSpazio().stream()
                .anyMatch(a -> a.canale().equals(canale) && java.util.Objects.equals(a.account(), account));
        if (!esiste) {
            throw new IllegalArgumentException("Account non collegato al gestionale.");
        }
        PlannerBrand b = brandRepository.findById(req.brandId())
                .orElseThrow(() -> new IllegalArgumentException("Spazio non trovato."));
        Optional<PlannerAccount> riga = accountRepository.findByCanaleAndTipo(canale, PlannerAccount.TIPO_INTEGRATO).stream()
                .filter(a -> java.util.Objects.equals(a.getAccount(), account)).findFirst();
        PlannerDto.AccountIntegrato info = destinazioni.integratiConSpazio().stream()
                .filter(a -> a.canale().equals(canale) && java.util.Objects.equals(a.account(), account)).findFirst().orElseThrow();
        PlannerAccount a = riga.orElseGet(() -> PlannerAccount.builder().canale(canale).tipo(PlannerAccount.TIPO_INTEGRATO)
                .account(account).creatoIl(LocalDateTime.now()).build());
        a.setBrandId(b.getId());
        a.setNome(PlannerUtenti.tronca(info.nome() == null ? PlannerCanali.nome(canale) : info.nome(), 200));
        a.setDettaglio(info.dettaglio());
        a.setImmagine(info.immagine());
        accountRepository.save(a);
    }

    /** Profilo da pubblicare a mano (es. LinkedIn personale): compare fra le destinazioni dello spazio. */
    @Transactional
    public PlannerDto.AccountSpazio creaManuale(Long brandId, PlannerDto.AccountManualeRequest req) {
        PlannerBrand b = brandRepository.findById(brandId).orElseThrow(() -> new IllegalArgumentException("Spazio non trovato."));
        String canale = PlannerCanali.canale(req.canale());
        if (!StringUtils.hasText(req.nome())) {
            throw new IllegalArgumentException("Dai un nome al profilo.");
        }
        String url = StringUtils.hasText(req.urlProfilo()) ? req.urlProfilo().trim() : null;
        if (url != null && !url.matches("(?i)^https?://\\S+$")) {
            throw new IllegalArgumentException("Il link al profilo deve iniziare con http:// o https://.");
        }
        return dto(accountRepository.save(PlannerAccount.builder()
                .brandId(b.getId()).canale(canale).tipo(PlannerAccount.TIPO_MANUALE)
                .nome(PlannerUtenti.tronca(req.nome(), 200))
                .dettaglio(StringUtils.hasText(req.dettaglio()) ? PlannerUtenti.tronca(req.dettaglio(), 200) : null)
                .urlProfilo(url).creatoIl(LocalDateTime.now()).build()));
    }

    /** Toglie un account dallo spazio: TikTok si scollega (token revocato), un integrato torna nel predefinito. */
    @Transactional
    public void eliminaAccount(Long id) {
        PlannerAccount a = accountRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Account non trovato."));
        if (PlannerAccount.TIPO_OAUTH.equals(a.getTipo())) {
            tiktok.revoca(a);
        }
        accountRepository.delete(a);
    }

    @Transactional(readOnly = true)
    public PlannerAccount accountTiktok(String openId) {
        return accountRepository.findByCanaleAndTipo(PlannerCanali.TIKTOK, PlannerAccount.TIPO_OAUTH).stream()
                .filter(a -> a.getAccount() != null && a.getAccount().equals(openId))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Account TikTok non collegato."));
    }

    private static void applica(PlannerBrand b, PlannerDto.SpazioRequest req) {
        if (req == null || !StringUtils.hasText(req.nome())) {
            throw new IllegalArgumentException("Dai un nome allo spazio.");
        }
        String colore = req.colore() == null ? "" : req.colore().trim();
        if (!colore.matches("^#[0-9a-fA-F]{6}$")) {
            throw new IllegalArgumentException("Colore non valido.");
        }
        b.setNome(PlannerUtenti.tronca(req.nome(), 80));
        b.setColore(colore.toLowerCase(Locale.ROOT));
        b.setDescrizione(StringUtils.hasText(req.descrizione()) ? PlannerUtenti.tronca(req.descrizione(), 300) : null);
    }

    private PlannerDto.AccountSpazio dto(PlannerAccount a) {
        boolean collegato = !PlannerAccount.TIPO_OAUTH.equals(a.getTipo()) || tiktok.collegato(a);
        return new PlannerDto.AccountSpazio(a.getId(), a.getCanale(), a.getTipo(),
                PlannerAccount.TIPO_MANUALE.equals(a.getTipo()) ? "m" + a.getId() : a.getAccount(),
                a.getNome(), a.getDettaglio(), a.getImmagine(), a.getUrlProfilo(), collegato,
                PlannerCanali.iso(a.getRefreshScadeIl()));
    }
}
