# Bellum Gentium 2.0 — Guerra por oleadas

Propuesta para hacer las batallas más largas, más estratégicas y más
entretenidas, tomando lo mejor de Hearthstone sin perder las dos cosas que
hacen viable el juego con premios: **sin azar** y **partidas asíncronas**
(cada jugador envía su ejército y el servidor resuelve la batalla).

## 1. Qué falla hoy

| Problema | Por qué pasa |
|---|---|
| Todo se decide en el despliegue | Se gastan los 12 de oro de golpe y la batalla es consecuencia directa de la colocación. |
| Siempre abren los más fuertes | Nada impide empezar con caballeros y magos en el turno 1. |
| El tablero es demasiado libre | 18 casillas propias para 6 unidades: la posición importa poco. |
| No hay ritmo | No hay momentos de remontada ni decisiones de «guardo o gasto». |
| Batallas cortas | Con todo desplegado, a los 5–8 turnos está decidido. |

## 2. Qué tomamos de Hearthstone (y qué no)

| Hearthstone | Bellum Gentium 2.0 |
|---|---|
| Maná que crece cada turno (1, 2, 3…) | **Oro de guerra por ronda**: empiezas con poco y cada ronda ingresas más. |
| Curva de maná: cartas baratas primero | **Rangos de tropa** que se desbloquean por ronda: lo fuerte llega tarde. |
| Tablero de 7 esbirros | **Posiciones limitadas**: 7 plazas fijas por bando (4 vanguardia + 3 retaguardia). |
| Mano y mazo | **Mazo de guerra ordenado** (10 tropas + 3 cartas): tú eliges el orden; no se baraja. |
| Palabras clave (Provocar, Carga, Grito de batalla, Último aliento, Escudo divino) | Las mismas ideas como **rasgos** de tropas, comandantes y cartas. |
| Vida del héroe | **Fortaleza** con 30 de vida: lo que cruza el campo golpea la fortaleza. |
| Poder de héroe | La habilidad del comandante, con coste de oro y recarga. |
| Azar (robar cartas) | **No**: el orden del mazo lo decides tú. La habilidad sigue siendo lo único que cuenta. |
| Jugar en directo | **No en torneos** (serían partidas síncronas): se programa un **plan de guerra**. Sí habrá modo en directo contra la IA en campaña (fase 3). |

## 3. Reglas nuevas

### 3.1 Rondas y oro de guerra

- La batalla dura hasta **12 rondas**. Cada ronda tiene **fase de refuerzos** y **fase de combate** (unas 3 acciones por unidad).
- **Ingreso por ronda**: 3 de oro en la ronda 1, +1 por ronda hasta un máximo de 8 (3, 4, 5, 6, 7, 8, 8…). Es la curva de maná.
- **Botín por baja**: matar una tropa da la mitad de su coste (redondeando hacia arriba). Matar al comandante enemigo da 5.
- **Racha**: matar 2 o más en la misma ronda da +1 por cada baja extra. Premia el golpe coordinado (magos con salpicadura, cartas de área).
- **Remontada**: si al empezar la ronda tienes menos tropas que el rival, +1 de oro. Evita partidas decididas en la ronda 2.
- **Ahorro con interés**: el oro que no gastas se guarda, con +1 por cada 5 guardados (máximo +2). Esto crea la decisión «desplegar ya o preparar una oleada fuerte».

### 3.2 Rangos de tropa (lo fuerte no llega al principio)

| Rango | Desde la ronda | Tropas |
|---|---|---|
| I | 1 | Guerrero, Arquero |
| II | 3 | Guardián, Sanador |
| III | 5 | Caballero, Mago |
| IV | 7 | Invocaciones legendarias (Gólem…) y cartas legendarias |

Las cartas también tienen rango: las comunes desde la ronda 1 y las legendarias desde la 7.

### 3.3 Tablero con posiciones limitadas

```
 Retaguardia   Vanguardia        Tierra de nadie        Vanguardia   Retaguardia
   R1 R2 R3    V1 V2 V3 V4   · · · · · · · · · ·   V4 V3 V2 V1    R3 R2 R1
  [Fortaleza]                                                      [Fortaleza]
```

- **7 plazas por bando**: 4 de vanguardia y 3 de retaguardia. Si no hay plaza libre, el refuerzo espera.
- Los arqueros, magos y sanadores solo pueden entrar por la **retaguardia**. Los guardianes y caballeros, solo por la **vanguardia**. Los guerreros, por cualquiera.
- **Terreno** en la tierra de nadie (mapa fijo por arena, conocido de antemano):
  - **torre**: +1 de alcance;
  - **pantano**: −1 de velocidad;
  - **estandarte**: +1 de oro por ronda a quien lo ocupe.

  El estandarte da un objetivo de mapa por el que pelear.

### 3.4 Mazo de guerra y plan de refuerzos

En lugar de colocar 12 de oro en el tablero, el jugador prepara:

1. **Comandante** en su plaza, desplegado desde la ronda 1.
2. **Mazo de guerra**: una lista **ordenada** de hasta 10 tropas y 3 cartas.
3. **Órdenes** en cada entrada del mazo:
   - plaza preferida;
   - condición: «en cuanto haya oro», «desde la ronda X», «si cae la vanguardia», «si el rival despliega magos», «guardar para oleada».

En cada fase de refuerzos, el motor recorre tu mazo en orden y despliega lo que puedes pagar y cumple su condición. Es completamente determinista. Planificar la curva es la estrategia, como construir un mazo de Hearthstone.

### 3.5 Rasgos (palabras clave)

| Rasgo | Efecto | Ejemplo |
|---|---|---|
| **Provocar** | Los enemigos a su alcance deben atacarle | Guardián |
| **Carga** | Ataca en la ronda en que entra | Caballero |
| **Grito de guerra** | Efecto al desplegarse | «Aliados adyacentes +1 de ataque» |
| **Último aliento** | Efecto al morir | «Deja un esqueleto 2/2» (no-muertos) |
| **Escudo divino** | Ignora el primer golpe | Paladines de Aurelia |
| **Sigilo** | No se le puede atacar hasta que ataque | Exploradores élficos |
| **Furia** | +2 de ataque mientras está herido | Berserkers orcos |

Cada raza gira alrededor de 2 rasgos. Por ejemplo: los orcos con Furia y Carga, y los no-muertos con Último aliento. Eso da identidad y sinergias para construir mazos.

### 3.6 Fortaleza y victoria

- Cada bando tiene una **fortaleza con 30 de vida** detrás de su retaguardia.
- Una tropa que llega al final del campo golpea la fortaleza en vez de avanzar.
- **Ganas** si destruyes la fortaleza rival, o si al final de la ronda 12 tienes más vida de fortaleza (desempate: tropas vivas y luego oro).
- Así nadie gana solo por aguantar: hay un reloj y dos caminos, **presión** (golpear la fortaleza) o **control** (limpiar el tablero y ganar por botín).

## 4. Por qué es más entretenido

- **Ritmo de Hearthstone**: las rondas 1–4 son escaramuzas baratas, las 5–8 traen caballeros y magos, y las 9–12 las legendarias y los golpes a la fortaleza.
- **Decisiones reales antes de la batalla**: curva, orden, condiciones, ahorro frente a tempo, qué plazas ocupar y cuándo ir a por el estandarte.
- **Remontadas visibles**: el botín, la racha y el oro de remontada crean momentos de «¡le ha dado la vuelta!», que es lo que se comparte en Telegram.
- **Más duración** sin aburrir: unas 12 rondas de 20–30 s en la repetición, con el marcador de oro y de fortaleza visibles.
- **Sigue siendo justo para torneos**: sin azar, auditable y asíncrono. Las repeticiones cuentan una historia.

## 5. Plan de implementación

| Fase | Contenido | Esfuerzo |
|---|---|---|
| **1. Motor** | Rondas, ingreso, botín, racha, remontada e interés; 7 plazas por bando; rangos; mazo ordenado con condiciones; fortaleza. Formato de ejército v2 con validación; presets, misiones y jefes adaptados; script de balance. | Grande: es el corazón |
| **2. Cliente** | Editor de mazo con la curva por ronda, plazas en el tablero, marcador de oro y fortaleza, animación de refuerzos entrando, «+3 🪙» flotante al matar y banner de racha. | Grande |
| **3. Rasgos y terreno** | Provocar, Grito de guerra, Último aliento, Escudo divino, Sigilo, Furia; torres, pantanos y estandarte; 2 rasgos por raza. | Medio |
| **4. Campaña en directo** | Contra la IA, el jugador elige los refuerzos entre rondas (como Hearthstone de verdad). Los torneos siguen con plan de guerra. | Medio |

Compatibilidad: los ejércitos v1 se convierten en un mazo v2 (las tropas pasan a ser las primeras entradas del mazo), así que los perfiles y colecciones no se pierden. Los torneos cerrados conservan su resultado con el motor v1.
