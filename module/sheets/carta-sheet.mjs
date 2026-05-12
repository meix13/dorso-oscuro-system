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

    // NUEVO: Constructor inteligente para cambiar proporciones según quién abra la ficha
    constructor(item, options) {
        super(item, options);

        // Si el usuario NO es el Director de Juego, encogemos el ancho a formato "Carta"
        if (!game.user.isGM) {
            this.options.width = 400;
            this.options.height = 600;
        }
    }

    async getData() {
        const context = super.getData();
        context.system = context.item.system;

        // Pasamos una variable booleana al HTML para saber si mostrar el editor o solo la imagen
        context.isGM = game.user.isGM;
        // Banderas para saber qué campos mostrar en el HTML
        context.isAlma = context.item.type === "carta_alma";
        context.isJugable = (context.item.type === "carta_poder" || context.item.type === "carta_objeto");
        context.isEquipo = context.item.type === "carta_equipo";

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
            },
            formatos: {
                "vertical": "Vertical (Normal)",
                "horizontal": "Horizontal (Tumbada)"
            }
        };

        return context;
    }
}