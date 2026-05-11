// module/sistema.js
import { PersonajeData, HabilidadData, CartaAlmaData, CartaJugableData } from "./models.mjs";
import { PersonajeSheet } from "./sheets/personaje-sheet.mjs";
import { HabilidadSheet } from "./sheets/habilidad-sheet.mjs";
import { CartaSheet } from "./sheets/carta-sheet.mjs";
import { ManoHUD } from "./apps/mano-hud.mjs";
import { DJHUD } from "./apps/dj-hud.mjs";

Hooks.once('init', async function() {
    console.log("Dorso Oscuro | Inicializando");

    // --- APAGAR LA REGLA DE ARRASTRE NATIVA (ESTILO JUEGO DE MESA) ---
    if (CONFIG.Token && CONFIG.Token.rulerClass) {
        Object.defineProperty(CONFIG.Token.rulerClass.prototype, "isVisible", {
            get: function() { return false; }
        });
    }

    CONFIG.Actor.dataModels.personaje = PersonajeData;

    // Registramos las habilidades y las nuevas cartas
    CONFIG.Item.dataModels.habilidad = HabilidadData;
    CONFIG.Item.dataModels.carta_alma = CartaAlmaData;
    CONFIG.Item.dataModels.carta_poder = CartaJugableData;
    CONFIG.Item.dataModels.carta_objeto = CartaJugableData;

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
        types: ["carta_alma", "carta_poder", "carta_objeto"],
        makeDefault: true
    });

    await loadTemplates([
        "systems/dorso_oscuro/templates/parts/skill-list.hbs"
    ]);

    // En module/sistema.js

    // --- INTERCEPTAR EL DRAG & DROP EN EL TABLERO ---
    // module/sistema.js

    // --- INTERCEPTAR EL DRAG & DROP EN EL TABLERO ---
    Hooks.on("dropCanvasData", async (canvas, data) => {
        if (data.type !== "CartaDorsoOscuro") return true;

        const actor = game.actors.get(data.actorId);
        const item = actor?.items.get(data.itemId);
        if (!actor || !item) return true;

        let width = 2.5;
        let height = 3.6;

        // Si es una criatura, doblamos el tamaño
        if (item.system.esCriatura) {
            width *= 2;
            height *= 2;
        }

        // --- 1. LÓGICA DE ECONOMÍA Y CARTA EN MANO ---
        let cardPassed = false;
        if (item.type !== "carta_alma") {
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

            // --- NUEVO: BYPASS DE ENERGÍA PARA EL BOSS ---
            const isBoss = actor.flags.dorso_oscuro?.isBossSession;

            if (!isBoss) {
                // Si es un jugador, controlamos su energía
                const coste = item.system.costeEnergia || 0;
                const energiaActual = actor.system.energia.value || 0;

                if (energiaActual < coste) {
                    ui.notifications.error(`¡No tienes energía! "${item.name}" cuesta ${coste}⚡ y tienes ${energiaActual}⚡.`);
                    return false; // Bloqueo de arrastre
                }

                const aporteInmediato = item.type === "carta_poder" ? (item.system.energiaAportada || 0) : 0;
                let nuevaEnergia = actor.system.energia.value - coste + aporteInmediato;
                await actor.update({"system.energia.value": Math.max(0, nuevaEnergia)});
                ui.notifications.info(`${actor.name} juega ${item.name}: -${coste}${aporteInmediato > 0 ? ' / +'+aporteInmediato : ''} Energía`);
            } else {
                // Si es el Boss, barra libre
                ui.notifications.info(`La Criatura coloca una carta sobre el juego.`);
            }

            // Movemos la carta
            await hand.pass(enJuego, [cardInHand.id]);
            cardPassed = true;
        }


        // --- 2. CONSTRUCCIÓN DEL TOKEN ---
        if (item.type === "carta_alma") {

            // --- A) EL ALMA DE LA CRIATURA DEL DJ ---
            if (actor.flags.dorso_oscuro?.isBossSession) {
                const reversoPorDefecto = "img_varias/cards/cartas_v2/reverso_carta1.png";
                const reverso = data.backImg || actor.getFlag("dorso_oscuro", "dorsoUrl") || reversoPorDefecto;
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
                let rootFolder = game.folders.find(f => f.name === "CARTAS" && f.type === "Actor");
                if (!rootFolder && game.user.isGM) rootFolder = await Folder.create({ name: "CARTAS", type: "Actor" });

                if (rootFolder) {
                    let playerFolder = game.folders.find(f => f.name === actor.name && f.type === "Actor" && f.folder?.id === rootFolder.id);
                    if (!playerFolder && game.user.isGM) playerFolder = await Folder.create({ name: actor.name, type: "Actor", folder: rootFolder.id });
                    if (playerFolder) folderId = playerFolder.id;
                }

                const tempActorData = {
                    name: `[Alma] ${item.name} (${actor.name})`,
                    type: "personaje",
                    img: item.img,
                    folder: folderId,
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
                    flags: { dorso_oscuro: { isTempAlma: true, ownerId: actor.id } }
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
            const reversoPorDefecto = "img_varias/cards/cartas_v2/reverso_carta1.png";
            const reverso = data.backImg || reversoPorDefecto;
            const estaOculta = data.faceDown || false;

            const tokenData = {
                name: estaOculta ? "Carta Oculta" : item.name,
                texture: { src: estaOculta ? reverso : item.img },
                width: width,
                height: height,
                x: data.x - (canvas.grid.size * width) / 2,
                y: data.y - (canvas.grid.size * height) / 2,
                lockRotation: true,
                displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
                flags: {
                    dorso_oscuro: {
                        isCard: true,
                        itemId: item.id,
                        actorId: actor.id,
                        type: item.type,
                        isFaceDown: estaOculta,
                        imgReal: item.img,
                        nombreReal: item.name
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
                    if (item.system.desaparece) {
                        await card.pass(eliminadas); // A la fosa común
                    } else {
                        await card.pass(discard);    // Al descarte normal
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

            // Inyectamos de forma segura según la arquitectura (igual que el otro)
            if (Array.isArray(tokenControls.tools)) {
                if (!tokenControls.tools.find(t => t.name === "panel-dj")) tokenControls.tools.push(botonDJ);
            } else {
                if (!tokenControls.tools["panel-dj"]) tokenControls.tools["panel-dj"] = botonDJ;
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
                const nuevaImagen = nuevoEstado ? (flags.reverso || "img_varias/cards/cartas_v2/reverso_carta1.png") : flags.imgReal;
                const nuevoNombre = nuevoEstado ? (flags.type === "carta_alma" ? "Criatura Oculta" : "Carta Oculta") : flags.nombreReal;

                await tokenDoc.update({
                    "name": nuevoNombre,
                    "texture.src": nuevaImagen,
                    "flags.dorso_oscuro.isFaceDown": nuevoEstado
                });

                ui.notifications.info(nuevoEstado ? "Carta ocultada." : `¡${flags.nombreReal} revelada!`);
                app.clear();
            });
        }

        if (flags.type === "carta_alma") return;

        // Botones de descarte para cartas normales
        const btnDescarte = $(`<div class="control-icon" title="Descarte"><i class="fas fa-trash-can" style="color: #aaa;"></i></div>`);
        const btnEliminadas = $(`<div class="control-icon" title="Destierro"><i class="fas fa-ban" style="color: #ff4444;"></i></div>`);
        $html.find('.col.left').append(btnDescarte);
        $html.find('.col.right').append(btnEliminadas);

        // (Lógica de clics de descarte aquí...)
    });

    // --- NUEVO HOOK: Refrescar el Panel del DJ cuando un token cambia en mesa ---
    Hooks.on("updateToken", (token, changes) => {
        if (changes.flags?.dorso_oscuro || changes.texture) {
            const djHud = Object.values(ui.windows).find(w => w.id === "dj-hud");
            if (djHud) djHud.render(false);
        }
    });

});