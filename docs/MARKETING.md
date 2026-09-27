# Bellum Gentium: plan de lanzamiento de prueba (6 semanas)

Objetivo: saber si el juego engancha **antes** de invertir en serio. Presupuesto
máximo del experimento: **~150–250 USD** en total (premios y un poco de
publicidad), nunca más de lo que estés dispuesto a perder.

## 1. Posicionamiento

**«Estrategia sin azar. Gana con la cabeza, no con la suerte ni con la cartera.»**

- Sin azar: el mismo planteamiento da siempre el mismo resultado, así que cada
  derrota se puede aprender.
- Sin pay-to-win: en los torneos con premio todos juegan con todas las cartas.
- Partidas de 30 segundos y torneos asíncronos: juegas cuando quieres.
- Cinco pueblos en guerra (Bellum Gentium, «la guerra de los pueblos»): la
  identidad de cada raza es lo que se comparte y se discute.

**Qué no decir nunca:** «gana dinero», «ingresos pasivos», «invierte»,
rentabilidades o capturas de ganancias. Se habla de **torneos con premios**,
de habilidad y de comunidad. Eso protege legalmente y atrae jugadores, no
cazadores de airdrops.

## 2. Público

1. **Jugadores de autobattlers y estrategia** (TFT, Hearthstone Battlegrounds,
   Clash Royale, ajedrez): el núcleo que se queda.
2. **Comunidades de Telegram de juegos crypto en español** (España y
   Latinoamérica): el canal que más rápido trae jugadores.
3. Creadores pequeños de contenido de estrategia y fantasía.

## 3. Fases y premios sin arriesgar mucho dinero

### Fase A — Semanas 1–2: probar gratis (0 USD)

- Comparte la demo (enlace de la página) con 20–50 personas de confianza y
  grupos pequeños.
- Premios **sin dinero**: título de **Fundador** y la futura armadura exclusiva
  «Estandarte del Fundador» para los primeros 100 jugadores activos.
- Pide feedback con un formulario de 5 preguntas (ver sección 6).
- Métrica clave: ¿vuelven a jugar sin que haya premio?

### Fase B — Semanas 3–6: Copa semanal con premio pequeño (~20–30 USD/semana)

- Despliega el servidor (Telegram + web) con `REQUIRE_AUTH=1`: solo se inscriben
  cuentas de Telegram verificadas, una por persona.
- **Copa semanal gratis**, pozo patrocinado por ti: **20 USDC** (10 / 6 / 4)
  en la red **Base** (comisiones de céntimos).
- Cómo pagar sin exponerte:
  1. Crea una **wallet exclusiva para premios** y carga cada semana **solo** el
     pozo de esa semana. Tu dinero principal nunca está en juego.
  2. Al cerrar la copa, descarga la lista de pagos:
     `curl -H "authorization: Bearer $ADMIN_TOKEN" https://TU-DOMINIO/api/tournaments/ID/payouts.csv`
     (puesto, jugador, wallet, USDC). Las wallets nunca son públicas.
  3. Revisa a mano el podio (cuentas recién creadas, ejércitos idénticos) y
     paga desde la wallet de premios. Publica el enlace de cada transacción en
     el canal: la transparencia es tu mejor anuncio.
  4. Quien no puso wallet: tiene 7 días para darla; si no, el premio pasa al
     siguiente o se acumula.
- Si prefieres no usar crypto al principio: tarjetas regalo (Steam, Google
  Play) con el mismo importe.
- Coste de la fase: 4 × 20 = **80 USD**.

### Criterio para seguir (al final de la semana 6)

| Métrica | Seguir | Replantear |
|---|---|---|
| Retención día 1 (sin premio) | > 35 % | < 20 % |
| Retención día 7 | > 12 % | < 6 % |
| Activos semanales que entran en la copa | > 30 % | < 10 % |
| Invitaciones por jugador (factor K) | > 0,2 | < 0,05 |
| Coste por jugador activo (si hubo anuncios) | < 1 USD | > 3 USD |

Si no se cumple, el problema es el juego y no el marketing: mejorar el juego
antes de gastar más.

## 4. Canales

| Canal | Qué publicar | Frecuencia |
|---|---|---|
| **Canal + grupo de Telegram** («Taberna de Gentium») | Desafío del día, clasificación de la copa, pagos con enlace a la transacción, encuestas de balance | Diario |
| **TikTok / Reels / Shorts** | Clips de 15–30 s de batallas: cargas, meteoros, legendarias, remontadas. Gancho en el primer segundo («¿Ganan 6 orcos a 2 caballeros?») | 4–5 por semana |
| **X (Twitter)** | Clips, resultados de la copa, pagos verificables | 3 por semana |
| **Reddit** (r/autobattlers, r/WebGames, r/playmygame) | Publicación honesta pidiendo feedback, sin spam | 1 por fase |
| **Discord** de comunidades de estrategia | Presentarse, ofrecer la demo y una copa para su comunidad | Puntual |
| **Microcreadores** (1k–20k seguidores) | Partida en directo o clip; pago en título Fundador y 10–20 USD | 2–3 en la fase B |

Presupuesto opcional de anuncios: 50–100 USD en TikTok o Telegram Ads **solo**
si la retención de la fase A es buena.

## 5. Tácticas de lanzamiento

- **Beta cerrada con plazas limitadas** («100 Fundadores»): la escasez genera
  conversación sin costar dinero.
- **Invitaciones de un solo nivel:** quien invita y quien llega reciben un
  cosmético. Nunca premios en dinero por invitar ni cadenas de referidos.
- **«Reta a mi ejército»:** compartir un enlace con tu ejército para que otros
  intenten ganarle. Es la próxima función a construir: convierte cada partida
  en un anuncio.
- **Historia semanal:** anuncio de la copa el lunes, recordatorio el jueves,
  resultados, repeticiones de la final y pagos el domingo.
- **Balance con la comunidad:** encuestas sobre qué raza está demasiado fuerte.
  Hacer sentir a los jugadores parte del juego fideliza.

## 6. Feedback (formulario de 5 preguntas)

Hazlo con Google Forms o Tally y enlázalo en el canal:

1. Del 1 al 10, ¿cuánto te divirtió?
2. ¿Qué raza elegiste y por qué?
3. ¿Qué te confundió o te frenó?
4. ¿Jugarías una copa semanal gratis con premio? ¿Y pagarías 1 USD por entrar
   en una con más premio?
5. ¿Se lo recomendarías a un amigo? ¿Por qué?

## 7. Bases del concurso (plantilla corta)

Publica las reglas antes de la primera copa:

- Participación **gratuita**, sin compra necesaria. Mayores de 18 años.
- Una cuenta por persona. Las multicuentas quedan descalificadas.
- Ganan los tres primeros de la clasificación del motor, que es público y
  verificable. Premios: 10 / 6 / 4 USDC en la red Base, o su equivalente en
  tarjeta regalo.
- Plazo para dar la wallet: 7 días tras el cierre.
- El organizador puede anular resultados por trampas o fallos técnicos.
- Revisa con un asesor la normativa de concursos y la fiscalidad de premios de
  tu país antes de la fase B.

## 8. Calendario

| Semana | Juego | Marketing |
|---|---|---|
| 1 | Demo pública, feedback | 20–50 invitados, grupo de Telegram, formulario |
| 2 | Ajustes según feedback | Primeros clips en TikTok/Shorts, Reddit |
| 3 | Servidor + Telegram, primera copa | Anuncio de la copa, 1–2 microcreadores |
| 4 | Desafío diario, «Reta a mi ejército» | Clips de la final, pagos publicados |
| 5 | Balance por encuesta | Invitaciones de un nivel, 1 microcreador |
| 6 | Revisión de métricas | Decisión: escalar, replantear o cerrar |
