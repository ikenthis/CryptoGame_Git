# Bellum Gentium

Juego de estrategia por turnos con torneos de habilidad y premios en USDC.
Eliges una de **5 razas** (Humanos, Elfos, Orcos, No-muertos, Enanos) y un
**comandante** con habilidades propias, armas un ejército con 12 de oro,
preparas hasta 3 **cartas de acción** de ataque, defensa, efecto, curación o
invocación (de comunes a legendarias) y la batalla se resuelve sola de forma **determinista**: sin azar,
auditable y sin puntuaciones que falsificar. Las **armaduras** son cosméticas y,
como las cartas, se pueden vender como objetos del juego (ERC-1155).

Tiene **campaña** con misiones e **incursiones contra jefes** que dan
materiales y Fichas Extrañas, y un **Mercado Negro** con sobres, transmutación,
forja, un mercader diario y **mercado entre jugadores**. El servidor es la
autoridad sobre la colección: las misiones se simulan en el servidor y nadie
puede fabricarse objetos. Incluye música y efectos de sonido sintetizados, un tutorial guiado de la
primera batalla y funciona como **Mini App de Telegram**.

- Diseño, economía, aspectos legales y hoja de ruta: [docs/GDD.md](docs/GDD.md)
- Publicar en Telegram (bot, webhook y anuncios automáticos): [docs/TELEGRAM.md](docs/TELEGRAM.md)
- **Checklist de lanzamiento** (despliegue, Telegram, prueba y anuncio): [docs/LAUNCH.md](docs/LAUNCH.md)
- Plan de lanzamiento de prueba, marketing y premios: [docs/MARKETING.md](docs/MARKETING.md)

## Estructura

| Carpeta | Qué es |
|---|---|
| `packages/engine` | Motor en TypeScript: reglas, razas, cartas, cosméticos, simulación, torneo todos contra todos y reparto de premios |
| `apps/server` | API HTTP (Node sin framework): torneos con ejércitos ocultos, perfiles y progresión, mercado entre jugadores, login de Telegram e invitados, bot y anuncios de Telegram, límites por IP y servidor del cliente compilado |
| `apps/web` | Cliente web (Vite + canvas): sprites procedurales, efectos de batalla, sonido, tutorial, cartas, armería, torneos e integración con Telegram |
| `tools/art` | Generador de ilustraciones con IA (cartas, retratos de raza e imagen principal) |
| `tools/telegram` | Configuración del bot (`npm run telegram:setup`) y anuncios del canal (`npm run telegram:announce`) |
| `contracts` | `TournamentEscrow.sol` (escrow de entradas USDC) y `GentiumItems.sol` (cartas y armaduras ERC-1155 con suministro limitado y regalías), con Foundry |

## Arrancar en local

Requiere Node ≥ 22.18, que ejecuta TypeScript directamente.

```bash
npm install
ADMIN_TOKEN=dev npm run dev:server   # API en http://localhost:8787 (crea la arena diaria)
npm run dev:web                      # cliente en http://localhost:5173
```

Galería de sprites para arte: http://localhost:5173/galeria.html
(`?mode=armors&type=knight` muestra todas las armaduras de una unidad).

Demo sin servidor en un solo HTML (práctica, tutorial, cartas y armería), para
compartir: `npm run build:demo` → `apps/web/dist-demo/bellum-gentium.html`.

Premios: los jugadores pueden dejar una wallet (Base) al inscribirse; es
privada. Al cerrar un torneo, `GET /api/tournaments/<id>/payouts.csv` (con el
token de admin) da puesto, jugador, wallet e importe para pagar a mano.

Producción (API y cliente en un solo servidor): `cp .env.example .env`, rellenar
y `npm run build:web && node --env-file=.env apps/server/src/main.ts`, o con
Docker: `docker build -t bellum-gentium . && docker run -p 8787:8787 --env-file .env -v gentium-data:/data bellum-gentium`.
Pasos completos en [docs/LAUNCH.md](docs/LAUNCH.md).

## Ilustraciones con IA

El juego trae arte vectorial propio y usa ilustraciones generadas cuando existen
(`apps/web/public/art/manifest.json`). Para generarlas con tu clave:

```bash
npm run art -- --only units                            # sprites del tablero GRATIS (Pollinations, sin clave)
npm run art -- --dry-run                               # ver prompts y coste estimado
OPENAI_API_KEY=sk-... npm run art                      # gpt-image-1
REPLICATE_API_TOKEN=r8_... npm run art -- --provider replicate   # Flux 1.1 Pro
npm run art -- --only cards/meteor,races --force       # regenerar algunas
```

Los **sprites del tablero** (5 razas × 6 tropas + 10 comandantes) siguen el
estilo de [docs/art-reference.webp](docs/art-reference.webp): 2D pintado, figura
entera sobre fondo liso. El juego recorta el fondo al cargarlos y, si falta
alguno, dibuja la figura vectorial. Todas las imágenes se reducen y se guardan en
WebP (sprites a 256 px, unos 15–30 KB); `--keep-size` lo desactiva.
Con gpt-image-1 cuestan unos 0,20 USD cada una; con Pollinations, nada.
Revisa las condiciones de uso del proveedor antes de vender objetos con ese arte
y deja claro que es arte generado con IA.

Crear y cerrar un torneo a mano:

```bash
curl -X POST localhost:8787/api/tournaments -H 'authorization: Bearer dev' \
  -H 'content-type: application/json' \
  -d '{"id":"copa-1","name":"Copa 1","closesAt":"2030-01-01T00:00:00Z","sponsorPool":50000000}'
curl -X POST localhost:8787/api/tournaments/copa-1/close -H 'authorization: Bearer dev'
```

Los importes van en unidades mínimas de USDC (1 USDC = 1.000.000).

## Tests

```bash
npm test                 # motor, API, progresión, mercado, bot de Telegram y herramientas (node:test)
npm run typecheck
node packages/engine/scripts/balance.ts   # informe de balance
cd contracts && forge test                # contratos (usa OpenZeppelin de node_modules)
```

## Estado

Listo para un **lanzamiento gratuito** en Telegram: campaña, incursiones,
colección y mercado en el servidor, arena diaria con premios patrocinados
pagados a mano y anuncios automáticos. La integración continua
(`.github/workflows/ci.yml`) ejecuta tipos, tests, compilación y contratos.

Antes de manejar dinero de los jugadores faltan:

- wallet embebida para la web;
- base de datos en vez de archivos JSON (a partir de unos miles de jugadores);
- verificador de pagos on-chain (`verifyEntryPayment`);
- auditoría del contrato;
- revisión legal por jurisdicción.

Los torneos de pago están **desactivados por defecto**: sin verificador, la API
rechaza las inscripciones.
