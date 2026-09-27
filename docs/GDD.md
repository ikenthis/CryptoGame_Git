# Bastión: documento de diseño (GDD)

> Estrategia por turnos con torneos de habilidad y premios en USDC.
> Principio rector: **divertido primero, se gana después**. Ningún premio se paga
> con el dinero de jugadores nuevos.

## 1. Visión

Bastión es un juego de estrategia rápido: cada jugador arma un ejército con un
presupuesto limitado, lo coloca en su mitad del tablero y la batalla se resuelve
sola, de forma **determinista** (sin azar). La habilidad está en *qué* unidades
elegir y *dónde* colocarlas.

- **Partida de práctica:** unos 30 segundos, jugable en el navegador o en Telegram.
- **Torneos:** envías un ejército antes del cierre y juega contra el de todos los
  demás inscritos. Tu ejército queda oculto hasta el cierre, así que nadie puede
  copiarlo ni preparar un contraataque.

### Por qué este formato

| Necesidad | Cómo la cubre Bastión |
|---|---|
| Captar rápido | Se entiende en 10 segundos (elige, coloca, mira). Sin wallet para empezar. |
| Legal: habilidad, no azar | Motor sin aleatoriedad: el resultado depende solo de las decisiones. |
| Anti-trampas | El cliente nunca envía un resultado, solo el ejército. El servidor simula. |
| Transparencia | Motor abierto, ejércitos revelados al cierre y compromisos (hash) on-chain: cualquiera puede recalcular el torneo. |
| Asíncrono | No hace falta coincidir en horario: ideal para móvil y Telegram. |
| Compartible | Cada partida es una repetición reproducible: «mira cómo gané». |

## 2. Reglas (v0.1)

- Tablero de 8×6. Cada jugador despliega en sus 3 columnas propias.
- Presupuesto: **12 de oro**, máximo **6 unidades**.
- Hasta 40 turnos. En cada turno las unidades de ambos bandos actúan
  intercaladas y el bando que empieza alterna de un turno a otro.
- Cada unidad ataca al enemigo más cercano (desempata la menor vida). Si no lo
  alcanza, avanza por el camino libre más corto.
- **Victoria:** eliminar al rival. Si se agotan los turnos, gana quien conserve
  más valor (coste × % de vida restante).

| Unidad | Coste | Vida | Ataque | Alcance | Velocidad | Especial |
|---|---|---|---|---|---|---|
| Guerrero (G) | 2 | 10 | 3 | 1 | 1 | — |
| Arquero (A) | 3 | 6 | 3 | 3 | 1 | — |
| Caballero (C) | 4 | 12 | 3 | 1 | 2 | Armadura 1. Carga: +4 si se movió ese turno |
| Guardián (E) | 3 | 14 | 2 | 1 | 1 | Armadura 2 |
| Mago (M) | 4 | 6 | 3 | 2 | 1 | Ignora armadura. Salpica 2 a los enemigos pegados al objetivo |
| Sanador (S) | 3 | 7 | 0 | 2 | 1 | Cura 3 al aliado más herido |

La armadura resta daño, con un mínimo de 1 por golpe.

**Balance:** los números son un punto de partida. `node packages/engine/scripts/balance.ts`
enfrenta los ejércitos de referencia entre sí. Antes de cada temporada hay que
revisar que ninguna composición gane a todas. Con los números actuales, «Arcano»
y «Muralla» dominan y «Andanada» va floja: es el primer ajuste pendiente.

### Profundidad a largo plazo (post-MVP)

- **Modificadores por torneo:** presupuesto distinto, una unidad vetada,
  obstáculos en el mapa, niebla… Mantienen vivo el metajuego y evitan que una
  «solución» calculada domine para siempre.
- **Temporadas** con unidades nuevas. Siempre se desbloquean jugando, nunca
  pagando.
- **Habilidades de héroe** (una por ejército) para más identidad.

## 3. Modos de juego

1. **Práctica contra la IA** (gratis, sin premios). Se simula en el navegador
   con el mismo motor que el servidor. Sirve para aprender y para retener.
2. **Desafío diario** (gratis, sin premios): un ejército enemigo fijo; hay que
   ganarle con el menor coste. Da rachas, logros y algo que compartir.
3. **Arena diaria** (gratis, **con premio patrocinado**): todos contra todos,
   cierra a las 00:00 UTC y los 3 primeros se reparten el pozo patrocinado
   (50/30/20).
4. **Torneos con entrada** (1–5 USDC): pozo en escrow on-chain, comisión fija y
   visible (10%, con tope de 15% en el contrato).
5. **Ligas y temporadas:** ascensos y descensos semanales según resultados.

### Formato de torneo

- Todos contra todos, **dos partidas por pareja** (una en cada lado) para anular
  la ventaja de posición o de iniciativa. Victoria 3 puntos, empate 1.
- Desempates: margen de valor acumulado y, después, el orden de inscripción.
  Los empates exactos reparten el premio a partes iguales.
- Coste: N·(N−1) simulaciones. Con más de ~500 inscritos conviene pasar a rondas
  suizas o a grupos más una fase final.

## 4. Bucle de enganche (retención sin trucos)

- **Primeros 60 segundos:** un ejército sugerido ya colocado, pulsar «Simular»
  y ganar. Luego se reta al jugador a mejorarlo.
- **A diario:** desafío, arena, racha y un cofre de cosméticos por constancia.
- **Social:** enlace de reto («gana a mi ejército»), repeticiones compartibles,
  clanes con clasificación propia.
- **Visible:** pagos recientes con enlace a la transacción. La confianza también
  es marketing.
- **Distribución:** Telegram Mini App con login por Telegram y wallet embebida
  (Privy, thirdweb o Dynamic), más la web.

## 5. Economía

**Regla de oro:** los premios salen de ingresos externos (patrocinio, anuncios,
cosméticos, comisiones), **nunca** de los depósitos de otros jugadores.

| Fuente | Cómo | Notas |
|---|---|---|
| Comisión de torneos | 10% del pozo de entradas | Fija, pública y con tope en el contrato |
| Patrocinios | Marcas o proyectos financian arenas | Con su marca en el torneo |
| Cosméticos | Skins, estandartes, efectos (NFT opcional) | **Nunca** dan ventaja |
| Pase de temporada | Misiones y cosméticos extra | Sin ventaja competitiva |
| Anuncios recompensados | Solo en modos gratuitos | Opcional para el jugador |

### Ejemplo de cuentas (piloto)

- Arena diaria: pozo de 20 USDC al día, unos 600 USDC al mes. Se trata como
  coste de adquisición de usuarios y debe cubrirse con patrocinio y anuncios.
- Torneo de 1 USDC con 200 inscritos: pozo de 200, comisión de 20 y 180 en premios.
- Si 5.000 jugadores activos al mes generan 3 torneos de pago diarios de 200
  inscritos, la comisión da unos 1.800 USDC al mes, más cosméticos.

### Lo que NO haremos

- Token propio con preventa ni promesas de rentabilidad.
- NFT obligatorio para jugar.
- Referidos multinivel.
- Cajas de botín pagadas o cualquier mecánica de azar con dinero.

## 6. Integridad y anti-trampas

- **El servidor manda:** el cliente solo envía el ejército y el servidor valida
  y simula. No hay puntuaciones que falsificar.
- **Ocultación y compromiso:** mientras el torneo está abierto solo se publica
  el hash `sha256(torneo|jugador|ejército canónico|sal)`. Al cerrar se revelan
  ejército y sal, y cualquiera puede comprobar que coinciden. En los torneos de
  pago ese mismo hash queda registrado on-chain en `enter()`.
- **Auditable:** motor abierto y determinista, con repetición de cualquier
  partida tras el cierre.
- **Multicuentas (sybil):** es el mayor riesgo en los premios gratuitos.
  Medidas:
  - Una cuenta por persona verificada (Telegram más un KYC ligero para cobrar).
  - Antigüedad mínima o partidas de práctica jugadas.
  - Premios gratuitos modestos.
  - Detección de ejércitos casi idénticos desde la misma IP o dispositivo.
- **Solvers:** usar simulaciones propias para optimizar es parte del juego (como
  preparar aperturas en ajedrez). La ocultación y los modificadores por torneo
  evitan que eso se convierta en copiar al rival.

## 7. Legal y cumplimiento (revisar con un abogado)

- **Habilidad frente a azar:** el motor determinista es el argumento central,
  pero la regulación de torneos con entrada varía según el país (y en EE. UU.
  según el estado). Hay que bloquear por geolocalización las jurisdicciones
  restringidas.
- **KYC/AML** para retirar premios por encima de un umbral, con un proveedor
  externo.
- **Sin valores:** sin token de inversión ni promesas de rendimiento. USDC solo
  como medio de pago de premios.
- Impuestos: certificados de premios para los ganadores cuando aplique.
- Términos claros: reglas, reparto, comisión, plazos y reembolsos.

## 8. Arquitectura

```
packages/engine   Motor determinista en TS (reglas, simulación, torneo, reparto).
                  Lo usan el cliente (práctica) y el servidor (torneos).
apps/server       API HTTP: inscripción oculta, cierre, clasificación y repeticiones.
apps/web          Cliente (Vite + canvas): editor de ejército y repeticiones.
contracts         TournamentEscrow.sol: escrow USDC, tope de comisión,
                  compromisos, reembolsos.
```

Flujo de un torneo de pago:

1. El cliente genera la sal y calcula el commitment.
2. El jugador llama a `enter(id, commitment)` en el contrato y paga la entrada.
3. El cliente envía ejército, sal y tx al servidor. El servidor verifica el
   evento `Entered` y guarda la inscripción.
4. Al cierre, el servidor ejecuta el torneo, publica ejércitos y clasificación,
   y llama a `settle()` con el reparto (que debe sumar exactamente el pozo).
5. Cada ganador ejecuta `claim()`. Si no hay liquidación antes del plazo, todos
   pueden hacer `refund()`.

Red recomendada: **Base** (USDC nativo, comisiones de céntimos y buena
integración con wallets embebidas).

## 9. Hoja de ruta

| Fase | Contenido | Criterio para avanzar |
|---|---|---|
| 0. Prototipo (hecho) | Motor, API, cliente web, contrato con tests | — |
| 1. MVP gratuito (4–6 semanas) | Telegram Mini App, cuentas, arena diaria patrocinada, pagos manuales, desafío diario | Retención D1 > 35% y D7 > 12% **sin** premios |
| 2. Confianza | Postgres, verificación de identidad, panel de pagos públicos, auditoría del contrato | Auditoría sin hallazgos críticos |
| 3. Torneos de pago | Escrow en Base, geobloqueo, KYC para retiros | Aprobación legal por jurisdicción |
| 4. Crecimiento | Cosméticos, pase de temporada, clanes, ligas, patrocinadores | Ingresos ≥ coste de premios gratuitos |

## 10. Métricas clave

- Retención D1/D7/D30 **en modos sin premio** (si nadie juega gratis, el juego
  no es divertido).
- Porcentaje de jugadores que entran en torneos y porcentaje que repite.
- Coste de premios gratuitos frente a ingresos (anuncios, patrocinio, cosméticos).
- Reportes de trampas o multicuentas por cada 1.000 jugadores.
- Tiempo desde que se abre la app hasta la primera partida (objetivo: < 15 s).
