import express from 'express';
import nodemailer from 'nodemailer';

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Config desde variables de entorno ── */
const {
  GEMINI_API_KEY,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
  AIRTABLE_TOKEN, AIRTABLE_BASE, AIRTABLE_TABLE,
  AETHER_NOTIFY_TO,
} = process.env;

/* ── Transporter SMTP (Hostinger) ── */
const transporter = nodemailer.createTransport({
  host:   SMTP_HOST,
  port:   Number(SMTP_PORT) || 465,
  secure: (Number(SMTP_PORT) || 465) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  tls: { rejectUnauthorized: true },
});

/* ── Middleware ── */
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ══════════════════════════════════════════════════
   POST /contact
   ══════════════════════════════════════════════════ */
app.post('/contact', async (req, res) => {
  const { nombre, empresa, sector, email, servicios, mensaje, recordId } = req.body ?? {};

  if (!nombre || !email || !sector) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  /* 1 — Gemini: puntúa el lead y genera el email */
  const gemini   = await callGemini(nombre, empresa, sector, servicios, mensaje);
  const score    = gemini?.evaluacion?.score ?? 5;
  const nivel    = gemini?.evaluacion?.nivel ?? 'Medio';
  const razon    = gemini?.evaluacion?.razon ?? '';
  const emailHtml = gemini?.email_html ?? emailFallback(nombre);

  /* 2 — Actualiza Airtable con la evaluación */
  if (recordId) await patchAirtable(recordId, score, nivel, razon);

  /* 3 — Envío de correos en paralelo */
  const [clientResult, aetherResult] = await Promise.allSettled([
    sendEmail(email, nombre, 'Hemos recibido tu solicitud – Aether Labs', emailHtml),
    sendEmail(
      AETHER_NOTIFY_TO, 'Aether Labs',
      `Nueva solicitud: ${empresa} (${nombre}) — Nivel ${nivel} [${score}/10]`,
      buildNotifEmail(nombre, empresa, sector, email, servicios, mensaje, score, nivel, razon)
    ),
  ]);

  res.json({
    ok:          true,
    score,
    nivel,
    sentClient:  clientResult.status  === 'fulfilled',
    sentAether:  aetherResult.status  === 'fulfilled',
  });
});

/* ── Health check ── */
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Aether Contact API · Puerto ${PORT}`));


/* ══════════════════════════════════════════════════
   FUNCIONES
   ══════════════════════════════════════════════════ */

async function callGemini(nombre, empresa, sector, servicios, mensaje) {
  const prompt = `
Eres el sistema de análisis de leads de Aether Labs, empresa B2B especializada en automatización de procesos y soluciones web a medida para empresas.

Analiza la solicitud de contacto y devuelve un JSON con exactamente dos campos raíz:
1. "evaluacion": objeto con "score" (entero 1-10), "nivel" ("Bajo"|"Medio"|"Alto"|"Crítico") y "razon" (1-2 frases explicando la puntuación)
2. "email_html": string con el HTML completo del correo de confirmación para el cliente

CRITERIOS DE PUNTUACIÓN:
- Sector de alto valor (finanzas, banca, seguros, logística, transporte, industria, manufactura, construcción, salud, farmacéutico, energía) → +3
- Sector medio (retail, hostelería, consultoría, servicios profesionales, tecnología, inmobiliaria) → +2
- Sector bajo (educación, ONG, sector público, autónomo, startup pequeña) → +1
- Automatización de Procesos entre los servicios solicitados → +2
- Soluciones Web a Medida entre los servicios → +1
- Tres o más servicios seleccionados → +2
- Mensaje adicional detallado (más de 60 caracteres) → +1
- Puntuación máxima: 10. Niveles: 1-3 Bajo, 4-6 Medio, 7-8 Alto, 9-10 Crítico.

EMAIL DE CONFIRMACIÓN (email_html):
- Español, tono profesional pero cercano
- Saludo personalizado con el nombre: ${nombre}
- Confirmar recepción y que se está analizando la solicitud
- Indicar que en las próximas 48 horas el equipo contactará
- Cerrar firmando como "El equipo de Aether Labs"
- HTML limpio compatible con clientes de correo: contenedor max 600px, fondo #FFFFFF, texto #1a1a2e, acento #5A6CF5, fuente Arial sans-serif, sin imágenes externas

DATOS:
Nombre: ${nombre}
Empresa: ${empresa}
Sector: ${sector}
Servicios: ${servicios}
Mensaje: ${mensaje}

Devuelve ÚNICAMENTE el JSON válido, sin bloques de código, sin texto extra.
`.trim();

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents:         [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.35 },
        }),
      }
    );

    const data = await res.json();
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('Gemini error:', err.message);
    return null;
  }
}


async function patchAirtable(recordId, score, nivel, razon) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(AIRTABLE_TABLE)}/${recordId}`;
  try {
    await fetch(url, {
      method:  'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ fields: {
        'Puntuación': score,
        'Nivel':      nivel,
        'Evaluación': razon,
      }}),
    });
  } catch (err) {
    console.error('Airtable patch error:', err.message);
  }
}


async function sendEmail(to, toName, subject, html) {
  await transporter.sendMail({
    from:    `"Aether Labs" <${SMTP_USER}>`,
    to:      `"${toName}" <${to}>`,
    subject,
    html,
  });
}


function buildNotifEmail(nombre, empresa, sector, email, servicios, mensaje, score, nivel, razon) {
  const colores = { Crítico: '#e53e3e', Alto: '#dd6b20', Medio: '#5A6CF5', Bajo: '#888888' };
  const nivelColor = colores[nivel] ?? '#888888';
  const barras = '█'.repeat(score) + '░'.repeat(10 - score);
  const mensajeHtml = mensaje || '<em style="color:#999">Sin mensaje adicional</em>';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.12);">

  <div style="background:#07070E;padding:28px 32px 24px;text-align:center;">
    <p style="margin:0 0 6px;color:#8888A8;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Aether Labs · Nuevo lead</p>
    <h1 style="margin:0;color:#F2F2FF;font-size:20px;font-weight:700;">Nueva solicitud de contacto</h1>
    <div style="display:inline-block;margin-top:14px;background:${nivelColor};color:#fff;padding:5px 18px;border-radius:20px;font-size:13px;font-weight:700;">
      Nivel ${nivel} &nbsp;·&nbsp; ${score}/10
    </div>
  </div>

  <div style="background:#0d0d1a;padding:14px 32px;text-align:center;">
    <span style="font-family:monospace;font-size:18px;color:${nivelColor};letter-spacing:1px;">${barras}</span>
  </div>

  <div style="padding:20px 32px 0;">
    <div style="background:#f5f5ff;border-left:4px solid #5A6CF5;padding:12px 16px;border-radius:4px;">
      <p style="margin:0;font-size:13px;color:#444;line-height:1.6;font-style:italic;">${razon}</p>
    </div>
  </div>

  <div style="padding:20px 32px 24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#888;width:32%;font-weight:600;">Nombre</td><td style="padding:10px 0;color:#1a1a2e;">${nombre}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#888;font-weight:600;">Empresa</td><td style="padding:10px 0;color:#1a1a2e;">${empresa}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#888;font-weight:600;">Sector</td><td style="padding:10px 0;color:#1a1a2e;">${sector}</td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#888;font-weight:600;">Email</td><td style="padding:10px 0;"><a href="mailto:${email}" style="color:#5A6CF5;text-decoration:none;">${email}</a></td></tr>
      <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 0;color:#888;font-weight:600;">Servicios</td><td style="padding:10px 0;color:#1a1a2e;">${servicios}</td></tr>
      <tr><td style="padding:10px 0;color:#888;font-weight:600;vertical-align:top;">Mensaje</td><td style="padding:10px 0;color:#1a1a2e;line-height:1.6;">${mensajeHtml}</td></tr>
    </table>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://airtable.com/${AIRTABLE_BASE}" style="display:inline-block;background:#5A6CF5;color:#fff;padding:13px 32px;border-radius:7px;text-decoration:none;font-weight:700;font-size:14px;">Ver en Airtable →</a>
    </div>
  </div>

  <div style="background:#f5f5f5;padding:12px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#aaa;">Aether Labs · Sistema de notificaciones automáticas</p>
  </div>
</div>
</body></html>`;
}


function emailFallback(nombre) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:32px;background:#fff;font-family:Arial,sans-serif;color:#1a1a2e;">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="color:#5A6CF5;">Hemos recibido tu solicitud</h2>
    <p>Hola <strong>${nombre}</strong>,</p>
    <p>Gracias por contactar con Aether Labs. Hemos recibido tu solicitud y ya la estamos analizando.</p>
    <p>En las próximas <strong>48 horas</strong> uno de nuestros especialistas se pondrá en contacto contigo.</p>
    <p style="margin-top:28px;">Un saludo,<br><strong>El equipo de Aether Labs</strong></p>
  </div>
</body></html>`;
}
