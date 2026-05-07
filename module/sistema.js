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
    Hooks.on("dropCanvasData", async (canvas, data) => {
        // Si lo que tiran no es nuestra carta, dejamos que Foundry haga su trabajo normal
        if (data.type !== "CartaDorsoOscuro") return true;

        // Recuperamos al jugador y a la carta
        const actor = game.actors.get(data.actorId);
        const item = actor?.items.get(data.itemId);
        if (!actor || !item) return true;

        // Calculamos el tamaño de la carta para el tablero (rectangular 1.5 x 2.2 casillas)
        const width = 1.5;
        const height = 2.2;

        // Construimos el Token
        const tokenData = {
            name: item.name,
            texture: { src: item.img }, // En V12 se usa texture.src
            x: data.x - (canvas.grid.size * width) / 2, // Centramos la carta en el ratón
            y: data.y - (canvas.grid.size * height) / 2,
            width: width,
            height: height,
            flags: {
                dorso_oscuro: {
                    isCard: true,
                    actorId: actor.id,
                    itemId: item.id
                }
            }
        };

        // Creamos la "miniatura" (Token) en el mapa
        await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);

        // Evitamos que salten errores nativos de Foundry
        return false;
    });

});