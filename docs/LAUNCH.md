# Lanzamiento de Bellum Gentium

Checklist para pasar de «funciona en mi ordenador» a «anunciado en Telegram».
Tiempo estimado: una tarde. Coste fijo: 0–7 USD/mes de servidor.

## 1. Servidor (30 min)

Elige un servicio con HTTPS y disco persistente. Todos aceptan el `Dockerfile`
del repositorio tal cual:

| Servicio | Notas |
|---|---|
| **Railway** | Nuevo proyecto → *Deploy from GitHub* → añade un *Volume* montado en `/data`. |
| **Render** | *New Web Service* → Docker → añade un *Disk* en `/data` (plan de pago; el gratuito se duerme y borra el disco). |
| **Fly.io** | `fly launch` (detecta el Dockerfile) y `fly volumes create data` montado en `/data`. |
| **VPS** (Hetzner, DigitalOcean…) | `docker run -d --restart=always -p 8787:8787 --env-file .env -v gentium-data:/data bellum-gentium` detrás de Caddy (HTTPS automático). |

Variables (ver [`.env.example`](../.env.example)); genera cada secreto con
`openssl rand -hex 32`:

- [ ] `NODE_ENV=production` (el servidor se niega a arrancar sin los secretos)
- [ ] `ADMIN_TOKEN`, `SESSION_SECRET`, `TELEGRAM_WEBHOOK_SECRET`
- [ ] `DATA_DIR=/data` en un volumen persistente
- [ ] `REQUIRE_AUTH=1`, `TRUST_PROXY=1` (si hay proxy delante, casi siempre)
- [ ] `TELEGRAM_BOT_TOKEN`, `PUBLIC_URL`
- [ ] `DAILY_SPONSOR_POOL` (0 al principio: premio «gloria y título de Fundador»)

Comprobación: `https://tu-dominio/api/health` devuelve `{"ok":true}` y la
portada carga el juego.

## 2. Telegram (15 min)

- [ ] Bot creado en @BotFather (`/newbot`), con foto de perfil (usa la imagen principal).
- [ ] Mini App registrada (`/newapp`) con la URL HTTPS → `TELEGRAM_APP_LINK`.
- [ ] `npm run telegram:setup` (comandos, descripción, botón «Jugar» y webhook).
- [ ] Envía `/start` al bot: debe responder con el botón y abrir el juego logueado.
- [ ] Canal creado, bot como administrador → `TELEGRAM_CHANNEL`; reinicia el servidor.
- [ ] `npm run telegram:setup -- --status` sin `last_error_message`.

## 3. Prueba completa (15 min, desde el móvil)

- [ ] Tutorial completo desde Telegram.
- [ ] Misión «Emboscada en el Vado»: el botín aparece y sigue tras cerrar y abrir.
- [ ] Abrir un Sobre de Guerra con Fichas Extrañas.
- [ ] Con una segunda cuenta de Telegram: vender una carta en el mercado y comprarla con la otra.
- [ ] Inscribirse en la arena; `/torneo` en el bot muestra la inscripción.
- [ ] Cerrar un torneo de prueba y descargar el CSV de pagos:

```bash
curl -X POST https://tu-dominio/api/tournaments -H "authorization: Bearer $ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"id":"prueba-1","name":"Prueba","closesAt":"2030-01-01T00:00:00Z"}'
curl -X POST https://tu-dominio/api/tournaments/prueba-1/close -H "authorization: Bearer $ADMIN_TOKEN"
curl https://tu-dominio/api/tournaments/prueba-1/payouts.csv -H "authorization: Bearer $ADMIN_TOKEN"
```

## 4. Anuncio (5 min)

```bash
npm run telegram:announce -- --launch --dry-run   # revisa el texto
npm run telegram:announce -- --launch --pin       # publícalo y fíjalo
```

Después, comparte el enlace del canal en las comunidades del plan de
[MARKETING.md](MARKETING.md). La arena diaria, el recordatorio de cierre y los
resultados se publican solos cada día.

## 5. Día a día

| Tarea | Cómo |
|---|---|
| Copia de seguridad | Copia la carpeta `/data` (tres JSON). Un cron diario basta en esta fase. |
| Pagar premios | CSV de pagos del torneo cerrado → pagos manuales en USDC → publica los enlaces de las transacciones en el canal. |
| Actualizar el juego | `git push` → CI en verde → el servicio redepliega; los datos del volumen se conservan. |
| Vigilar | Logs del servicio (arenas abiertas y cerradas, errores de Telegram) y `telegram:setup -- --status`. |

## Límites conocidos de esta fase

- Los datos viven en JSON en disco: bien hasta unos miles de jugadores; después, Postgres.
- Un solo proceso de servidor (no escalar a varias réplicas con el mismo volumen).
- Torneos de pago y objetos on-chain **desactivados**: requieren verificador de pagos,
  auditoría del contrato y revisión legal (ver [GDD.md](GDD.md)).
- En la Mini App no se vende nada por dinero: si algún día se venden cosméticos,
  deben cobrarse con Telegram Stars (ver [TELEGRAM.md](TELEGRAM.md)).
