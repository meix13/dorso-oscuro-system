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
            formatos: {
                "vertical": "Vertical (Normal)",
                "horizontal": "Horizontal (Tumbada)"
            },
            mundos: {
                "inicial": "Inicial (Común)",
                "ghilliam_duh": "Ghilliam Duh (Mundo 1)",
                "cu_sith": "Cu Sith (Mundo 2)",
                "aletehia": "Aletehia (Mundo 3)",
                "glaistig": "Glaistig (Mundo 4)"
            },
            rarezas: {
                "": "Ninguna / N/A",
                "comun": "Común (5 copias)",
                "infrecuente": "Infrecuente (3 copias)",
                "unica": "Única (1 copia)"
            }
        };

        return context;
    }
}