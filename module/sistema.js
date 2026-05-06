// module/sistema.js
import { PersonajeData, HabilidadData } from "./models.mjs";
import { PersonajeSheet } from "./sheets/personaje-sheet.mjs";
import { HabilidadSheet } from "./sheets/habilidad-sheet.mjs"; // 1. Importar

Hooks.once('init', async function() {
    console.log("Dorso Oscuro | Inicializando");

    CONFIG.Actor.dataModels.personaje = PersonajeData;
    CONFIG.Item.dataModels.habilidad = HabilidadData;

    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("dorso_oscuro", PersonajeSheet, {
        types: ["personaje"],
        makeDefault: true
    });

    // 2. Registrar la ficha de Item
    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet("dorso_oscuro", HabilidadSheet, {
        types: ["habilidad"],
        makeDefault: true
    });
});