package it.edodoc.hq.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.time.Duration;
import java.util.Date;

@Component
public class JwtUtil {

    private final Key chiave;
    private final Duration durataAdmin;
    private final Duration durataPaziente;

    public JwtUtil(@Value("${jwt.secret:}") String segreto,
                   @Value("${jwt.ore-validita.admin:12}") long oreAdmin,
                   @Value("${jwt.ore-validita.paziente:12}") long orePaziente) {
        byte[] byteSegreto = (segreto == null ? "" : segreto.trim()).getBytes(StandardCharsets.UTF_8);
        if (byteSegreto.length < 32) {
            throw new IllegalStateException("JWT_SECRET obbligatorio: almeno 32 caratteri");
        }
        this.chiave = Keys.hmacShaKeyFor(byteSegreto);
        this.durataAdmin = Duration.ofHours(oreAdmin);
        this.durataPaziente = Duration.ofHours(orePaziente);
    }

    public String generaToken(String username, boolean paziente) {
        long ora = System.currentTimeMillis();
        Duration durata = paziente ? durataPaziente : durataAdmin;
        return Jwts.builder()
                .setSubject(username)
                .setIssuedAt(new Date(ora))
                .setExpiration(new Date(ora + durata.toMillis()))
                .signWith(chiave, SignatureAlgorithm.HS256)
                .compact();
    }

    /** Username del token, oppure null se scaduto o non valido. */
    public String usernameDa(String token) {
        try {
            Claims claims = Jwts.parserBuilder().setSigningKey(chiave).build().parseClaimsJws(token).getBody();
            return claims.getSubject();
        } catch (JwtException | IllegalArgumentException e) {
            return null;
        }
    }
}
