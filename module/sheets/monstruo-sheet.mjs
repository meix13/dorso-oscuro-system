// module/sheets/monstruo-sheet.mjs

export class MonstruoSheet extends foundry.appv1.sheets.ActorSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "actor", "mystery-paper-theme"],
            template: "systems/dorso_oscuro/templates/monstruo-sheet.hbs",
            width: 820,
            height: 800
        });
    }

    async getData() {
        const context = super.getData();
        context.system = context.data.system;
        context.isGM = game.user.isGM;
        context.owner = this.actor.isOwner;
        context.editModeAtaques = this.editModeAtaques || false;

        context.config = {
            opcionesDado: { "1d4": "1D4", "1d6": "1D6", "1d8": "1D8" },
            // Opciones para el desplegable de ataques
            tiposAtaque: {
                "Cuerpo a cuerpo": "Cuerpo a cuerpo",
                "A distancia": "A distancia",
                "Especial": "Especial"
            },
            mundos: {
                "general": "Mundo General",
                "ghilliam": "Ghilliam Duh",
                "cu_sith": "Cu Sith",
                "aletehia": "Aletehia",
                "glaistig": "Glaistig",
                "final": "Jaula de Yhound"
            }
        };



        context.enrichedDescription = await TextEditor.enrichHTML(context.system.descripcion || "", {
            async: true,
            secrets: this.actor.isOwner
        });

        return context;
    }

    // --- ESCUCHA DE EVENTOS HTML ---
    activateListeners(html) {
        super.activateListeners(html);

        // Mostrar Retrato (Ojo)
        html.find('.show-portrait').click(ev => {
            ev.preventDefault();
            // Creamos un popout nativo de Foundry con la imagen del monstruo
            const imagePopout = new ImagePopout(this.actor.img, {
                title: this.actor.name,
                uuid: this.actor.uuid
            });
            imagePopout.render(true);
        });

        // Tiradas de Físico / Perseguir
        html.find('.rollable').click(this._onRollAtributo.bind(this));

        // Tiradas de Fórmulas de Ataques
        html.find('.roll-formula').click(this._onRollFormula.bind(this));

        // Eventos exclusivos de edición (Solo GM)
        if (!this.isEditable) return;

        // Toggle Modo Edición de Ataques
        html.find('.ataque-toggle-edit').click(ev => {
            ev.preventDefault();
            this.editModeAtaques = !this.editModeAtaques;
            this.render(false);
        });

        // Añadir Ataque
        html.find('.ataque-create').click(async ev => {
            ev.preventDefault();
            const ataquesActuales = Array.from(this.actor.system.ataques || []);
            ataquesActuales.push({
                nombre: "Nuevo Ataque",
                tipo: "Cuerpo a cuerpo",
                formulaAtaque: "1d6",
                formulaDanio: "1d6",
                especial: ""
            });
            await this.actor.update({"system.ataques": ataquesActuales});
        });

        // Borrar Ataque
        html.find('.ataque-delete').click(async ev => {
            ev.preventDefault();
            const index = $(ev.currentTarget).data("index");
            const ataquesActuales = Array.from(this.actor.system.ataques || []);
            ataquesActuales.splice(index, 1); // Borramos 1 elemento en la posición "index"
            await this.actor.update({"system.ataques": ataquesActuales});
        });
    }

    // --- FUNCIÓN DE TIRADA DE ATRIBUTOS (Físico / Perseguir) ---
    async _onRollAtributo(event) {
        event.preventDefault();
        const atributo = event.currentTarget.dataset.atributo;
        const dado = this.actor.system[atributo].dado;
        const modificador = this.actor.system[atributo].mod;

        const modFomateado = modificador >= 0 ? `+ ${modificador}` : `- ${Math.abs(modificador)}`;
        const formula = `${dado} ${modificador !== 0 ? modFomateado : ""}`;

        try {
            const roll = new Roll(formula);
            await roll.evaluate();
            const nombreBonito = atributo.charAt(0).toUpperCase() + atributo.slice(1);
            roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                flavor: `<h3 style="font-family: 'Kalam', cursive; color: #1a1a1a; border-bottom: 1px solid #1a1a1a;"><i class="fas fa-dice"></i> Tirada de ${nombreBonito}</h3>`
            });
        } catch(e) {
            ui.notifications.error("Fórmula inválida.");
        }
    }

    // --- FUNCIÓN DE TIRADA DE ATAQUES ---
    async _onRollFormula(event) {
        event.preventDefault();
        const formula = event.currentTarget.dataset.formula;
        const nombre = event.currentTarget.dataset.nombre;
        const tipo = event.currentTarget.dataset.tipo; // 'Impacto' o 'Daño'

        // NUEVO: Recuperamos el texto especial del dataset HTML
        const especial = event.currentTarget.dataset.especial;

        if(!formula) return ui.notifications.warn("La fórmula está vacía.");

        try {
            const roll = new Roll(formula);
            await roll.evaluate();

            const icono = tipo === "Impacto" ? "fa-crosshairs" : "fa-tint";

            // PULIDO: Si 'especial' tiene texto, creamos un div elegante con un asterisco. Si no, se queda vacío "".
            const htmlEspecial = especial ? `<div style="font-size: 14px; font-style: italic; color: #555; margin-top: 5px; padding-top: 5px; border-top: 1px dotted rgba(0,0,0,0.1);">* <b>Especial:</b> ${especial}</div>` : "";

            roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                flavor: `
                    <h3 style="font-family: 'Kalam', cursive; color: #1a1a1a; border-bottom: 1px solid #1a1a1a; margin-bottom: 3px;">
                        <i class="fas ${icono}"></i> ${nombre} (${tipo})
                    </h3>
                    ${htmlEspecial}
                `
            });
        } catch(e) {
            ui.notifications.error(`Fórmula inválida: ${formula}`);
        }
    }
}