# Bastión

Juego de estrategia por turnos con torneos de habilidad y premios en USDC.
Eliges una de **5 razas** (Humanos, Elfos, Orcos, No-muertos, Enanos), armas un
ejército con 12 de oro, preparas hasta 3 **cartas de acción** (de comunes a
legendarias) y la batalla se resuelve sola de forma **determinista**: sin azar,
auditable y sin puntuaciones que falsificar. Las **armaduras** son cosméticas y,
como las cartas, se pueden vender como objetos del juego (ERC-1155).

Diseño completo, economía, aspectos legales y hoja de ruta: [docs/GDD.md](docs/GDD.md).

## Estructura

| Carpeta | Qué es |
|---|---|
| `packages/engine` | Motor en TypeScript: reglas, razas, cartas, cosméticos, simulación, torneo todos contra todos y reparto de premios |
| `apps/server` | API HTTP (Node sin framework): torneos con ejércitos ocultos, cierre, clasificación y repeticiones |
| `apps/web` | Cliente web (Vite + canvas): sprites procedurales por raza y armadura, efectos de batalla, cartas, armería y torneos |
| `contracts` | `TournamentEscrow.sol` (escrow de entradas USDC) y `BastionItems.sol` (cartas y armaduras ERC-1155 con suministro limitado y regalías), con Foundry |

## Arrancar en local

Requiere Node ≥ 22.18, que ejecuta TypeScript directamente.

```bash
npm install
ADMIN_TOKEN=dev npm run dev:server   # API en http://localhost:8787 (crea la arena diaria)
npm run dev:web                      # cliente en http://localhost:5173
```

Galería de sprites para arte: http://localhost:5173/galeria.html
(`?mode=armors&type=knight` muestra todas las armaduras de una unidad).

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
npm test                 # motor + API (node:test)
npm run typecheck
node packages/engine/scripts/balance.ts   # informe de balance
cd contracts && forge test                # contratos (usa OpenZeppelin de node_modules)
```

## Estado

Es un prototipo (fase 0). Antes de manejar dinero real faltan:

- identidad real de jugadores (login de Telegram o wallet embebida);
- base de datos en vez de memoria y archivo JSON;
- verificador de pagos on-chain (`verifyEntryPayment`);
- auditoría del contrato;
- revisión legal por jurisdicción.

Los torneos de pago están **desactivados por defecto**: sin verificador, la API
rechaza las inscripciones.
