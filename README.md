# Bellum Gentium

Juego de estrategia por turnos con torneos de habilidad y premios en USDC.
Eliges una de **5 razas** (Humanos, Elfos, Orcos, No-muertos, Enanos), armas un
ejército con 12 de oro, preparas hasta 3 **cartas de acción** (de comunes a
legendarias) y la batalla se resuelve sola de forma **determinista**: sin azar,
auditable y sin puntuaciones que falsificar. Las **armaduras** son cosméticas y,
como las cartas, se pueden vender como objetos del juego (ERC-1155).

Incluye música y efectos de sonido sintetizados, un tutorial guiado de la
primera batalla y funciona como **Mini App de Telegram**.

- Diseño, economía, aspectos legales y hoja de ruta: [docs/GDD.md](docs/GDD.md)
- Publicar en Telegram: [docs/TELEGRAM.md](docs/TELEGRAM.md)
- Plan de lanzamiento de prueba, marketing y premios: [docs/MARKETING.md](docs/MARKETING.md)

## Estructura

| Carpeta | Qué es |
|---|---|
| `packages/engine` | Motor en TypeScript: reglas, razas, cartas, cosméticos, simulación, torneo todos contra todos y reparto de premios |
| `apps/server` | API HTTP (Node sin framework): torneos con ejércitos ocultos, cierre, clasificación, repeticiones, login de Telegram y servidor del cliente compilado |
| `apps/web` | Cliente web (Vite + canvas): sprites procedurales, efectos de batalla, sonido, tutorial, cartas, armería, torneos e integración con Telegram |
| `tools/art` | Generador de ilustraciones con IA (cartas, retratos de raza e imagen principal) |
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
y `npm run build:web && node --env-file=.env apps/server/src/main.ts`.

## Ilustraciones con IA

El juego trae arte vectorial propio y usa ilustraciones generadas cuando existen
(`apps/web/public/art/manifest.json`). Para generarlas con tu clave:

```bash
npm run art -- --dry-run                               # ver prompts y coste estimado
OPENAI_API_KEY=sk-... npm run art                      # gpt-image-1
REPLICATE_API_TOKEN=r8_... npm run art -- --provider replicate   # Flux 1.1 Pro
npm run art -- --only cards/meteor,races --force       # regenerar algunas
```

Son 22 imágenes (16 cartas, 5 retratos de raza y la imagen principal), unos
4–5 USD con gpt-image-1 en calidad alta. Revisa las condiciones de uso del
proveedor antes de vender objetos con ese arte y deja claro que es arte generado
con IA.

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
npm test                 # motor, API, login de Telegram y generador de arte (node:test)
npm run typecheck
node packages/engine/scripts/balance.ts   # informe de balance
cd contracts && forge test                # contratos (usa OpenZeppelin de node_modules)
```

## Estado

Es un prototipo (fase 0). Antes de manejar dinero real faltan:

- wallet embebida para la web (el login de Telegram ya está hecho);
- base de datos en vez de memoria y archivo JSON;
- verificador de pagos on-chain (`verifyEntryPayment`);
- auditoría del contrato;
- revisión legal por jurisdicción.

Los torneos de pago están **desactivados por defecto**: sin verificador, la API
rechaza las inscripciones.
