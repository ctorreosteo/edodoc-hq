package it.edodoc.hq.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** Un token assente o non valido lascia la richiesta anonima: decide SecurityConfig se serve il login. */
public class JwtFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final CustomUserDetailsService userDetailsService;

    public JwtFilter(JwtUtil jwtUtil, CustomUserDetailsService userDetailsService) {
        this.jwtUtil = jwtUtil;
        this.userDetailsService = userDetailsService;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String username = jwtUtil.usernameDa(header.substring(7));
            if (username != null) {
                autentica(username);
            }
        }
        chain.doFilter(request, response);
    }

    private void autentica(String username) {
        try {
            UtenteDetails utente = userDetailsService.loadUserByUsername(username);
            if (utente.isEnabled()) {
                SecurityContextHolder.getContext().setAuthentication(
                        new UsernamePasswordAuthenticationToken(utente, null, utente.getAuthorities()));
            }
        } catch (UsernameNotFoundException e) {
            SecurityContextHolder.clearContext();
        }
    }
}
