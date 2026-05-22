# Manual del DJ: Panel del Director de Juego

Bienvenido al Dorso Oscuro. Como Director de Juego (DJ), tienes a tu disposición el **Panel del Director de Juego** (HUD del DJ), una herramienta poderosa centralizada en pestañas para controlar la mesa, a los jugadores, a las criaturas enemigas (Bosses) y las cartas de equipo.

## 1. Pestaña Radar (Control de Jugadores)
En esta pestaña tienes una visión general del estado de todos los jugadores que han activado una mesa de juego (al elegir un Alma).
Desde aquí puedes alterar cualquier parámetro en tiempo real sin necesidad de abrir la ficha del jugador:

- **Modificación de Valores**: Verás contadores de Vida del Alma, Energía, Merma (⏬), Decadencia (🩸) y Estabilidad mental. Usa los botones `+` y `-` para modificarlos directamente.
- **Cartas en Mesa**: Si un jugador tiene cartas con puntos de vida (PV) sobre el tablero, aparecerán listadas aquí. Podrás sumarle o restarle vida al igual que al Alma.
  > [!TIP]
  > Si reduces la vida de una carta de jugador a 0 desde el HUD, el sistema te preguntará automáticamente si deseas destruir la carta y enviarla al descarte o desterrarla (si es de un solo uso). ¡Es muy cómodo para destruir las magias de los jugadores de forma rápida!

## 2. Pestaña Criatura (Control del Boss)
Esta es tu zona principal durante el combate. Aquí invocas y controlas a los guardianes del Dorso Oscuro.

### Iniciar a la Criatura
- Si no hay ningún boss activo, verás una lista con las almas de las criaturas disponibles.
- Al hacer clic en una de ellas, el sistema creará un Actor Temporal (el Boss), buscará en la base de datos todas las cartas que pertenezcan al mazo de esa criatura y, si tienen copias (x2, x3), las multiplicará automáticamente.
- A continuación, creará las pilas (mazo, mano, descarte), mezclará el mazo y asignará las estadísticas base.

### Combate de la Criatura
- **Robar Todo**: La Criatura roba **todo** el mazo de golpe a su mano. Esto se hace al inicio del turno para tener todas las acciones de ese turno listas.
- **Jugar Cartas**: Puedes **arrastrar** (Drag & Drop) las cartas de la mano del boss al tablero. 
  > [!IMPORTANT]
  > Cuando el DJ arrastra una carta al tablero, **aparece boca abajo** y oculta a los jugadores para mantener el factor sorpresa. Solo tú sabrás qué es hasta que decidas revelarla o ejecutar su acción.
- **Evolución / Fase**: Si la criatura tiene múltiples fases (ej. Glaistig fase 1, 2, etc.), verás un botón de evolución. Al pulsarlo podrás transformarla en otra fase. La nueva fase **heredará exactamente los Puntos de Vida actuales**.
- **Gestión de Vida (PV)**: Tienes un campo para introducir directamente el daño o la curación de la criatura. Pulsa enter o el botón de actualización verde. Aparecerán números flotantes sobre la criatura indicando el daño recibido.

### Finalizar Encuentro
En la pestaña de Criatura, abajo del todo tienes el botón **⚠️ Finalizar Encuentro**.
> [!CAUTION]
> Al pulsar este botón se **eliminará de la base de datos todo el rastro temporal del combate**: El actor del boss, sus mazos, su carpeta, todas las cartas de boss del tablero e incluso las almas temporales de los jugadores, dejando el mundo limpio para la narrativa.

## 3. Pestaña Equipo
A lo largo de la aventura, los jugadores podrán acceder a armaduras, armas u objetos que les otorgan un estado permanente o pasivo.
- Aquí verás todas las cartas de Equipo existentes en el sistema.
- Puedes bloquear (candado rojo) o desbloquear (candado verde) estos equipos para los jugadores.
- Al desbloquear una carta de equipo, los jugadores obtendrán permisos de observador sobre ella de forma automática y se registrará en el sistema.
- Como DJ puedes arrastrar las cartas de equipo desde este menú directamente al tablero para dárselas a los jugadores. ¡A diferencia de las del boss, estas caerán **boca arriba**!
