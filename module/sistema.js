// module/sistema.js
import { PersonajeData, HabilidadData, CartaAlmaData, CartaJugableData, CartaEquipoData, ObjetoData, MonstruoData} from "./models.mjs";
import { PersonajeSheet } from "./sheets/personaje-sheet.mjs";
import { HabilidadSheet } from "./sheets/habilidad-sheet.mjs";
import { CartaSheet } from "./sheets/carta-sheet.mjs";
import { ManoHUD } from "./apps/mano-hud.mjs";
import { DJHUD } from "./apps/dj-hud.mjs";
import { MercaderHud } from "./apps/mercader-hud.mjs";
import { ObjetoSheet } from "./sheets/objeto-sheet.mjs";
import { MonstruoSheet } from "./sheets/monstruo-sheet.mjs";




Hooks.once('init', async function() {
    console.log("Dorso Oscuro | Inicializando");

    // Definir iconos por defecto para tipos de ítem
    // Definir iconos por defecto para tipos de ítem en la interfaz
    CONFIG.Item.typeIcons["habilidad"] = "icons/svg/book.svg";
    CONFIG.Item.typeIcons["carta_alma"] = "icons/svg/aura.svg";
    CONFIG.Item.typeIcons["carta_poder"] = "icons/svg/card-joker.svg";
    CONFIG.Item.typeIcons["carta_objeto"] = "icons/svg/card-joker.svg";
    CONFIG.Item.typeIcons["carta_equipo"] = "icons/svg/shield.svg";
    CONFIG.Item.typeIcons["objeto"] = "icons/svg/chest.svg";
    CONFIG.Item.typeIcons["arma"] = "icons/svg/sword.svg";
    CONFIG.Actor.typeIcons["monstruo"] = "icons/svg/blood.svg"; // Cambiado a Actor porque monstruo es Actor

    // --- REGISTRO DE AJUSTES DEL SISTEMA ---
    game.settings.register("dorso_oscuro", "equiposDesbloqueados", {
        name: "Cartas de Equipo Descubiertas",
        scope: "world",
        config: false, // No se ve en el menú de ajustes normal
        type: Object,
        default: {} // Guardaremos algo como { "id-de-la-carta": true }
    });

    // --- APAGAR LA REGLA DE ARRASTRE NATIVA (ESTILO JUEGO DE MESA) ---
    if (CONFIG.Token && CONFIG.Token.rulerClass) {
        Object.defineProperty(CONFIG.Token.rulerClass.prototype, "isVisible", {
            get: function() { return false; }
        });
    }

    CONFIG.Actor.dataModels.personaje = PersonajeData;
    CONFIG.Actor.dataModels.monstruo = MonstruoData;

    // Registramos las habilidades, objetos y las cartas
    CONFIG.Item.dataModels.habilidad = HabilidadData;
    CONFIG.Item.dataModels.carta_alma = CartaAlmaData;
    CONFIG.Item.dataModels.carta_poder = CartaJugableData;
    CONFIG.Item.dataModels.carta_objeto = CartaJugableData;
    CONFIG.Item.dataModels.carta_equipo = CartaEquipoData;
    CONFIG.Item.dataModels.arma = ObjetoData;
    CONFIG.Item.dataModels.objeto = ObjetoData;


    // Actualizamos Actors a su ruta estricta en V13/V14
    foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
    foundry.documents.collections.Actors.registerSheet("dorso_oscuro", PersonajeSheet, {
        types: ["personaje"],
        makeDefault: true
    });

    // Actualizamos Items a su ruta estricta en V13/V14
    foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
    foundry.documents.collections.Items.registerSheet("dorso_oscuro", HabilidadSheet, {
        types: ["habilidad"],
        makeDefault: true
    });

    foundry.documents.collections.Items.registerSheet("dorso_oscuro", CartaSheet, {
        types: ["carta_alma", "carta_poder", "carta_objeto","carta_equipo"],
        makeDefault: true
    });

    foundry.documents.collections.Items.registerSheet("dorso_oscuro", ObjetoSheet, {
        types: ["objeto", "arma"],
        makeDefault: true
    });

    foundry.documents.collections.Actors.registerSheet("dorso_oscuro", MonstruoSheet, {
        types: ["monstruo"],
        makeDefault: true
    });

    await loadTemplates([
        "systems/dorso_oscuro/templates/parts/skill-list.hbs"
    ]);



    // --- INTERCEPTAR EL DRAG & DROP EN EL TABLERO ---
    Hooks.on("dropCanvasData", async (canvas, data) => {
        // --- CHIVATO PARA LA CONSOLA (F12) ---
        console.log("Dorso Oscuro | Datos arrastrados al tablero:", data);

        // Aceptamos nuestro tipo personalizado O un Item nativo de Foundry
        if (data.type !== "CartaDorsoOscuro" && data.type !== "Item") return true;

        let actor = null;
        let item = null;

        // LÓGICA 1: Si viene del directorio nativo de Items de Foundry
        if (data.type === "Item") {
            item = await fromUuid(data.uuid);

            // Si no existe o no es una de nuestras cartas, dejamos que Foundry haga lo suyo nativamente
            if (!item || !["carta_alma", "carta_poder", "carta_objeto", "carta_equipo"].includes(item.type)) {
                return true;
            }

            // Si el item no tiene un 'parent', es un Item Global de la barra lateral
            data.isGlobal = !item.isOwned;
            if (!data.isGlobal) {
                actor = item.parent;
            }
        }
        // LÓGICA 2: Si viene desde nuestros HUDs (CartaDorsoOscuro)
        else {
            if (data.isGlobal) {
                item = game.items.get(data.itemId);
                if (!item) return true;
            } else {
                actor = game.actors.get(data.actorId);
                item = actor?.items.get(data.itemId);
                if (!actor || !item) return true;
            }
        }


        // --- DIMENSIONES DINÁMICAS ---
        let width = 2.5;
        let height = 3.6;

        // Si es Equipo Horizontal, invertimos las dimensiones
        if (item.type === "carta_equipo" && item.system.formato === "horizontal") {
            width = 5;
            height = 3.6;

        } else if (item.system.esCriatura) {
            // Si es una criatura, doblamos el tamaño
            width *= 2;
            height *= 2;
        }

        // --- 1. LÓGICA DE ECONOMÍA Y CARTA EN MANO ---
        let cardPassed = false;

        // NUEVO: Si la carta viene de la barra lateral (Global) y es el DJ, omitimos la lógica de mano y energía
        if (data.isGlobal && game.user.isGM) {
            ChatMessage.create({
                speaker: { alias: "SISTEMA" },
                content: `<b style="color: #ffaa00;">¡El Director de Juego despliega una carta especial sobre la mesa! (${item.name})</b>`
            });
        }
        // Lógica normal para cartas bajadas desde la mano de un jugador/criatura
        else if (item.type !== "carta_alma" && item.type !== "carta_equipo") {
            if (!actor) return false; // Por seguridad, si no hay actor, cancelamos

            const hand = game.cards.get(actor.system.handId);
            const enJuego = game.cards.get(actor.system.enJuegoId);

            if (!hand || !enJuego) {
                ui.notifications.error("Fallo crítico: No se encuentran las pilas de cartas.");
                return false;
            }

            const cardInHand = hand.cards.find(c => c.getFlag("dorso_oscuro", "itemId") === item.id);
            if (!cardInHand) {
                ui.notifications.error(`No puedes jugar '${item.name}': no está en tu mano.`);
                return false;
            }

            // BYPASS DE ENERGÍA PARA EL BOSS
            const isBoss = actor.flags.dorso_oscuro?.isBossSession;

            if (!isBoss) {
                const coste = item.system.costeEnergia || 0;
                const energiaActual = actor.system.energia.value || 0;

                if (energiaActual < coste) {
                    ui.notifications.error(`¡No tienes energía! "${item.name}" cuesta ${coste}⚡ y tienes ${energiaActual}⚡.`);
                    return false;
                }

                const aporteInmediato = item.type === "carta_poder" ? (item.system.energiaAportada || 0) : 0;
                let nuevaEnergia = actor.system.energia.value - coste + aporteInmediato;
                await actor.update({"system.energia.value": Math.max(0, nuevaEnergia)});
            } else {
                ChatMessage.create({
                    speaker: { alias: "SISTEMA" },
                    content: `<b style="color: #ff4444;">¡La Criatura coloca una carta oculta sobre la mesa!</b>`
                });
            }

            // Movemos la carta
            await hand.pass(enJuego, [cardInHand.id]);
            cardPassed = true;
        }


        // --- 2. CONSTRUCCIÓN DEL TOKEN ---
        if (item.type === "carta_alma") {

            // --- A) EL ALMA DE LA CRIATURA DEL DJ ---
            if (actor.flags.dorso_oscuro?.isBossSession) {
                const reversoPorDefecto = "systems/dorso_oscuro/assets/cartas/reverso_carta1.png";
                let reverso = data.backImg || actor.getFlag("dorso_oscuro", "dorsoUrl") || reversoPorDefecto;

                if (item.system.esDeCriatura && item.system.idCriatura) {
                    // Si es una criatura, construimos la ruta automáticamente
                    reverso = `systems/dorso_oscuro/assets/cartas/criaturas/${item.system.idCriatura}_dorso_cartas.jpg`;
                }

                const estaOculta = data.faceDown || false;

                const tokenData = await actor.getTokenDocument({
                    name: estaOculta ? "Criatura Oculta" : `❤️ ${item.system.vida.value}  |  ⚡ ${actor.system.energia.value}  |  ${item.name}`,
                    texture: { src: estaOculta ? reverso : item.img },
                    width: width,
                    height: height,
                    x: data.x - (canvas.grid.size * width) / 2,
                    y: data.y - (canvas.grid.size * height) / 2,
                    actorLink: true,
                    lockRotation: true,
                    displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                    displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
                    // ¡Añadimos estos flags vitales!
                    flags: {
                        dorso_oscuro: {
                            isCard: true,
                            type: item.type,
                            actorId: actor.id,
                            itemId: item.id,
                            isFaceDown: estaOculta,
                            imgReal: item.img,
                            nombreReal: item.name,
                            reverso: reverso
                        }
                    }
                });

                await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);

            } else {
                // --- B) EL ALMA DE LOS JUGADORES (Actor temporal) ---
                let folderId = null;


                const tempActorData = {
                    name: `[Alma] ${item.name} (${actor.name})`,
                    type: "personaje",
                    img: item.img,
                    folder: folderId, // Si es un jugador, se queda en null (va al raíz directo)
                    system: {
                        hp: { value: item.system.vida.value, max: item.system.vida.max },
                        energia: { value: actor.system.energia.value, max: 7 }
                    },
                    prototypeToken: {
                        texture: { src: item.img },
                        width: width,
                        height: height,
                        displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                        displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                        actorLink: true,
                        bar1: { attribute: "system.hp" },
                        bar2: { attribute: "system.energia" }
                    },
                    flags: { dorso_oscuro: { isTempAlma: true, ownerId: actor.id } },
                    // Heredamos los permisos del jugador para que sea el dueño legítimo
                    ownership: actor.ownership
                };

                const tempActor = await Actor.create(tempActorData);


                const tokenData = await tempActor.getTokenDocument({
                    name: `❤️ ${item.system.vida.value}  |  ⚡ ${actor.system.energia.value}  |  ${item.name}`,
                    x: data.x - (canvas.grid.size * width) / 2,
                    y: data.y - (canvas.grid.size * height) / 2,
                    actorLink: true,
                    lockRotation: true,
                    displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                    displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
                    flags: { dorso_oscuro: { isCard: true, type: item.type, actorId: actor.id, itemId: item.id } }
                });

                await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
            }

        } else {
            // C) CARTAS NORMALES (Poderes y Objetos)...
            // --- GESTIÓN DE DORSOS ---
            const reversoPorDefecto = "systems/dorso_oscuro/assets/cartas/reverso_carta1.png";
            let reverso = data.backImg || reversoPorDefecto;

            // --- Dorso para Cartas de Equipo ---
            if (item.type === "carta_equipo") {
                if (item.system.formato === "horizontal") {
                    reverso = "systems/dorso_oscuro/assets/cartas/reverso_equipo.jpg";
                } else {
                    // Si queremos cambiar el dorso vertical, lo cambiamos aquí, por ahora usamos el de carta normal
                    reverso = "systems/dorso_oscuro/assets/cartas/reverso_equipo.jpg";
                }
            }else if (item.system.esDeCriatura && item.system.idCriatura) {
                // Si es una criatura, construimos la ruta automáticamente
                reverso = `systems/dorso_oscuro/assets/cartas/criaturas/${item.system.idCriatura}_dorso_cartas.jpg`;
            }


            const estaOculta = data.faceDown || false;

            let tokenName = estaOculta ? "Carta Oculta" : item.name;

            // --- NUEVO: ¿Es una Carta con Vida de base (Objeto o Poder)? ---
            if (item.system.vida && item.system.vida.max > 0) {
                // Al bajarla, le rellenamos la vida al máximo
                await item.update({"system.vida.value": item.system.vida.max});
                if (!estaOculta) {
                    tokenName = `❤️ ${item.system.vida.max}  |  ${item.name}`;
                }
            }


            const tokenData = {
                name: tokenName,
                texture: { src: estaOculta ? reverso : item.img },
                width: width,
                height: height,
                x: data.x - (canvas.grid.size * width) / 2,
                y: data.y - (canvas.grid.size * height) / 2,

                // --- MEJORA DE PERMISOS Y VÍNCULO ---
                actorId: actor ? actor.id : null, // Vinculamos el token al personaje en la raíz
                actorLink: false,                // IMPORTANTE: Unlinked para que cada carta sea independiente
                ownership: actor ? actor.ownership : { default: 0 }, // Hereda quién es el dueño del personaje

                lockRotation: true,
                displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
                flags: {
                    dorso_oscuro: {
                        isCard: true,
                        itemId: item.id,
                        actorId: actor ? actor.id : null,
                        type: item.type,
                        isFaceDown: estaOculta,
                        imgReal: item.img,
                        nombreReal: item.name,
                        reverso: reverso
                    }
                }
            };
            await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);



        }

        // --- 3. ACTUALIZAR HUD AL FINAL ---
        // ¡Este era el fallo! Al ponerlo aquí garantizamos que el token YA existe en la mesa antes de calcular.
        if (cardPassed || item.type === "carta_alma") {
            const hud = Object.values(ui.windows).find(w => w.id === "mano-hud" && w.actor?.id === actor.id);
            if (hud) hud.render(true);
        }

        return false;
    });

// --- INTERCEPTAR BORRADO DE TOKENS (Pasar de En Juego a Descarte o Eliminadas) ---
    Hooks.on("deleteToken", async (tokenDocument, options, userId) => {

        // Ignoramos si es limpieza total (DJ cerrando tablero) o si estamos devolviendo a la mano
        if (options.limpiezaTotal || options.devolviendoMano) return;
        // Si es el DJ cerrando el tablero, ignoramos el proceso porque las pilas van a desaparecer.
        if (options.limpiezaTotal) return;

        // Solo ejecuta esto el jugador que ha borrado el token, para no duplicar acciones
        if (game.user.id !== userId) return;

        const flags = tokenDocument.flags.dorso_oscuro;
        if (flags && flags.isCard && flags.type !== "carta_alma") {
            const actor = game.actors.get(flags.actorId);
            if (!actor) return;

            const enJuego = game.cards.get(actor.system.enJuegoId);
            const discard = game.cards.get(actor.system.discardId);
            const eliminadas = game.cards.get(actor.system.eliminadasId); // Traemos la pila de eliminadas

            if (enJuego && discard && eliminadas) {
                // Buscamos la carta física en la pila "En Juego"
                const card = enJuego.cards.find(c => c.flags.dorso_oscuro?.itemId === flags.itemId);

                // Buscamos los datos originales de la carta en la ficha del personaje
                const item = actor.items.get(flags.itemId);

                if (card && item) {

                    // EL GRAN FILTRO: ¿Debe desaparecer?
                    let debeDesaparecer = item.system.desaparece;
                    const isBoss = actor.flags.dorso_oscuro?.isBossSession;

                    if (isBoss) {
                        // LA REGLA DE LA CRIATURA: Sus cartas NUNCA se destierran.
                        debeDesaparecer = false;
                    } else {
                        // Si es jugador y era una carta con Vida (>0 de base) y muere, va a Eliminadas.
                        if (item.system.vida && item.system.vida.max > 0) {
                            debeDesaparecer = true;
                        }
                    }

                    if (debeDesaparecer) {
                        await card.pass(eliminadas); // A la fosa común (Jugadores)
                    } else {
                        await card.pass(discard);    // Al descarte normal (Criatura / Cartas normales)
                    }



                    // Refrescamos el HUD para que se actualicen los números
                    const hud = Object.values(ui.windows).find(w => w.id === "mano-hud" && w.actor?.id === actor.id);
                    if (hud) hud.render(true);
                }
            }
        }
    });

    // --- BOTÓN DE ACCESO RÁPIDO A LA MESA DE JUEGO (FOUNDRY V14) ---
    Hooks.on("getSceneControlButtons", (controls) => {
        const tokenControls = controls.tokens;

        // --- BOTÓN EXCLUSIVO DEL DJ ---
        if (game.user.isGM) {
            const botonDJ = {
                name: "panel-dj",
                title: "Panel del Director",
                icon: "fas fa-dragon", // Un dragón para diferenciarlo
                button: true,
                onClick: () => {
                    new DJHUD().render(true);
                }
            };
            const botonMercader = {
                name: "panel-mercader",
                title: "El Mercader",
                icon: "fas fa-store",
                button: true,
                onClick: () => { new MercaderHud().render(true); }
            };

            // Inyectamos de forma segura según la arquitectura (igual que el otro)
            if (Array.isArray(tokenControls.tools)) {
                if (!tokenControls.tools.find(t => t.name === "panel-dj")) tokenControls.tools.push(botonDJ);
                if (!tokenControls.tools.find(t => t.name === "panel-mercader")) tokenControls.tools.push(botonMercader);
            } else {
                if (!tokenControls.tools["panel-dj"]) tokenControls.tools["panel-dj"] = botonDJ;
                if (!tokenControls.tools["panel-mercader"]) tokenControls.tools["panel-mercader"] = botonMercader;
            }
        }

        if (tokenControls && tokenControls.tools) {

            const botonMesa = {
                name: "abrir-mesa",
                title: "Mesa de Juego",
                icon: "fas fa-gamepad",
                button: true,
                // ¡CAMBIO CLAVE! Añadimos 'async' aquí
                onClick: async () => {
                    const actor = game.user.character;
                    if (actor) {
                        // Si no tiene mazo, lo generamos automáticamente
                        if (!actor.system.deckId) {
                            ui.notifications.info("Generando tu Mesa de Juego por primera vez. Un momento...");

                            try {
                                // Llamamos a la función mágica de tu ficha de personaje "por debajo"
                                if (typeof actor.sheet._registrarMazoDeJuego === 'function') {
                                    await actor.sheet._registrarMazoDeJuego();

                                    // Le damos medio segundo a la base de datos para asentar los IDs
                                    await new Promise(resolve => setTimeout(resolve, 500));

                                    // Abrimos la mesa
                                    new ManoHUD(actor).render(true);
                                } else {
                                    ui.notifications.error("No se pudo autogenerar. Por favor, abre tu ficha de personaje manualmente.");
                                }
                            } catch (error) {
                                console.error("Dorso Oscuro | Error al autogenerar mazos:", error);
                                ui.notifications.error("Hubo un error al crear las cartas. Ábrelo desde tu ficha.");
                            }
                        } else {
                            // Si ya tiene mazo, abre la mesa del tirón
                            new ManoHUD(actor).render(true);
                        }
                    } else {
                        ui.notifications.error("Tu cuenta no tiene personaje asignado.");
                    }
                }
            };

            if (Array.isArray(tokenControls.tools)) {
                if (!tokenControls.tools.find(t => t.name === "abrir-mesa")) {
                    tokenControls.tools.push(botonMesa);
                }
            } else {
                if (!tokenControls.tools["abrir-mesa"]) {
                    tokenControls.tools["abrir-mesa"] = botonMesa;
                }
            }
        }
    });

    Hooks.once("ready", async () => {
        // --- APAGAR ROTACIÓN AUTOMÁTICA DEL CORE (V13/V14) ---
        // Solo lo ejecuta el DJ para no saturar la base de datos con los jugadores
        if (game.user.isGM) {
            const settingKey = "automaticTokenRotation"; // El nombre interno del ajuste

            // Comprobamos que el ajuste existe en esta versión de Foundry
            if (game.settings.settings.has(`core.${settingKey}`)) {
                // Si está encendido (true), lo apagamos a la fuerza
                if (game.settings.get("core", settingKey) === true) {
                    await game.settings.set("core", settingKey, false);
                    console.log("Dorso Oscuro | Ajuste del Core: Rotación automática desactivada nativamente.");
                }
            }
        }

        // ==========================================
        // 🔥 NUEVO: AUTO-DESPLIEGUE DE TABLEROS CORE 🔥
        // ==========================================
        // Comprobamos si el mundo está totalmente vacío de escenas
        if (game.scenes.size === 0) {
            console.log("Dorso Oscuro | Detectado mundo nuevo. Desplegando tableros de juego...");

            // Apuntamos al compendio del sistema: "id-sistema.name-pack"
            const pack = game.packs.get("dorso_oscuro.tableros-core");

            if (pack) {
                // Cargamos los documentos puros del compendio
                const escenasCompendio = await pack.getDocuments();

                if (escenasCompendio.length > 0) {

                    // 1. CREAMOS LA CARPETA (Si no existe)
                    let folder = game.folders.find(f => f.name === "Tableros de Juego" && f.type === "Scene");
                    if (!folder) {
                        // Puedes cambiar el nombre y el color hexadecimal (aquí puse un tono marrón oscuro)
                        folder = await Folder.create({ name: "Tableros de Juego", type: "Scene", color: "#4a3424" });
                    }

                    // 2. CONVERTIMOS LOS DATOS Y ASIGNAMOS LA CARPETA
                    const escenasData = escenasCompendio.map(e => {
                        let obj = e.toObject();
                        obj.folder = folder.id; // Vinculamos la escena a la carpeta recién creada
                        return obj;
                    });

                    // 3. CREAMOS LAS ESCENAS EN EL MUNDO
                    const escenasImportadas = await Scene.createDocuments(escenasData);

                    ui.notifications.info("¡Bienvenido a Dorso Oscuro! Se han desplegado los tableros de juego iniciales.");

                    // 4. ACTIVAMOS LA PRIMERA ESCENA
                    if (escenasImportadas.length > 0) {
                        await escenasImportadas[0].update({ active: true });
                    }
                }
            }
        }

    });

    // --- ACTUALIZACIÓN REACTIVA GLOBAL ---
    const refrescarInterfaces = (documento) => {
        // 1. Refresca el panel del DJ siempre
        const djHud = Object.values(ui.windows).find(w => w.id === "dj-hud");
        if (djHud) djHud.render(false);

        // 2. ¿A quién pertenece este documento que acaba de cambiar?
        let actorId = null;

        if (documento) {
            if (documento.documentName === "Actor") {
                actorId = documento.id;
            } else if (documento.documentName === "Item" && documento.parent) {
                actorId = documento.parent.id;
            } else if (documento.documentName === "Card" || documento.documentName === "Cards") {
                // Si es una Carta, su "padre" es la pila (Mano, Mazo...). Si es la Pila entera, es el documento en sí.
                const pilaDeCartas = documento.documentName === "Card" ? documento.parent : documento;

                // Buscamos qué personaje de la partida tiene esta pila asignada en su ficha
                const dueño = game.actors.find(a =>
                    a.system.deckId === pilaDeCartas.id ||
                    a.system.handId === pilaDeCartas.id ||
                    a.system.discardId === pilaDeCartas.id ||
                    a.system.eliminadasId === pilaDeCartas.id ||
                    a.system.enJuegoId === pilaDeCartas.id
                );

                if (dueño) actorId = dueño.id;
            }
        }

        // 3. Si hemos encontrado a su dueño, repintamos SU ventana de juego
        if (actorId) {
            const manoHud = Object.values(ui.windows).find(w => w.id === "mano-hud" && w.actor?.id === actorId);
            if (manoHud) manoHud.render(false); // repintado sin saltos de scroll
        }
    };

// Enganchamos todo al nuevo cazador unificado
    Hooks.on("updateActor", refrescarInterfaces);
    Hooks.on("updateItem", refrescarInterfaces);
    Hooks.on("createCard", refrescarInterfaces);
    Hooks.on("deleteCard", refrescarInterfaces);
    Hooks.on("updateCard", refrescarInterfaces);
    Hooks.on("updateCards", refrescarInterfaces);


    // --- PERSONALIZAR EL HUD DEL TOKEN (BOTÓN TOGGLE REVELAR/OCULTAR) ---
    Hooks.on("renderTokenHUD", (app, html, data) => {
        const $html = $(html);
        const tokenDoc = app.object?.document;
        if (!tokenDoc) return;
        const flags = tokenDoc.flags?.dorso_oscuro;

        if (!flags || !flags.isCard) return;

        // Limpieza nativa
        $html.find('.control-icon[data-action="combat"], .control-icon[data-action="target"], .control-icon[data-action="effects"], .control-icon[data-action="visibility"], .attribute.elevation').hide();

        // --- 3. BOTÓN DE REVELAR / OCULTAR (TOGGLE) ---
        if (game.user.isGM) {


            const esAlmaJugador = flags.type === "carta_alma" && tokenDoc.actor?.getFlag("dorso_oscuro", "isTempAlma");

            // Solo mostramos el botón si NO es el alma de un jugador
            // (Esto permite que las cartas normales y el Alma del Boss sigan teniendo el botón)
            if (!esAlmaJugador) {
                const icono = flags.isFaceDown ? "fa-eye" : "fa-eye-slash";
                const titulo = flags.isFaceDown ? "Revelar Carta" : "Ocultar Carta de nuevo";
                const color = flags.isFaceDown ? "#66ff66" : "#ffaa00";

                const btnToggle = $(`
                <div class="control-icon" title="${titulo}" style="border: 2px solid ${color}; border-radius: 5px; background: rgba(0,0,0,0.5);">
                    <i class="fas ${icono}" style="color: ${color};"></i>
                </div>
            `);

                $html.find('.col.right').prepend(btnToggle);

                btnToggle.click(async () => {
                    const nuevoEstado = !flags.isFaceDown;

                    // 1. Calculamos el dorso con lógica de respaldo
                    let dorsoFinal = flags.reverso || "systems/dorso_oscuro/assets/cartas/reverso_carta1.png";

                    // Si es equipo y no tiene el flag guardado, forzamos el suyo
                    if (flags.type === "carta_equipo") {
                        dorsoFinal = "systems/dorso_oscuro/assets/cartas/reverso_equipo.jpg";
                    }

                    const nuevaImagen = nuevoEstado ? dorsoFinal : flags.imgReal;

                    // --- NUEVO: Construir título con vida si se está revelando ---
                    let nombreMostrado = flags.nombreReal;
                    const actor = game.actors.get(flags.actorId);
                    const item = actor?.items.get(flags.itemId);

                    // Si el objeto existe y tiene vida máxima > 0, lo pintamos con el formato
                    if (flags.isMercader) {
                        const precio = flags.costeEsencia || 0;
                        nombreMostrado = `💰 ${precio}  |  ${flags.nombreReal}`;
                    } else if (item && item.system.vida && item.system.vida.max > 0) {
                        nombreMostrado = `❤️ ${item.system.vida.value}  |  ${flags.nombreReal}`;
                    }

                    const nuevoNombre = nuevoEstado ? (flags.type === "carta_alma" ? "Criatura Oculta" : "Carta Oculta") : nombreMostrado;

                    await tokenDoc.update({
                        "name": nuevoNombre,
                        "texture.src": nuevaImagen,
                        "flags.dorso_oscuro.isFaceDown": nuevoEstado
                    });

                    app.close();
                });
            }
        }

        if (flags.type === "carta_alma") return;

        // Botones de descarte para cartas normales
        // Botones de descarte para cartas normales
        const btnDescarte = $(`<div class="control-icon" title="Descarte"><i class="fas fa-trash-can" style="color: #aaa;"></i></div>`);
        const btnEliminadas = $(`<div class="control-icon" title="Destierro"><i class="fas fa-ban" style="color: #ff4444;"></i></div>`);
        $html.find('.col.left').append(btnDescarte);
        $html.find('.col.right').append(btnEliminadas);

        // --- 4. BOTONES DINÁMICOS Y GESTIÓN DE MANO ---
        const actor = game.actors.get(flags.actorId);
        const item = actor?.items.get(flags.itemId);

        // Si el token es nuestro, tiene un ítem válido y es una carta jugable (Poder u Objeto)
        if (actor && actor.isOwner && item && (item.type === "carta_poder" || item.type === "carta_objeto")) {

            // --- NUEVO: BOTÓN DE DEVOLVER A LA MANO ---
            const btnDevolver = $(`
                <div class="control-icon" title="Devolver a la Mano (Reembolsa Energía)" style="border: 2px solid #66ff66; border-radius: 5px; background: rgba(0,50,0,0.8); margin-top: 5px;">
                    <i class="fas fa-undo" style="color: #66ff66;"></i>
                </div>
            `);
            $html.find('.col.left').append(btnDevolver); // Lo ponemos a la izquierda, debajo del descarte

            btnDevolver.click(async () => {
                const enJuego = game.cards.get(actor.system.enJuegoId);
                const mano = game.cards.get(actor.system.handId);

                if (!enJuego || !mano) return ui.notifications.error("Faltan las pilas de cartas.");

                const card = enJuego.cards.find(c => c.flags.dorso_oscuro?.itemId === flags.itemId);

                if (card) {
                    // 1. Devolver la carta a la Mano
                    await enJuego.pass(mano, [card.id]);

                    // 2. Revertir el cálculo de energía (solo si no es Boss)
                    const isBoss = actor.flags.dorso_oscuro?.isBossSession;
                    if (!isBoss) {
                        const coste = item.system.costeEnergia || 0;
                        const aporteInmediato = item.type === "carta_poder" ? (item.system.energiaAportada || 0) : 0;

                        // Hacemos exactamente la matemática inversa al dropCanvasData
                        let energiaDevuelta = actor.system.energia.value + coste - aporteInmediato;

                        // Topamos la energía para que no baje de 0 ni supere el 7 (o el máximo que tenga)
                        energiaDevuelta = Math.max(0, Math.min(actor.system.energia.max || 7, energiaDevuelta));
                        await actor.update({"system.energia.value": energiaDevuelta});
                    }

                    // 3. Borrar el Token de la mesa pasándole una señal especial para el Hook de borrado
                    await tokenDoc.delete({ devolviendoMano: true });

                    ui.notifications.info(`Carta devuelta a la mano. Energía restaurada.`);
                    app.close(); // Cierra el Token HUD
                } else {
                    ui.notifications.warn("La carta ya no está en juego.");
                }
            });

            // Forzamos la conversión a número por seguridad (El código que ya pusimos antes)
            const maxMazo = Number(item.system.permiteBuscarMazo) || 0;
            const maxDescarte = Number(item.system.permiteBuscarDescarte) || 0;

            // Función creadora de botones y diálogos según el tipo
            const crearBotonBusqueda = (tipo, max, icono, color) => {
                if (max <= 0) return; // Si está a 0, ignoramos

                const titulo = tipo === "mazo" ? `Resolver: Buscar hasta ${max} cartas en el Mazo` : `Resolver: Recuperar hasta ${max} cartas del Descarte`;
                const btn = $(`
                    <div class="control-icon" title="${titulo}" style="border: 2px solid ${color}; border-radius: 5px; background: rgba(0,20,50,0.8);">
                        <i class="fas ${icono}" style="color: ${color};"></i>
                    </div>
                `);

                $html.find('.col.right').append(btn); // Lo apilamos a la derecha

                btn.click(async () => {
                    const mano = game.cards.get(actor.system.handId);
                    const pilaOrigen = game.cards.get(tipo === "mazo" ? actor.system.deckId : actor.system.discardId);

                    if (!mano || !pilaOrigen) return ui.notifications.error("Dorso Oscuro | Faltan las pilas de cartas del jugador.");

                    // En el mazo solo miramos las "availableCards", en el descarte miramos todas
                    const cartasDisponibles = tipo === "mazo" ? pilaOrigen.availableCards : pilaOrigen.cards.contents;

                    if (cartasDisponibles.length === 0) {
                        return ui.notifications.warn(`Tu pila de ${tipo} está vacía.`);
                    }

                    // Construimos la cuadrícula visual de cartas usando CSS GRID para mantener proporciones
                    let cardsHtml = `
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 15px; margin-bottom: 15px; max-height: 450px; overflow-y: auto; padding: 15px; background: rgba(0,0,0,0.5); border-radius: 5px;">`;

                    cartasDisponibles.forEach(c => {
                        cardsHtml += `
                            <div class="search-card-option" data-card-id="${c.id}" title="${c.name}" style="position: relative; cursor: pointer; border: 2px solid transparent; border-radius: 5px; transition: all 0.2s;">
                                <img src="${c.faces[0].img}" style="width: 100%; border-radius: 3px; pointer-events: none; box-shadow: 0 4px 6px rgba(0,0,0,0.5); display: block;">
                                
                                <a class="view-card-btn" data-img="${c.faces[0].img}" data-name="${c.name}" title="Ver Carta en Grande" style="position: absolute; top: -8px; right: -8px; background: #003366; color: white; border: 1px solid #00ccff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 13px; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.8); transition: transform 0.2s;">
                                    <i class="fas fa-search-plus"></i>
                                </a>
                            </div>
                        `;
                    });

                    cardsHtml += `</div>
                    <p style="text-align: center; color: #d4c4a8; font-family: 'Kalam', cursive; font-size: 16px;">
                        Seleccionadas: <span id="contador-busqueda">0</span> / ${max}
                    </p>`;

                    let dialogBusqueda = new Dialog({
                        title: tipo === "mazo" ? "Búsqueda en el Mazo" : "Recuperar del Descarte",
                        content: cardsHtml,
                        buttons: {
                            confirmar: {
                                icon: '<i class="fas fa-check"></i>',
                                label: "Llevar a la Mano",
                                callback: async (htmlContent) => {
                                    const selectedIds = [];
                                    htmlContent.find('.search-card-option.selected').each(function() {
                                        selectedIds.push($(this).data('cardId'));
                                    });

                                    if (selectedIds.length > 0) {
                                        // Pasa el array de cartas seleccionadas a la mano
                                        await pilaOrigen.pass(mano, selectedIds);
                                        ui.notifications.info(`${selectedIds.length} carta(s) enviada(s) a tu mano con éxito.`);

                                        // Regla sagrada: ¡Si se mira el mazo, siempre se baraja después!
                                        if (tipo === "mazo") await pilaOrigen.shuffle();
                                        app.close(); // Cerramos el HUD del Token
                                    } else {
                                        ui.notifications.warn("No seleccionaste ninguna carta, acción cancelada.");
                                    }
                                }
                            },
                            cancelar: {
                                icon: '<i class="fas fa-times"></i>',
                                label: "Cancelar"
                            }
                        },
                        render: (htmlContent) => {
                            let seleccionadas = 0;

                            // 1. Lógica del botón de VER EN GRANDE
                            htmlContent.find('.view-card-btn').click(function(ev) {
                                ev.stopPropagation(); // MUY IMPORTANTE: Evita que al hacer clic en la lupa se seleccione la carta
                                const imgSrc = $(this).data('img');
                                const cardName = $(this).data('name');

                                new ImagePopout(imgSrc, {
                                    title: cardName,
                                    shareable: false // No hace falta compartirla al chat
                                }).render(true);
                            });

                            // Efecto hover para la lupa
                            htmlContent.find('.view-card-btn').hover(
                                function() { $(this).css({'transform': 'scale(1.15)', 'background': '#005599'}); },
                                function() { $(this).css({'transform': 'scale(1)', 'background': '#003366'}); }
                            );

                            // 2. Lógica de SELECCIÓN DE CARTA
                            htmlContent.find('.search-card-option').click(function() {
                                const isSelected = $(this).hasClass('selected');

                                if (isSelected) {
                                    // Deseleccionar
                                    $(this).removeClass('selected').css({'border-color': 'transparent', 'transform': 'scale(1)', 'opacity': '1'});
                                    seleccionadas--;
                                } else {
                                    // Seleccionar
                                    if (seleccionadas >= max) {
                                        return ui.notifications.warn(`El efecto de esta carta solo te permite elegir un máximo de ${max}.`);
                                    }
                                    $(this).addClass('selected').css({'border-color': color, 'transform': 'scale(0.95)', 'opacity': '0.6'});
                                    seleccionadas++;
                                }
                                // Actualizar contador en la UI
                                htmlContent.find('#contador-busqueda').text(seleccionadas);
                            });
                        },
                        default: "confirmar"
                    }, { width: 700, classes: ["dorso_oscuro"] }); // Hacemos el diálogo un pelín más ancho (700px)

                    dialogBusqueda.render(true);
                });
            };

            // Llamamos a la función constructora para ambos casos
            crearBotonBusqueda("mazo", maxMazo, "fa-search", "#00ccff");
            crearBotonBusqueda("descarte", maxDescarte, "fa-history", "#ffaa00");
        }



    });

    // --- NUEVO HOOK: Refrescar el Panel del DJ cuando un token cambia en mesa ---
    Hooks.on("updateToken", (token, changes) => {
        if (changes.flags?.dorso_oscuro || changes.texture) {
            const djHud = Object.values(ui.windows).find(w => w.id === "dj-hud");
            if (djHud) djHud.render(false);
        }
    });

    // --- IMÁGENES POR DEFECTO PARA TODOS LOS TIPOS DE ITEM ---
    Hooks.on("preCreateItem", (item, data, options, userId) => {
        // Verificamos si no tiene imagen o si trae la bolsa por defecto de Foundry
        if (!data.img || data.img === "icons/svg/item-bag.svg") {

            // Diccionario con las rutas de las imágenes para cada tipo de template.json
            const iconosPorDefecto = {
                "habilidad": "icons/svg/book.svg",
                "carta_alma": "icons/svg/aura.svg",
                "carta_poder": "icons/svg/card-joker.svg",
                "carta_objeto": "icons/svg/card-joker.svg",
                "carta_equipo": "icons/svg/shield.svg",
                "arma": "icons/svg/sword.svg",
                "objeto": "icons/svg/chest.svg"
            };

            // Si el tipo de ítem que estamos creando está en el diccionario, aplicamos su icono
            if (iconosPorDefecto[item.type]) {
                item.updateSource({ img: iconosPorDefecto[item.type] });
            }
        }
    });

});