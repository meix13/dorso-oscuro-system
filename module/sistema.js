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

    Hooks.on("dropCanvasData", async (canvas, data) => {
        if (data.type !== "CartaDorsoOscuro") return true;

        const actor = game.actors.get(data.actorId);
        const item = actor?.items.get(data.itemId);
        if (!actor || !item) return true;

        // --- 1. AJUSTE DE TAMAÑO ---
        // Antes era 1.5 x 2.2. Vamos a probar con 2 x 2.8 para que se vea imponente
        const width = 2.5;
        const height = 3.6;

        // --- 2. LÓGICA DE ECONOMÍA Y "EN JUEGO" ---
        if (item.type !== "carta_alma") {
            const hand = game.cards.get(actor.system.handId);
            const enJuego = game.cards.get(actor.system.enJuegoId); // <-- CAMBIO AQUÍ
            const cardInHand = hand?.cards.find(c => c.flags.dorso_oscuro?.itemId === item.id);

            if (cardInHand) {
                const coste = item.system.costeEnergia || 0;
                const aporteInmediato = item.type === "carta_poder" ? (item.system.energiaAportada || 0) : 0;

                let nuevaEnergia = actor.system.energia.value - coste + aporteInmediato;
                await actor.update({"system.energia.value": Math.max(0, nuevaEnergia)});

                // Movemos la carta a la pila de "EN JUEGO"
                await cardInHand.pass(enJuego); // <-- CAMBIO AQUÍ

                ui.notifications.info(`${actor.name} juega ${item.name}: -${coste}${aporteInmediato > 0 ? ' / +'+aporteInmediato : ''} Energía`);

                const hud = Object.values(ui.windows).find(w => w.id === "mano-hud" && w.actor?.id === actor.id);
                if (hud) hud.render(true);
            }
        }

        // --- 3. CONSTRUCCIÓN DEL TOKEN ---
        const tokenData = {
            name: item.name,
            texture: { src: item.img },
            x: data.x - (canvas.grid.size * width) / 2,
            y: data.y - (canvas.grid.size * height) / 2,
            width: width,
            height: height,
            lockRotation: false, // <--- LIBERAMOS LA ROTACIÓN para que puedas girarlas a mano
            displayName: CONST.TOKEN_DISPLAY_MODES.HOVER, // Solo muestra el nombre al pasar el ratón
            flags: {
                dorso_oscuro: {
                    isCard: true,
                    type: item.type, // Guardamos si es poder u objeto
                    actorId: actor.id,
                    itemId: item.id
                }
            }
        };

        await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);
        return false;
    });

    // --- INTERCEPTAR BORRADO DE TOKENS (Pasar de En Juego a Descarte) ---
    Hooks.on("deleteToken", async (tokenDocument, options, userId) => {
        // Solo ejecuta esto el jugador que ha borrado el token, para no duplicar acciones
        if (game.user.id !== userId) return;

        const flags = tokenDocument.flags.dorso_oscuro;
        if (flags && flags.isCard && flags.type !== "carta_alma") {
            const actor = game.actors.get(flags.actorId);
            if (!actor) return;

            const enJuego = game.cards.get(actor.system.enJuegoId);
            const discard = game.cards.get(actor.system.discardId);

            if (enJuego && discard) {
                // Buscamos la carta en la pila "En Juego"
                const card = enJuego.cards.find(c => c.flags.dorso_oscuro?.itemId === flags.itemId);
                if (card) {
                    // La mandamos al descarte
                    await card.pass(discard);

                    // Refrescamos el HUD para que el contador de descarte suba
                    const hud = Object.values(ui.windows).find(w => w.id === "mano-hud" && w.actor?.id === actor.id);
                    if (hud) hud.render(true);
                }
            }
        }
    });

});