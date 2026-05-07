// module/sheets/habilidad-sheet.mjs

export class HabilidadSheet extends foundry.appv1.sheets.ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "item", "mystery-theme"],
            template: "systems/dorso_oscuro/templates/habilidad-sheet.hbs",
            width: 450,
            height: 400
        });
    }

    async getData() {
        const context = super.getData();
        context.system = context.item.system;

        context.config = {
            atributos: {
                "mental": "Mental",
                "fisico": "Físico",
                "social": "Social"
            },
            // NUEVO: Opciones de tipo de habilidad
            tipos: {
                "tecnica": "Técnica",
                "general": "General"
            }
        };

        return context;
    }
}