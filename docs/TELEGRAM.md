# Bellum Gentium como Mini App de Telegram

El mismo cliente web funciona dentro de Telegram. Cuando se abre desde un bot:

- **Inicio de sesión automático:** el servidor verifica la firma de Telegram
  (`initData`) y emite una sesión propia. La identidad del jugador es
  `tg-<id de Telegram>`; nadie puede inscribirse con ese prefijo sin haber
  verificado su cuenta.
- **Botón principal nativo** «⚔ ¡A la batalla!» y **botón atrás** durante la
  batalla.
- **Vibración** en cargas, explosiones, cartas legendarias y al terminar.
- Colores oscuros en la cabecera y el fondo de Telegram, y la app a pantalla
  completa.

## 1. Crear el bot

1. Habla con [@BotFather](https://t.me/BotFather) y envía `/newbot`.
2. Guarda el token que te da: es `TELEGRAM_BOT_TOKEN`. **No lo subas nunca al
   repositorio.**

## 2. Publicar el juego con HTTPS

Telegram solo abre Mini Apps servidas por HTTPS. El servidor de Bellum Gentium sirve
la API y el cliente compilado desde el mismo dominio:

```bash
npm install
npm run build:web
cp .env.example .env        # y rellena los valores
node --env-file=.env apps/server/src/main.ts
```

Súbelo a cualquier servicio con HTTPS (Railway, Render, Fly.io, un VPS con
Caddy…). Para probar desde tu ordenador, un túnel temporal basta:

```bash
cloudflared tunnel --url http://localhost:8787
# o: ngrok http 8787
```

## 3. Registrar la Mini App

En BotFather, `/newapp` → elige el bot, pon título, descripción, una imagen de
640×360 y la URL HTTPS del paso anterior. Te dará un enlace
`https://t.me/<bot>/<nombre>`: es `TELEGRAM_APP_LINK` (los botones de los
anuncios del canal lo usan, porque en canales no se permiten botones Mini App).

## 4. Configuración automática del bot

Con las variables de `.env` rellenas, un solo comando deja el bot listo
(se puede repetir sin riesgo):

```bash
npm run telegram:setup -- --dry-run   # muestra lo que va a hacer
npm run telegram:setup                # lo aplica
npm run telegram:setup -- --status    # estado del webhook (errores, pendientes)
```

Hace esto por ti:

- registra los comandos `/jugar`, `/torneo` y `/ayuda`;
- pone la descripción larga (la que ve quien abre el bot por primera vez) y la corta (perfil y enlaces compartidos);
- pone el **botón de menú «Jugar»**, que abre la Mini App desde el chat;
- apunta el **webhook** a `PUBLIC_URL/api/telegram/webhook` con `TELEGRAM_WEBHOOK_SECRET`
  (el servidor rechaza cualquier llamada sin ese secreto).

Desde ese momento el bot responde solo:

| Mensaje | Respuesta |
|---|---|
| `/start`, `/jugar` o cualquier texto | Bienvenida con botón para abrir el juego |
| `/torneo` | La arena de hoy: premio, hora de cierre y botón para inscribirse |
| `/ayuda` | Cómo se juega en 5 pasos |

## 5. Canal y anuncios automáticos

1. Crea el canal (p. ej. `@bellumgentium`) y añade el bot como **administrador**
   con permiso para publicar y fijar mensajes.
2. Pon `TELEGRAM_CHANNEL=@bellumgentium` y reinicia el servidor.

El servidor publica solo, sin que tengas que hacer nada:

| Cuándo | Mensaje |
|---|---|
| Medianoche UTC | «⚔️ Arena diaria … está abierta» con premio y hora de cierre |
| 2 h antes del cierre | «⏳ Quedan 2 horas…» con los ejércitos inscritos |
| Al cerrar | Podio con medallas y premios (si nadie se inscribió, no publica nada) |

Para anuncios puntuales:

```bash
npm run telegram:announce -- --launch --dry-run    # vista previa del anuncio de lanzamiento
npm run telegram:announce -- --launch --pin        # publicarlo y fijarlo
npm run telegram:announce -- --arena               # volver a anunciar la arena de hoy
npm run telegram:announce -- --text "🐉 ¡Nueva incursión disponible!" --photo https://tu-dominio.com/art/scenes/keyart.webp
```

El texto admite el HTML de Telegram (`<b>`, `<i>`, `<a href>`).

## 6. Variables de entorno

| Variable | Para qué |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Verificar el `initData` y hablar con la Bot API. Sin él, el login está desactivado. |
| `PUBLIC_URL` | Dirección HTTPS del juego. Sin ella el bot no responde ni publica. |
| `TELEGRAM_WEBHOOK_SECRET` | Secreto que Telegram envía en cada webhook. Sin él, el webhook responde 503. |
| `TELEGRAM_CHANNEL` | Canal de anuncios automáticos (opcional). |
| `TELEGRAM_APP_LINK` | Enlace `t.me/<bot>/<app>` para los botones de los anuncios. |
| `SESSION_SECRET` | Firmar sesiones. Usa 32 bytes aleatorios; si cambia, todos deben volver a entrar. |
| `REQUIRE_AUTH=1` | Recomendado en producción: solo se inscriben en torneos jugadores de Telegram. |
| `ADMIN_TOKEN` | Crear y cerrar torneos por la API y descargar el CSV de pagos. |
| `DATA_DIR` | Carpeta de datos (torneos, perfiles y mercado). |
| `DAILY_SPONSOR_POOL` | Pozo diario patrocinado, en unidades mínimas de USDC. |
| `RATE_LIMIT`, `TRUST_PROXY` | Límite de peticiones por IP y si confiar en `X-Forwarded-For`. |

Lista completa y comentada en [`.env.example`](../.env.example); pasos del
lanzamiento en [LAUNCH.md](LAUNCH.md).

## 7. Normas de Telegram que afectan al modelo de negocio

Revisa las [normas vigentes para Mini Apps](https://core.telegram.org/bots/webapps)
antes de lanzar, porque cambian a menudo. A fecha de este documento:

- **Bienes digitales** (cosméticos, pase de temporada…) vendidos dentro de la
  Mini App deben pagarse con **Telegram Stars**.
- **Funciones de blockchain** dentro de Mini Apps deben usar **TON** (wallets
  vía TON Connect). Eso choca con el plan de premios en USDC sobre Base.

Opciones para la versión de Telegram:

1. **Telegram como canal de adquisición gratuito** (recomendado para empezar):
   práctica, campaña, arena con premios patrocinados pagados fuera de la Mini
   App y mercado entre jugadores **solo con Oro de guerra** (moneda del juego,
   sin valor en dinero). Los torneos de pago y los objetos on-chain siguen en la web.
2. **Adaptar la capa on-chain a TON** (USDT en TON, objetos como NFT de TON).
   Implica reescribir los contratos (FunC/Tact) y auditarlos de nuevo.

## 8. Seguridad

- El servidor **nunca** confía en `initDataUnsafe`: solo en `initData` con
  firma válida y de menos de 24 horas.
- La sesión va en `Authorization: Bearer …` y el servidor ignora cualquier
  `playerId` del cuerpo cuando hay sesión.
- El token del bot y `SESSION_SECRET` son secretos: van en variables de
  entorno, no en el código.
- El webhook exige `X-Telegram-Bot-Api-Secret-Token` (comparación en tiempo
  constante) y solo responde a chats privados.
- Progresión en el servidor: el cliente envía intenciones («juega esta
  misión con este ejército») y el servidor comprueba que tienes las cartas,
  simula la batalla y entrega el botín. Nadie puede fabricarse objetos.
- El mercado entre jugadores exige cuenta de Telegram (una persona, una
  cuenta) y guarda el objeto en custodia: no se puede vender dos veces.
