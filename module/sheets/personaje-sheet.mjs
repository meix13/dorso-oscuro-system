// module/sheets/personaje-sheet.mjs

export class PersonajeSheet extends ActorSheet {

    // 1. Configuración de la ventana
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "actor"],
            template: "systems/dorso_oscuro/templates/personaje-sheet.hbs",
            width: 500,
            height: 600
        });
    }

    // 2. Preparar los datos para la Vista (Handlebars)
    async getData() {
        const context = super.getData();
        // Foundry V14 mapea los datos del sistema aquí
        context.system = context.data.system;

        // Opciones para el desplegable de dados
        context.config = {
            opcionesDado: { "1d4": "1D4", "1d6": "1D6", "1d8": "1D8" }
        };

        // Filtramos el inventario para pasarle a la vista solo las Habilidades
        context.habilidades = context.items.filter(item => item.type === "habilidad");

        return context;
    }

    // 3. Escuchar Eventos del DOM (Clics)
    activateListeners(html) {
        super.activateListeners(html);
        // Escuchamos el clic en la habilidad
        html.find('.tirar-habilidad').click(this._onTirarHabilidad.bind(this));

        // NUEVO: Escuchamos el clic en la imagen del dado
        html.find('.cambiar-dado').click(this._onCambiarDado.bind(this));
    }

    // 4. Lógica de la tirada y gasto de puntos
    async _onCambiarDado(event) {
        event.preventDefault();

        // Recuperamos qué atributo hemos pinchado leyendo el data-atributo del HTML
        const atributo = event.currentTarget.dataset.atributo;

        // Creamos una ventana emergente para elegir
        new Dialog({
            title: `Cambiar ${atributo.toUpperCase()}`,
            content: `<p style="text-align:center; margin-bottom: 15px;">¿Qué dado quieres asignar a este atributo?</p>`,
            buttons: {
                d4: {
                    // Metemos la imagen directamente en la etiqueta del botón
                    label: '<img src="systems/dorso_oscuro/assets/1d4.png" width="30" height="30" style="border:none;"><br>1D4',
                    // La actualización a BD. Como en Spring hacer un repository.save()
                    callback: () => this.actor.update({ [`system.atributos.${atributo}`]: "1d4" })
                },
                d6: {
                    label: '<img src="systems/dorso_oscuro/assets/1d6.png" width="30" height="30" style="border:none;"><br>1D6',
                    callback: () => this.actor.update({ [`system.atributos.${atributo}`]: "1d6" })
                },
                d8: {
                    label: '<img src="systems/dorso_oscuro/assets/1d8.png" width="30" height="30" style="border:none;"><br>1D8',
                    callback: () => this.actor.update({ [`system.atributos.${atributo}`]: "1d8" })
                }
            }
        }, { width: 300 }).render(true); // Hacemos el diálogo un poco más estrecho
    }


    async _onTirarHabilidad(event) {
        event.preventDefault();

        // Obtenemos qué habilidad se ha pulsado mediante el ID guardado en el HTML
        const li = $(event.currentTarget).parents(".item");
        const item = this.actor.items.get(li.data("itemId"));

        const puntosDisponibles = item.system.valorActual;
        const atributoBase = item.system.atributoBase; // "mental", "social" o "fisico"
        const dadoAtributo = this.actor.system.atributos[atributoBase]; // Ej: "1d6"

        if (puntosDisponibles <= 0) {
            return ui.notifications.warn(`No te quedan puntos en ${item.name}`);
        }

        // Creamos un diálogo emergente
        new Dialog({
            title: `Usar ${item.name}`,
            content: `
        <p>¿Cuántos puntos quieres gastar? (Máx: ${puntosDisponibles})</p>
        <input type="number" id="puntos-gasto" value="1" min="1" max="${puntosDisponibles}">
      `,
            buttons: {
                lanzar: {
                    icon: '<i class="fas fa-dice"></i>',
                    label: "Lanzar Dado",
                    callback: async (html) => {
                        const gasto = parseInt(html.find('#puntos-gasto').val());

                        if (gasto > puntosDisponibles || gasto <= 0) {
                            return ui.notifications.error("Cantidad inválida");
                        }

                        // A) Restar los puntos en la Base de Datos
                        await item.update({ "system.valorActual": puntosDisponibles - gasto });

                        // B) Preparar y lanzar la tirada (Ej: 1d6 + 2)
                        const formula = `${dadoAtributo} + ${gasto}`;
                        const roll = new Roll(formula);
                        await roll.evaluate();

                        // C) Mostrar en el Chat
                        roll.toMessage({
                            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                            flavor: `<h3>${item.name}</h3>Utiliza Atributo ${atributoBase.toUpperCase()} gastando ${gasto} puntos.`
                        });
                    }
                }
            },
            default: "lanzar"
        }).render(true);
    }
}