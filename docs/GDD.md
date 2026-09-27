# Bellum Gentium: documento de diseño (GDD)

> Estrategia por turnos con torneos de habilidad y premios en USDC.
> Principio rector: **divertido primero, se gana después**. Ningún premio se paga
> con el dinero de jugadores nuevos.

## 1. Visión

Bellum Gentium es un juego de estrategia rápido: cada jugador arma un ejército con un
presupuesto limitado, lo coloca en su mitad del tablero y la batalla se resuelve
sola, de forma **determinista** (sin azar). La habilidad está en *qué* unidades
elegir y *dónde* colocarlas.

- **Partida de práctica:** unos 30 segundos, jugable en el navegador o en Telegram.
- **Torneos:** envías un ejército antes del cierre y juega contra el de todos los
  demás inscritos. Tu ejército queda oculto hasta el cierre, así que nadie puede
  copiarlo ni preparar un contraataque.

### Por qué este formato

| Necesidad | Cómo la cubre Bellum Gentium |
|---|---|
| Captar rápido | Se entiende en 10 segundos (elige, coloca, mira). Sin wallet para empezar. |
| Legal: habilidad, no azar | Motor sin aleatoriedad: el resultado depende solo de las decisiones. |
| Anti-trampas | El cliente nunca envía un resultado, solo el ejército. El servidor simula. |
| Transparencia | Motor abierto, ejércitos revelados al cierre y compromisos (hash) on-chain: cualquiera puede recalcular el torneo. |
| Asíncrono | No hace falta coincidir en horario: ideal para móvil y Telegram. |
| Compartible | Cada partida es una repetición reproducible: «mira cómo gané». |

## 2. Reglas (v0.3)

- Tablero de 8×6. Cada jugador despliega en sus 3 columnas propias.
- Cada ejército tiene **una raza**, **un comandante** (obligatorio, gratis),
  **12 de oro** para unidades (máximo 6) y **6 de energía** para cartas
  (máximo 3, y solo 1 legendaria).
- Hasta 40 turnos. Cada turno: **veneno** → **habilidades de inicio de turno**
  (comandantes y jefes) → **cartas** programadas para ese turno → **unidades**,
  que actúan intercaladas. El bando que empieza alterna de un turno a otro.
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
| Gólem Ancestral | — | 24 | 4 | 1 | 1 | Armadura 3. Solo aparece con la legendaria enana |

La armadura resta daño, con un mínimo de 1 por golpe.

### Razas

Cada raza modifica las unidades base con ventajas **y desventajas**, y tiene su
propia carta legendaria. Ninguna tiene unidades exclusivas más fuertes: la
identidad sale del estilo de juego.

| Raza | Reino | Rasgo | Efecto | Legendaria |
|---|---|---|---|---|
| Humanos | Reino de Aurelia | Disciplina | Guerreros armadura +1, Caballeros vida +2 | Intervención de Aurelia |
| Elfos | Bosque de Sylvaran | Ojo de halcón | Arqueros alcance +1, Sanadores curan +1; Guardianes vida −2 | Tormenta de Sylvaran |
| Orcos | Clanes de Ceniza | Sed de sangre | Guerreros vida +3, Caballeros ataque +1; Arqueros alcance −1 | Furia de Ceniza |
| No-muertos | Legión Sombría | Inmortales | La primera unidad que cae se levanta con la mitad de vida; Sanadores curan −1 | Legión de los Caídos |
| Enanos | Forja de Durnhal | Hierro ancestral | Guardianes y Guerreros armadura +1; Caballeros velocidad −1 | Gólem Ancestral |

Con el mismo ejército y sin cartas, las cinco razas empatan a puntos en el
informe de balance: ninguna es mejor por sí sola.

### Cartas de acción

Cada carta se **programa para un turno** (del 1 al 10) y se lanza sola al
empezar ese turno. Elegir el momento es parte de la estrategia: una
Resurrección en el turno 1 no hace nada, y en el turno 5 puede decidir la
partida. Si no hay objetivo válido, la carta **falla** («Sin efecto»).

Cada carta tiene una **categoría**: ataque, defensa, efecto (mejora propia o
debilitamiento del rival), curación o invocación. 24 cartas en total:

| Carta | Categoría | Rareza | Energía | Efecto |
|---|---|---|---|---|
| Flecha Ígnea | Ataque | Común | 1 | 3 de daño al enemigo con menos vida |
| Muro de Escudos | Defensa | Común | 1 | Aliados +2 armadura durante 1 turno |
| Quebrantar Armaduras | Efecto | Común | 1 | Enemigos −1 armadura durante 2 turnos |
| Poción Menor | Curación | Común | 1 | Cura 4 al aliado más herido |
| Grito de Guerra | Efecto | Común | 2 | Aliados +1 ataque durante 2 turnos |
| Piel de Piedra | Defensa | Poco común | 2 | Aliados +1 armadura durante 3 turnos |
| Barrera Arcana | Defensa | Poco común | 2 | Escudo de 6 al aliado más herido |
| Maldición de Debilidad | Efecto | Poco común | 2 | Enemigos −1 ataque durante 2 turnos |
| Viento Veloz | Efecto | Poco común | 2 | Aliados +1 velocidad durante 2 turnos |
| Cadenas de Escarcha | Efecto | Poco común | 2 | Congela al enemigo con más vida durante 2 turnos |
| Meteoro | Ataque | Rara | 3 | 5 al centro del grupo y 2 a los adyacentes, ignora armadura |
| Armadura de Espinas | Defensa | Rara | 3 | 3 turnos: quien golpee cuerpo a cuerpo recibe 2 |
| Nube Tóxica | Efecto | Rara | 3 | Veneno de 2 por turno durante 3 turnos al grupo enemigo |
| Refuerzos | Invocación | Rara | 3 | Invoca un Guerrero en la retaguardia |
| Luz Sanadora | Curación | Rara | 3 | Cura 3 a todos los aliados |
| Cadena de Rayos | Ataque | Épica | 4 | 4 / 3 / 2 de daño encadenado |
| Égida de los Antiguos | Defensa | Épica | 4 | Escudo de 4 a todos los aliados |
| Terremoto | Efecto | Épica | 4 | 2 a todos los enemigos y aturde al más adelantado |
| Resurrección | Invocación | Épica | 4 | Revive a la unidad caída más valiosa con media vida |
| 5 legendarias | Varias | Legendaria | 5 | Una por raza (ver tabla de razas) |

El **escudo** absorbe daño antes que la vida; el **veneno** hace daño al
empezar cada turno; las **espinas** devuelven daño al atacante cuerpo a cuerpo.

**La rareza no es poder.** Lo que equilibra una carta es su coste de energía;
la rareza indica lo espectacular o específica que es y cuántas copias
existen. Una legendaria cuesta 5 de los 6 puntos de energía: casi todo el
presupuesto de cartas.

### Comandantes

Todo ejército lleva un comandante: una unidad más en el tablero, gratis, con
estadísticas propias, una **pasiva** que mejora a sus tropas y una
**habilidad** que se dispara sola **una vez** (al empezar, al bajar de media
vida, con la primera baja aliada o en un turno concreto). **Si el comandante
cae, sus tropas pierden 1 de ataque** el resto de la batalla: protegerlo es
parte de la táctica.

| Comandante | Raza | Rareza | Pasiva | Habilidad |
|---|---|---|---|---|
| Aldric, Capitán de la Guardia | Humanos | Común | Guerreros +2 vida | Al empezar: aliados +1 armadura 3 turnos |
| Seraphine, Reina Solar | Humanos | Legendaria | Caballeros +1 ataque | Media vida: cura 4 a todos |
| Lyra, Exploradora del Alba | Elfos | Poco común | Arqueros +1 ataque | Al empezar: 5 de daño al más débil |
| Thalanor, Archidruida | Elfos | Épica | Guardianes +3 vida | Primera baja: escudo de 3 a todos |
| Grok el Rompehuesos | Orcos | Común | Guerreros +1 ataque | Primera baja: aliados +2 ataque 2 turnos |
| Mag'thar, Caudillo de Ceniza | Orcos | Legendaria | Caballeros +2 vida | Al empezar: aliados +1 velocidad 2 turnos |
| Velka, Nigromante del Velo | No-muertos | Rara | Guerreros +1 armadura | Primera baja: la revive con media vida |
| Morvath, Rey Lich | No-muertos | Legendaria | Magos +2 vida | Turno 3: veneno al grupo enemigo |
| Borin, Thane de Durnhal | Enanos | Común | Guardianes +1 ataque | Al empezar: escudo de 2 a todos |
| Brunhild, Forjarunas | Enanos | Épica | Arqueros +1 alcance | Media vida: 2 a todos y aturde |

Con el mismo ejército, los diez comandantes quedan entre 21 y 39 puntos en el
informe de balance, con las rarezas repartidas por toda la tabla: un
legendario no garantiza ganar.

### Armaduras (cosméticas)

Hierro de Campaña (común), Acero Templado (poco común), Plata Rúnica (rara),
Oro Real (épica) y Armadura del Eclipse (legendaria). Cambian el aspecto de
todo el ejército (metal, capa, penacho, gemas, runas, aura y brasas) según la
raza. **No cambian ninguna estadística**: el motor las ignora al simular.

**Balance:** los números son un punto de partida. `node packages/engine/scripts/balance.ts`
compara los ejércitos de referencia, las razas entre sí y el impacto de cada
carta. Antes de cada temporada hay que revisar que ninguna composición gane a
todas.

### Profundidad a largo plazo (post-MVP)

- **Modificadores por torneo:** presupuesto distinto, una unidad vetada,
  obstáculos en el mapa, niebla… Mantienen vivo el metajuego y evitan que una
  «solución» calculada domine para siempre.
- **Temporadas** con unidades nuevas. Siempre se desbloquean jugando, nunca
  pagando.
- **Habilidades de héroe** (una por ejército) para más identidad.

## 3. Modos de juego

**Campaña e incursiones (PvE):** misiones encadenadas por capítulos (Frontera
de Aurelia, Bosque de Sylvaran, Montañas de Durnhal) contra ejércitos con
comandante y cartas, y **incursiones** contra jefes de mundo (Vermithrax, el
Dragón de Ceniza, y Xal-Azar, el Coloso del Vacío). En una incursión no hace
falta ganar: el botín crece con el daño hecho al jefe. Cada batalla cuesta
**provisiones** (1 cada 20 minutos, máximo 10), lo que limita el farmeo y da un
motivo para volver cada día.

**Mercado Negro:**
- **Sobres** de cartas (3 cartas) y de comandante (1), con probabilidades
  publicadas. **Solo se abren con Fichas Extrañas**, que se ganan jugando y no
  se compran ni se comercian.
- **Altar de Transmutación:** 3 cartas de una rareza → 1 aleatoria de la
  siguiente.
- **Destilería y Forja:** las copias repetidas se destilan en Esencia y con
  Esencia se fabrica la carta exacta que buscas.
- **El Mercader Sin Nombre:** 4 ofertas al día (iguales para todos) que
  cambian materiales por fichas, provisiones, cartas o comandantes.
- **Mercado entre jugadores** (siguiente fase): compra y venta de cartas,
  comandantes y materiales con Oro de guerra. Requiere que la colección viva
  en el servidor para impedir duplicados.

Recursos: Oro de guerra, Hierro, Cristal arcano y Hueso antiguo
(comerciables); Fichas Extrañas, Esencia y Provisiones (no comerciables).

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

### Objetos coleccionables: cartas y armaduras

- **Se consiguen jugando:** recompensas de misiones, rachas, ligas y temporadas,
  y también fragmentos para fabricar la carta que quieras.
- **Son del jugador:** tokens ERC-1155 (`contracts/src/GentiumItems.sol`) que se
  pueden vender o regalar en cualquier mercado compatible (OpenSea, Magic
  Eden…). Cada reventa paga una **regalía del 5%** al tesoro (tope del 10% en
  el contrato): es un ingreso recurrente que no sale de los premios.
- **Escasez honesta:** cada objeto tiene un suministro máximo que se fija al
  crearlo y no se puede ampliar después. Las legendarias siempre tienen límite.
  Sugerencia: 500 copias por legendaria, 2.000 épicas, 10.000 raras;
  comunes y poco comunes sin límite.
- **Venta directa (opcional):** armaduras a precio fijo en la tienda. Nunca
  sobres con contenido aleatorio.
- **Uso en torneos con premio:** por defecto **arsenal abierto** (`cardPool:
  'open'`): todos pueden usar cualquier carta, así que el dinero no compra
  ventaja en un torneo con premio. Las cartas propias cuentan en los modos
  clasificatorios sin premio en dinero, en los torneos de coleccionista (con
  premios en objetos, `cardPool: 'owned'`) y como estatus, porque las armaduras
  se lucen en cada repetición.

### Lo que NO haremos

- Token propio con preventa ni promesas de rentabilidad.
- NFT obligatorio para jugar.
- Referidos multinivel.
- **Sobres pagados con rareza aleatoria** (cajas de botín) ni cualquier mecánica
  de azar con dinero: en varios países (Bélgica, Países Bajos…) se consideran
  juego de apuestas. Los sobres del Mercado Negro solo se abren con Fichas
  Extrañas, que se ganan jugando y **no se pueden comprar ni intercambiar**; si
  algún día se vendieran fichas por dinero, los sobres pasarían a ser cajas de
  botín de pago.
- Cartas que den ventaja en torneos con premio solo por haberlas comprado.

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
- **Objetos comerciables:** se venden como coleccionables, sin prometer que se
  revaloricen. Sin sobres aleatorios de pago (normativa de cajas de botín).
- Impuestos: certificados de premios para los ganadores cuando aplique.
- Términos claros: reglas, reparto, comisión, plazos y reembolsos.

## 8. Arquitectura

El motor incluye `meta.ts` (perfil, campaña, sobres, transmutación, mercader)
como funciones puras. Hoy el perfil se guarda en el navegador; el siguiente
paso es que el servidor ejecute esas mismas funciones como autoridad, lo que
habilita el mercado entre jugadores y los torneos con cartas propias.


```
packages/engine   Motor determinista en TS (reglas, razas, cartas, simulación,
                  torneo, reparto). Lo usan el cliente (práctica) y el servidor.
apps/server       API HTTP: inscripción oculta, cierre, clasificación y repeticiones.
apps/web          Cliente (Vite + canvas): sprites procedurales por raza y
                  armadura, efectos y partículas, cartas, armería y torneos.
contracts         TournamentEscrow.sol: escrow USDC, tope de comisión,
                  compromisos, reembolsos.
                  GentiumItems.sol: cartas y armaduras ERC-1155 con suministro
                  limitado y regalías ERC-2981.
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
| 0. Prototipo (hecho) | Motor con razas y cartas, API, cliente web con gráficos, contratos con tests | — |
| 0.5 Arte, sonido y onboarding (hecho en parte) | Ilustraciones con IA (`npm run art`), música y efectos sintetizados, tutorial guiado. Pendiente: sprites animados por un artista (`getSprite()` y la caja de 100×100 ya permiten cambiarlos) | Test con jugadores: «¿se ve épico?» |
| 1. MVP gratuito (4–6 semanas) | Telegram Mini App con login verificado (hecho), arena diaria patrocinada, pagos manuales, desafío diario | Retención D1 > 35% y D7 > 12% **sin** premios |
| 2. Confianza | Postgres, verificación de identidad, panel de pagos públicos, auditoría del contrato | Auditoría sin hallazgos críticos |
| 3. Torneos de pago | Escrow en Base, geobloqueo, KYC para retiros | Aprobación legal por jurisdicción |
| 4. Crecimiento | Recompensas en objetos on-chain, pase de temporada, clanes, ligas, patrocinadores, más razas | Ingresos ≥ coste de premios gratuitos |

## 10. Métricas clave

- Retención D1/D7/D30 **en modos sin premio** (si nadie juega gratis, el juego
  no es divertido).
- Porcentaje de jugadores que entran en torneos y porcentaje que repite.
- Coste de premios gratuitos frente a ingresos (anuncios, patrocinio, cosméticos).
- Reportes de trampas o multicuentas por cada 1.000 jugadores.
- Tiempo desde que se abre la app hasta la primera partida (objetivo: < 15 s).
- Porcentaje que completa el tutorial y en qué paso se abandona.

## 11. Telegram

Telegram es el canal de adquisición principal (ver [TELEGRAM.md](TELEGRAM.md)).
Sus normas para Mini Apps exigen **Telegram Stars** para bienes digitales y
**TON** para funciones de blockchain. Plan: en Telegram, juego gratuito con
premios patrocinados; torneos de pago y mercado de objetos en la web, hasta
decidir si merece la pena portar los contratos a TON.
