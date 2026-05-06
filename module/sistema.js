// module/sistema.js
import { PersonajeData, HabilidadData } from "./models.mjs";
import { PersonajeSheet } from "./sheets/personaje-sheet.mjs";
import { HabilidadSheet } from "./sheets/habilidad-sheet.mjs";

Hooks.once('init', async function() {
    console.log("Dorso Oscuro | Inicializando");

    CONFIG.Actor.dataModels.personaje = PersonajeData;
    CONFIG.Item.dataModels.habilidad = HabilidadData;

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

    await loadTemplates([
        "systems/dorso_oscuro/templates/parts/skill-list.hbs"
    ]);
});