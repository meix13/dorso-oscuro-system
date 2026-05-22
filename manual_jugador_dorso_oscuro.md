# Manual del Jugador: La Mesa de Juego

Bienvenido al Dorso Oscuro. Como jugador, toda tu interacción con el combate de cartas se realizará a través de tu **Mesa de Juego** (HUD del Jugador). Este panel te permite gestionar tu alma, tus cartas, tu energía y tus estados alterados de forma rápida y visual.

## 1. Despertar el Alma
Antes de comenzar un encuentro, debes seleccionar qué Alma te representará:
- Pulsa el botón **Elegir Alma** (o el botón de cambio si ya tienes una) en la cabecera de tu HUD.
- Se abrirá un diálogo con las Almas que has conseguido en tu aventura.
- Al seleccionarla, sus estadísticas (Vida y Límite de Mano) se cargarán, y tu token en el tablero se actualizará automáticamente.

## 2. Gestión de la Mano y el Mazo
En el centro del HUD verás las cartas que tienes en tu mano, así como contadores de tu **Mazo**, **Descarte** y cartas **Eliminadas**.

- **Robar Cartas**: Encontrarás botones para robar 1 o 2 cartas. El botón **Robar hasta Límite** calculará automáticamente cuántas cartas te faltan (teniendo en cuenta tu Alma y los objetos que tengas en mesa que den bonificadores al límite de mano).
  > [!NOTE]
  > Si tu mazo se vacía al robar, el sistema automáticamente cogerá tu pila de descarte, la barajará, creará un nuevo mazo y continuará robando lo que te falte.

- **Jugar Cartas**: Simplemente haz clic izquierdo sobre la carta en tu mano y **arrástrala (Drag & Drop)** al tablero (escena). La carta se convertirá en un token que todos podrán ver.
- **Ver Detalles**: Si haces **clic derecho** sobre una carta de tu mano, se abrirá en grande para que puedas leer bien el texto.
- **Destierro Manual**: Al pasar el ratón sobre una carta de tu mano, verás un botón rojo para mandarla directamente a la pila de Eliminadas (para efectos de descartar o destruir cartas).

## 3. Energía y Estados (Malus)
En el panel lateral izquierdo encontrarás tus recursos vitales:

- **Energía (⚡)**: Puedes subirla o bajarla manualmente con los botones `+` y `-`.
  - **Botón Recolectar**: Si lo pulsas, el sistema sumará automáticamente la energía que te proporciona tu Alma y cualquier Objeto permanente que tengas colocado en el tablero.
- **Merma (⏬) y Decadencia (🩸)**: Si sufres estos estados, usa los botones `+` y `-` para aplicarlos. Estos iconos aparecerán sobre tu token en el tablero para que el DJ lo sepa.
- **Limpiar Estados**: Tienes un botón rápido para borrar toda la Merma y Decadencia de golpe cuando te cures o termine el encuentro.

## 4. Finalizar tu Turno
Cuando hayas jugado tus cartas y gastado tu energía, debes pulsar el botón **Finalizar Turno**. Esto realizará varias acciones de forma automática:
1. **Descarte Voluntario**: Se te preguntará si quieres descartar alguna de las cartas que te sobran en la mano. Haz clic en las que quieras tirar y confirma.
2. **Límite de Energía**: Si has acumulado más de 7 de energía, se reducirá a 7.
3. **Limpieza del Tablero**: Cualquier carta de **Poder** que hayas jugado y cuya vida haya llegado a cero (o sea de un solo uso) se borrará del tablero automáticamente. ¡Tus objetos permanentes se quedarán en la mesa!

## 5. Recoger la Mesa
Una vez finalizado el encuentro, pulsa el botón **Recoger Mesa** (icono de la escoba).
> [!IMPORTANT]
> Esto limpiará completamente tu zona: borrará todos tus tokens del tablero, destruirá los mazos temporales, limpiará tus estados y curará tu Alma al máximo de vida para la próxima vez.
