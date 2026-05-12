// module/apps/mercader.mjs

export class MercaderManager {

    /**
     * 1. RECUPERAR O CREAR LA PAPELERA
     * Busca el actor "Papelera Mercader" o lo crea si no existe.
     */
    static async getPapelera() {
        let papelera = game.actors.find(a => a.flags.dorso_oscuro?.isPapelera);

        if (!papelera) {
            ui.notifications.info("Creando la Papelera del Mercader...");
            papelera = await Actor.create({
                name: "Papelera del Mercader",
                type: "personaje",
                flags: { dorso_oscuro: { isPapelera: true } }
            });
        }
        return papelera;
    }

    /**
     * 2. VENDER CARTA (Mover de Jugador a Papelera)
     * Extrae la carta del jugador, le da esencia y manda la carta a la papelera.
     */
    static async venderCarta(jugadorId, cartaId, precioVenta) {
        const jugador = game.actors.get(jugadorId);
        const carta = jugador?.items.get(cartaId);
        const papelera = await this.getPapelera();

        if (!jugador || !carta || !papelera) return false;

        // Copiamos los datos de la carta
        const cartaData = carta.toObject();

        // La creamos en la papelera
        await papelera.createEmbeddedDocuments("Item", [cartaData]);

        // La borramos del jugador
        await carta.delete();

        // Le sumamos la esencia al jugador
        const nuevaEsencia = (jugador.system.esencia || 0) - precioVenta;
        await jugador.update({"system.esencia": nuevaEsencia});

        ui.notifications.info(`Carta ${carta.name} vendida por ${precioVenta} de esencia.`);
        return true;
    }

    /**
     * 3. CALCULAR STOCK DISPONIBLE
     * Revisa cuántas cartas quedan libres en el mundo restando las que tienen
     * los jugadores y las que están en la papelera.
     */
    static obtenerStock(mundosActivos = []) {
        // 1. Recogemos TODAS las cartas globales que NO son de criatura
        const cartasMundo = game.items.filter(i =>
            (i.type === "carta_poder" || i.type === "carta_objeto") &&
            !i.system.esDeCriatura
        );

        // 2. Contamos cuántas copias existen actualmente en TODOS los Actores (Jugadores + Papelera)
        const cartasEnUso = {};

        // Solo revisamos actores de tipo personaje (ignoramos jefes y almas temporales)
        const actoresValidos = game.actors.filter(a => a.type === "personaje" && !a.flags.dorso_oscuro?.isTempAlma && !a.flags.dorso_oscuro?.isBossSession);

        for (let actor of actoresValidos) {
            for (let item of actor.items) {
                if (item.type === "carta_poder" || item.type === "carta_objeto") {
                    // Usamos el nombre de la carta como identificador único para agruparlas
                    const nombre = item.name;
                    cartasEnUso[nombre] = (cartasEnUso[nombre] || 0) + 1;
                }
            }
        }

        // 3. Calculamos el stock real restante
        const stockDisponible = [];

        for (let cartaGlobal of cartasMundo) {
            // Filtramos por mundo si el DJ ha especificado mundos
            if (mundosActivos.length > 0 && !mundosActivos.includes(cartaGlobal.system.mundo)) {
                continue;
            }

            const totalOriginal = cartaGlobal.system.cantidadExistente || 1;
            const copiasUsadas = cartasEnUso[cartaGlobal.name] || 0;
            const copiasRestantes = totalOriginal - copiasUsadas;

            if (copiasRestantes > 0) {
                stockDisponible.push({
                    carta: cartaGlobal,
                    restantes: copiasRestantes
                });
            }
        }

        return stockDisponible;
    }

    /**
     * 4. GENERAR OFERTA DEL MERCADER
     * Extrae aleatoriamente X objetos e Y poderes del stock disponible.
     */
    static generarOferta(mundosActivos, numObjetos, numPoderes) {
        const stock = this.obtenerStock(mundosActivos);

        // Preparamos la "piscina" de robo. Si una carta tiene 3 copias restantes,
        // la metemos 3 veces en la piscina para que tenga más probabilidades de salir.
        const poolObjetos = [];
        const poolPoderes = [];

        for (let s of stock) {
            const poolDestino = s.carta.type === "carta_objeto" ? poolObjetos : poolPoderes;
            for (let i = 0; i < s.restantes; i++) {
                poolDestino.push(s.carta);
            }
        }

        // Función auxiliar para barajar un array
        const barajar = (array) => array.sort(() => Math.random() - 0.5);
        barajar(poolObjetos);
        barajar(poolPoderes);

        // Función para extraer cartas ÚNICAS (para no ofrecer dos veces la misma carta en la tienda)
        const extraerCartas = (pool, cantidad) => {
            const seleccionadas = [];
            for (let carta of pool) {
                if (seleccionadas.length >= cantidad) break;
                // Solo la añadimos si no la hemos sacado ya
                if (!seleccionadas.find(c => c.name === carta.name)) {
                    seleccionadas.push(carta);
                }
            }
            return seleccionadas;
        };

        const ofertaObjetos = extraerCartas(poolObjetos, numObjetos);
        const ofertaPoderes = extraerCartas(poolPoderes, numPoderes);

        return {
            objetos: ofertaObjetos,
            poderes: ofertaPoderes
        };
    }
}