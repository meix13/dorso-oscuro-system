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
            !i.system.esDeCriatura &&
            !i.system.esEspecial
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

    /**
     * 5. OBTENER CATÁLOGO COMPLETO
     * Devuelve todas las cartas del sistema con su conteo de stock.
     */
    static obtenerCatalogoCompleto() {
        const cartasMundo = game.items.filter(i =>
            (i.type === "carta_poder" || i.type === "carta_objeto") && !i.system.esDeCriatura
        );

        // Contamos cartas en uso (igual que en obtenerStock)
        const cartasEnUso = {};
        const actoresValidos = game.actors.filter(a => a.type === "personaje" && !a.flags.dorso_oscuro?.isTempAlma && !a.flags.dorso_oscuro?.isBossSession);

        for (let actor of actoresValidos) {
            for (let item of actor.items) {
                if (item.type === "carta_poder" || item.type === "carta_objeto") {
                    const nombre = item.name;
                    cartasEnUso[nombre] = (cartasEnUso[nombre] || 0) + 1;
                }
            }
        }

        return cartasMundo.map(c => {
            const total = c.system.cantidadExistente || 1;
            const usadas = cartasEnUso[c.name] || 0;
            return {
                id: c.id,
                name: c.name,
                img: c.img,
                tipo: c.type === "carta_poder" ? "Poder" : "Objeto",
                mundo: c.system.mundo,
                rareza: c.system.rareza,
                total: total,
                disponibles: Math.max(0, total - usadas),
                esInstantanea: c.system.esInstantanea,
                desaparece: c.system.desaparece
            };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }

    // En module/apps/mercader.mjs

    /**
     * 6. RASTREAR UBICACIÓN DE CARTA
     * Busca exactamente quién tiene copias de una carta por ID o Nombre.
     */
    static obtenerDetalleUbicacion(itemId) {
        const itemOriginal = game.items.get(itemId);
        if (!itemOriginal) return null;

        const nombreCarta = itemOriginal.name;
        const totalPermitidas = itemOriginal.system.cantidadExistente || 1;

        let detalle = {
            nombre: nombreCarta,
            total: totalPermitidas,
            enJugadores: [],
            enPapelera: 0,
            disponibles: 0
        };

        // 1. Buscar en todos los actores (Jugadores)
        const jugadores = game.actors.filter(a => a.type === "personaje" && !a.flags.dorso_oscuro?.isTempAlma && !a.flags.dorso_oscuro?.isBossSession && !a.flags.dorso_oscuro?.isPapelera);

        let sumaEnUso = 0;
        for (let actor of jugadores) {
            const copias = actor.items.filter(i => i.name === nombreCarta).length;
            if (copias > 0) {
                detalle.enJugadores.push({ nombre: actor.name, cantidad: copias });
                sumaEnUso += copias;
            }
        }

        // 2. Buscar en la Papelera
        const papelera = game.actors.find(a => a.flags.dorso_oscuro?.isPapelera);
        if (papelera) {
            const copiasPapelera = papelera.items.filter(i => i.name === nombreCarta).length;
            detalle.enPapelera = copiasPapelera;
            sumaEnUso += copiasPapelera;
        }

        // 3. Calcular el resto (Disponibles para el mercader/mundo)
        detalle.disponibles = Math.max(0, totalPermitidas - sumaEnUso);

        return detalle;
    }

    /**
     * DESPLEGAR DRAFT EN MESA (Formato Columnas Verticales)
     */
    static async generarDraftInicial() {
        // 1. Filtramos las cartas del mundo marcadas para el draft
        const itemsDraft = game.items.filter(i => i.system.esDraftInicial);

        if (itemsDraft.length === 0) {
            return ui.notifications.warn("Dorso Oscuro | No hay cartas marcadas para el Draft Inicial en el mundo.");
        }

        ui.notifications.info("Generando Draft Inicial en columnas...");
        const tokensToCreate = [];
        const gridSize = canvas.grid.size;

        // Punto de inicio: Desplazamos más a la izquierda y menos hacia arriba
        const viewCenter = canvas.stage.pivot;
        let startX = viewCenter.x - (gridSize * 15);
        let startY = viewCenter.y - (gridSize * 10);

        const maxFilas = 5; // Límite máximo de cartas hacia abajo
        const espaciadoX = 2.8;
        const espaciadoY = 4.0;

        // 2. SEPARAMOS POR CATEGORÍAS (Orden solicitado: Almas -> Objetos -> Poderes)
        const almas = itemsDraft.filter(i => i.type === "carta_alma");
        const objetos = itemsDraft.filter(i => i.type === "carta_objeto");
        const poderes = itemsDraft.filter(i => i.type === "carta_poder");
        const otros = itemsDraft.filter(i => !["carta_alma", "carta_poder", "carta_objeto"].includes(i.type));

        const grupos = [
            { items: almas, titulo: "Almas" },
            { items: objetos, titulo: "Objetos" },
            { items: poderes, titulo: "Poderes" },
            { items: otros, titulo: "Otros" }
        ];

        // Esta variable controlará en qué columna global vamos pintando
        let columnaGlobalActual = 0;

        // 3. ITERAMOS GRUPO A GRUPO
        for (let grupo of grupos) {
            if (grupo.items.length === 0) continue;

            let indexDentroDelGrupo = 0;

            for (let item of grupo.items) {
                const cantidad = item.system.cantidadDraft || 1;

                for (let i = 0; i < cantidad; i++) {
                    // Matemáticas invertidas:
                    // Y = El resto de dividir por maxFilas (baja 0, 1, 2, 3, 4...)
                    // X = El número entero de dividir por maxFilas (columna 0, luego 1...)
                    const fila = indexDentroDelGrupo % maxFilas;
                    const columnaLocal = Math.floor(indexDentroDelGrupo / maxFilas);

                    const precio = item.system.costeEsencia || 0;
                    let nombreMostrado = item.type === "carta_alma" ? item.name : `💰 ${precio}  |  ${item.name}`;

                    tokensToCreate.push({
                        name: nombreMostrado,
                        texture: { src: item.img },
                        width: 2.5,
                        height: 3.6,
                        // Sumamos la columna global + la columna que ocupe dentro de su propio grupo
                        x: startX + ((columnaGlobalActual + columnaLocal) * espaciadoX * gridSize),
                        y: startY + (fila * espaciadoY * gridSize),
                        lockRotation: true,
                        displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                        flags: {
                            dorso_oscuro: {
                                isCard: true,
                                isMercader: true,
                                isGlobal: true,
                                itemId: item.id,
                                type: item.type,
                                nombreReal: item.name,
                                imgReal: item.img
                            }
                        }
                    });

                    indexDentroDelGrupo++;
                }
            }

            // SALTO DE SECCIÓN: Calculamos cuántas columnas ha ocupado este grupo
            // Math.ceil nos dice el total de columnas. Ej: 12 cartas / 5 = 2.4 -> Ocupa 3 columnas.
            const columnasUsadasPorEsteGrupo = Math.ceil(indexDentroDelGrupo / maxFilas);

            // Sumamos las columnas usadas a la global, más 1 extra como margen de "pasillo" entre secciones
            columnaGlobalActual += columnasUsadasPorEsteGrupo + 1;
        }

        // 4. Spawneamos todo de golpe
        if (tokensToCreate.length > 0) {
            await canvas.scene.createEmbeddedDocuments("Token", tokensToCreate);
        }
    }


    /**
     * INYECCIÓN MASIVA E INTELIGENTE DE CARTAS INICIALES
     * Inserta en la ficha de cada PJ hasta tener 4 Ataques, 4 Curas y 4 Defensas base.
     */
    static async inyectarCartasInicialesMasivo() {
        // 1. Buscamos las cartas patrón en la base de datos global de Ítems del mundo
        const nombresBase = ["Ataque", "Cura", "Defensa"];
        const cartasPatron = {};

        for (const nombre of nombresBase) {
            const item = game.items.find(i => i.name === nombre && (i.type === "carta_poder" || i.type === "carta_objeto"));
            if (!item) {
                return ui.notifications.error(`Dorso Oscuro | No se encontró la carta patrón llamada exactamente "${nombre}" en la pestaña de Objetos.`);
            }
            cartasPatron[nombre] = item;
        }

        // 2. Filtramos los Personajes Jugadores reales de la sesión (excluyendo mesas, bosses y papeleras)
        const jugadores = game.actors.filter(a =>
            a.type === "personaje" &&
            !a.flags.dorso_oscuro?.isBossSession &&
            !a.flags.dorso_oscuro?.isPapelera &&
            !a.system.esFichaMesa
        );

        if (jugadores.length === 0) return ui.notifications.warn("No hay personajes jugadores en la partida.");

        let totalModificado = 0;
        ui.notifications.info("Analizando y completando barajas iniciales...");

        // 3. Procesamos ficha por ficha
        for (let actor of jugadores) {
            // Contamos qué cartas tiene ya en su inventario de Items propio de la ficha
            const cartasEnFicha = actor.items.contents;
            const cartasAAñadir = [];

            for (const nombre of nombresBase) {
                const copiasActuales = cartasEnFicha.filter(c => c.name === nombre).length;
                const faltantes = 4 - copiasActuales;

                // Si le faltan cartas para llegar a 4 en su ficha, preparamos el objeto clonado del patrón
                if (faltantes > 0) {
                    const patron = cartasPatron[nombre];

                    for (let i = 0; i < faltantes; i++) {
                        // Creamos una copia limpia del objeto para inyectarlo en el actor
                        cartasAAñadir.push(patron.toObject());
                    }
                }
            }

            // Si hay cartas faltantes, las inyectamos directamente en el Actor (Ficha de personaje)
            if (cartasAAñadir.length > 0) {
                await actor.createEmbeddedDocuments("Item", cartasAAñadir);
                totalModificado++;
                console.log(`Dorso Oscuro | Ficha de ${actor.name} completada con ${cartasAAñadir.length} cartas base.`);
            }
        }

        if (totalModificado > 0) {
            ui.notifications.info(`¡Barajas completadas! Se han añadido las cartas iniciales directamente en las fichas de ${totalModificado} jugadores.`);
        } else {
            ui.notifications.info("Todos los jugadores ya tenían sus 4 copias base en sus fichas. No hizo falta añadir nada.");
        }
    }
}