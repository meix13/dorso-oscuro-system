// module/apps/mano-hud.mjs

export class ManoHUD extends Application {
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "mano-hud",
            classes: ["dorso_oscuro", "mano-hud-app"],
            template: "systems/dorso_oscuro/templates/apps/mano-hud.hbs",
            width: 800,
            height: 220,
            title: "Mesa de Juego",
            resizable: true,
            minimizable: true
        });
    }

    async getData() {
        const data = super.getData();
        data.actor = this.actor;
        data.system = this.actor.system;

        // Aquí obtendremos la Mano real usando la API de Cards de Foundry más adelante
        // Por ahora, simulamos la visualización
        data.mano = this.actor.items.filter(i => i.type === "carta_poder" || i.type === "carta_objeto").slice(0, 4);

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // --- GESTIÓN DE ENERGÍA ---
        html.find('.energy-control').click(async ev => {
            const action = ev.currentTarget.dataset.action;
            let current = this.actor.system.energia.value;

            if (action === "plus") current = Math.min(current + 1, 7);
            if (action === "minus") current = Math.max(current - 1, 0);
            if (action === "collect") {
                // Lógica de recolectar según reglas [cite: 656]
                // Aquí sumaremos la energía base del alma y objetos (lo haremos automático luego)
                current = Math.min(current + 2, 7);
            }

            await this.actor.update({"system.energia.value": current});
            this.render();
        });

        // --- GESTIÓN DE MALUS (Merma y Decadencia)  ---
        html.find('.malus-control').click(async ev => {
            const field = ev.currentTarget.dataset.field; // "merma" o "decadencia"
            const action = ev.currentTarget.dataset.action;
            let val = foundry.utils.getProperty(this.actor.system, field);

            val = action === "plus" ? val + 1 : Math.max(val - 1, 0);

            await this.actor.update({[`system.${field}`]: val});

            // Sincronizar visualmente con el Token en el tablero
            this._updateTokenVisuals(field, val);
            this.render();
        });

        // --- BOTONES DE ROBO ---
        html.find('.draw-cards').click(ev => {
            const count = ev.currentTarget.dataset.count;
            ui.notifications.info(`Robando ${count} cartas... (Lógica de Mazo próximamente)`);
            // Aquí irá la lógica de[cite: 659]: robar, verificar si el mazo está vacío y barajar descarte.
        });
    }

    // Método para poner iconos en el token del tablero
    _updateTokenVisuals(type, value) {
        const tokens = this.actor.getActiveTokens();
        const icon = type === "merma" ? "icons/svg/downgrade.svg" : "icons/svg/skull.svg";

        tokens.forEach(t => {
            if (value > 0) {
                // Aquí podrías usar módulos como "Token Magic" o simplemente efectos de estado
                t.document.update({
                    "effects": value > 0 ? [icon] : []
                });
            }
        });
    }
}