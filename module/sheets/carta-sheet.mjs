// module/sheets/carta-sheet.mjs

export class CartaSheet extends foundry.appv1.sheets.ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "item", "carta-theme"],
            template: "systems/dorso_oscuro/templates/carta-sheet.hbs",
            width: 700,
            height: 600,
            resizable: false // Bloqueamos el tamaño para que la carta siempre se vea bien
        });
    }

    async getData() {
        const context = super.getData();
        context.system = context.item.system;

        // Banderas para saber qué campos mostrar en el HTML
        context.isAlma = context.item.type === "carta_alma";
        context.isJugable = (context.item.type === "carta_poder" || context.item.type === "carta_objeto");

        // Opciones para los desplegables
        context.config = {
            elementos: {
                "ninguno": "Sin Palo",
                "vida": "Vida",
                "muerte": "Muerte",
                "luz": "Luz",
                "oscuridad": "Oscuridad"
            },
            tiposAccion: {
                "ataque": "Ataque",
                "cura": "Cura",
                "defensa": "Defensa",
                "otro": "Efecto / Otro"
            }
        };

        return context;
    }
}