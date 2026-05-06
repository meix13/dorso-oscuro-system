// module/sistema.js
import { PersonajeData, HabilidadData } from "./models.mjs";
import { PersonajeSheet } from "./sheets/personaje-sheet.mjs";

Hooks.once('init', async function() {
    console.log("Dorso Oscuro | Inicializando");

    // Registramos modelos de datos
    CONFIG.Actor.dataModels.personaje = PersonajeData;
    CONFIG.Item.dataModels.habilidad = HabilidadData;

    // Desvinculamos la ficha genérica de Foundry y registramos la nuestra
    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet("dorso_oscuro", PersonajeSheet, {
        types: ["personaje"], // Esta ficha solo es para este tipo
        makeDefault: true
    });
});