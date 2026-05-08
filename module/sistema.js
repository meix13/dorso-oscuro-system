// module/sistema.js
import { PersonajeData, HabilidadData, CartaAlmaData, CartaJugableData } from "./models.mjs";
import { PersonajeSheet } from "./sheets/personaje-sheet.mjs";
import { HabilidadSheet } from "./sheets/habilidad-sheet.mjs";
import { CartaSheet } from "./sheets/carta-sheet.mjs";

Hooks.once('init', async function() {
    console.log("Dorso Oscuro | Inicializando");

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

        const width = 2.5;
        const height = 3.6;

        // --- 1. LÓGICA DE ECONOMÍA Y CARTA EN MANO ---
        let cardPassed = false;
        if (item.type !== "carta_alma") {
            const hand = game.cards.get(actor.system.handId);
            const enJuego = game.cards.get(actor.system.enJuegoId);

            // 1. Comprobaciones de seguridad separadas
            if (!hand) {
                ui.notifications.error("Fallo crítico: No se encuentra la Mano del jugador.");
                return false;
            }
            if (!enJuego) {
                ui.notifications.error("Fallo crítico: No se encuentra la pila 'En Juego'. CIERRA LA MESA, pulsa F5 y vuelve a entrar.");
                return false;
            }

            // Usamos .getFlag() que es el método más seguro de Foundry para leer datos internos
            const cardInHand = hand.cards.find(c => c.getFlag("dorso_oscuro", "itemId") === item.id);

            if (!cardInHand) {
                ui.notifications.error(`No puedes jugar '${item.name}': el sistema no detecta que esté en tu mano.`);
                return false;
            }
            // --- NUEVO: CONTROL DE ENERGÍA ---
            const coste = item.system.costeEnergia || 0;
            const energiaActual = actor.system.energia.value || 0;

            if (energiaActual < coste) {
                ui.notifications.error(`¡No tienes suficiente energía! "${item.name}" cuesta ${coste}⚡ y solo tienes ${energiaActual}⚡.`);
                return false; // Bloquea la acción en seco y no crea el token
            }

            // 2. Si todo está correcto y tiene energía, aplicamos la economía
            const aporteInmediato = item.type === "carta_poder" ? (item.system.energiaAportada || 0) : 0;

            let nuevaEnergia = actor.system.energia.value - coste + aporteInmediato;
            await actor.update({"system.energia.value": Math.max(0, nuevaEnergia)});

            // 3. Mover la carta de forma 100% segura usando la API de la colección
            await hand.pass(enJuego, [cardInHand.id]);

            ui.notifications.info(`${actor.name} juega ${item.name}: -${coste}${aporteInmediato > 0 ? ' / +'+aporteInmediato : ''} Energía`);
            cardPassed = true;
        }


        // --- 2. CONSTRUCCIÓN DEL TOKEN ---
        if (item.type === "carta_alma") {
            // A) GESTIÓN DE CARPETAS
            let folderId = null;
            let rootFolder = game.folders.find(f => f.name === "CARTAS" && f.type === "Actor");
            if (!rootFolder && game.user.isGM) rootFolder = await Folder.create({ name: "CARTAS", type: "Actor" });

            if (rootFolder) {
                let playerFolder = game.folders.find(f => f.name === actor.name && f.type === "Actor" && f.folder?.id === rootFolder.id);
                if (!playerFolder && game.user.isGM) playerFolder = await Folder.create({ name: actor.name, type: "Actor", folder: rootFolder.id });
                if (playerFolder) folderId = playerFolder.id;
            }

            // B) CREACIÓN DEL ACTOR TEMPORAL
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
                displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
                flags: { dorso_oscuro: { isCard: true, type: item.type, actorId: actor.id, itemId: item.id } }
            });

            await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);

        } else {
            // C) CARTAS NORMALES (Poderes y Objetos)
            const tokenData = {
                name: item.name,
                texture: { src: item.img },
                x: data.x - (canvas.grid.size * width) / 2,
                y: data.y - (canvas.grid.size * height) / 2,
                width: width,
                height: height,
                lockRotation: false,
                displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
                displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
                flags: { dorso_oscuro: { isCard: true, type: item.type, actorId: actor.id, itemId: item.id } }
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

});