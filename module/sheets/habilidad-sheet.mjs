// module/sheets/habilidad-sheet.mjs

export class HabilidadSheet extends foundry.appv1.sheets.ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "item", "mystery-theme"],
            template: "systems/dorso_oscuro/templates/habilidad-sheet.hbs",
            width: 450,
            height: 520
        });
    }

    async getData() {
        const context = super.getData();
        const item = context.item;

        context.system = item.system;
        context.isOwned = !!item.actor;
        context.isGM = game.user.isGM;
        context.owner = item.isOwner;

        // Generamos el texto enriquecido (asegurando que si es undefined pase un "")
        context.enrichedDescription = await TextEditor.enrichHTML(item.system.descripcion || "", {
            async: true,
            secrets: item.isOwner
        });

        context.config = {
            atributos: { "mental": "Mental", "fisico": "Físico", "social": "Social" },
            tipos: { "tecnica": "Técnica", "general": "General" }
        };

        return context;
    }
}