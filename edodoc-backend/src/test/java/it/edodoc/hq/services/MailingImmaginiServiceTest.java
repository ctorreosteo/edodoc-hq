package it.edodoc.hq.services;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class MailingImmaginiServiceTest {

    private static byte[] png(int w, int h) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB), "png", out);
        return out.toByteArray();
    }

    @Test
    void tipoDaiPrimiByte() throws Exception {
        assertEquals("image/png", MailingImmaginiService.tipo(png(2, 2)));
        assertEquals("image/jpeg", MailingImmaginiService.tipo(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0}));
        assertEquals("image/gif", MailingImmaginiService.tipo("GIF89a....".getBytes()));
        assertEquals("image/webp", MailingImmaginiService.tipo("RIFF\0\0\0\0WEBPVP8 ".getBytes()));
        assertNull(MailingImmaginiService.tipo("<svg xmlns=...>".getBytes()));
        assertNull(MailingImmaginiService.tipo("%PDF-1.7".getBytes()));
    }

    @Test
    void pngLargoRidimensionatoA1200() throws Exception {
        MailingImmaginiService.Elaborata e = MailingImmaginiService.elabora(png(2400, 600), "image/png");
        assertEquals(1200, e.larghezza());
        assertEquals(300, e.altezza());
        BufferedImage letta = ImageIO.read(new ByteArrayInputStream(e.dati()));
        assertEquals(1200, letta.getWidth());
    }

    @Test
    void pngPiccoloLasciatoComEra() throws Exception {
        byte[] originale = png(600, 400);
        MailingImmaginiService.Elaborata e = MailingImmaginiService.elabora(originale, "image/png");
        assertArrayEquals(originale, e.dati());
        assertEquals(600, e.larghezza());
    }

    @Test
    void gifAnimataIntattaConDimensioni() {
        // GIF 1x1 trasparente: anche se fosse animata, i byte restano identici.
        byte[] gif = Base64.getDecoder().decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
        MailingImmaginiService.Elaborata e = MailingImmaginiService.elabora(gif, "image/gif");
        assertArrayEquals(gif, e.dati());
        assertEquals(1, e.larghezza());
        assertEquals(1, e.altezza());
    }

    @Test
    void orientamentoExifRuotaLaFoto() {
        BufferedImage src = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
        BufferedImage r = MailingImmaginiService.orienta(src, 6, false);
        assertEquals(20, r.getWidth());
        assertEquals(40, r.getHeight());
        assertEquals(1, MailingImmaginiService.orientamentoExif(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xDA, 0, 2}));
    }
}
