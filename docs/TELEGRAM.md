# Bastión como Mini App de Telegram

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

Telegram solo abre Mini Apps servidas por HTTPS. El servidor de Bastión sirve
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

En BotFather:

- `/newapp` → elige el bot, pon título, descripción, una imagen de 640×360 y
  la URL HTTPS del paso anterior. Te dará un enlace `t.me/<bot>/<nombre>`.
- Opcional: `/mybots` → tu bot → *Bot Settings* → *Menu Button* con la misma
  URL, para que aparezca el botón «Jugar» en el chat.

## 4. Variables de entorno

| Variable | Para qué |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Verificar el `initData` de Telegram. Sin él, el login está desactivado. |
| `SESSION_SECRET` | Firmar sesiones. Usa 32 bytes aleatorios; si cambia, todos deben volver a entrar. |
| `REQUIRE_AUTH=1` | Recomendado en producción: solo se inscriben jugadores verificados. |
| `ADMIN_TOKEN` | Crear y cerrar torneos por la API. |
| `DATA_FILE` | Ruta del JSON de persistencia (hasta migrar a Postgres). |
| `DAILY_SPONSOR_POOL` | Pozo diario patrocinado, en unidades mínimas de USDC. |
| `PORT`, `WEB_DIST` | Puerto y carpeta del cliente compilado (por defecto `apps/web/dist`). |

## 5. Normas de Telegram que afectan al modelo de negocio

Revisa las [normas vigentes para Mini Apps](https://core.telegram.org/bots/webapps)
antes de lanzar, porque cambian a menudo. A fecha de este documento:

- **Bienes digitales** (cosméticos, pase de temporada…) vendidos dentro de la
  Mini App deben pagarse con **Telegram Stars**.
- **Funciones de blockchain** dentro de Mini Apps deben usar **TON** (wallets
  vía TON Connect). Eso choca con el plan de premios en USDC sobre Base.

Opciones para la versión de Telegram:

1. **Telegram como canal de adquisición gratuito** (recomendado para empezar):
   práctica, desafío diario y arena con premios patrocinados pagados fuera de
   la Mini App. Los torneos de pago y el mercado de objetos siguen en la web.
2. **Adaptar la capa on-chain a TON** (USDT en TON, objetos como NFT de TON).
   Implica reescribir los contratos (FunC/Tact) y auditarlos de nuevo.

## 6. Seguridad

- El servidor **nunca** confía en `initDataUnsafe`: solo en `initData` con
  firma válida y de menos de 24 horas.
- La sesión va en `Authorization: Bearer …` y el servidor ignora cualquier
  `playerId` del cuerpo cuando hay sesión.
- El token del bot y `SESSION_SECRET` son secretos: van en variables de
  entorno, no en el código.
