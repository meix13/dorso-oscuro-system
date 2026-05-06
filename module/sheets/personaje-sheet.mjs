// module/sheets/personaje-sheet.mjs

export class PersonajeSheet extends foundry.appv1.sheets.ActorSheet {

    // 1. Configuración de la ventana
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "actor", "mystery-paper-theme"], // Añadimos clase temática
            template: "systems/dorso_oscuro/templates/personaje-sheet.hbs",
            width: 700,  // Aumentamos ancho
            height: 850, // Aumentamos alto
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "stats" }]
        });
    }
    // 2. Preparar los datos para la Vista (Handlebars)
    async getData() {
        const context = super.getData();
        context.system = context.data.system;

        context.config = {
            opcionesDado: { "1d4": "1D4", "1d6": "1D6", "1d8": "1D8" }
        };

        // Separamos las habilidades por tipo
        context.habilidadesTecnicas = context.items.filter(i => i.type === "habilidad" && i.system.tipo === "tecnica");
        context.habilidadesGenerales = context.items.filter(i => i.type === "habilidad" && i.system.tipo === "general");

        // Generamos el track de Estabilidad (como antes)
        context.trackEstabilidad = [];
        for (let i = -11; i <= 22; i++) {
            context.trackEstabilidad.push({ valor: i, activo: (i === context.system.estabilidad) });
        }

        return context;
    }
    // 3. Escuchar Eventos del DOM (Clics)
    activateListeners(html) {
        super.activateListeners(html);

        // Escuchamos el clic en la habilidad y en el lápiz de editar (los que ya tenías)
        html.find('.tirar-habilidad').click(this._onTirarHabilidad.bind(this));
        html.find('.cambiar-dado').click(this._onCambiarDado.bind(this));

        // NUEVO: Escuchamos el clic directamente en la imagen para tirar el dado
        html.find('.tirar-atributo').click(this._onTirarAtributo.bind(this));
        html.find('.estabilidad-box').click(this._onCambiarEstabilidad.bind(this));

        // Abrir ficha de habilidad al hacer doble clic o clic en editar
        html.find('.item .skill-name').click(ev => {
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            item.sheet.render(true);
        });
    }

    // 4. Lógica de la tirada y gasto de puntos

    async _onTirarAtributo(event) {
        event.preventDefault();

        // Recuperamos qué atributo se ha pinchado ("mental", "social", "fisico")
        const atributo = event.currentTarget.dataset.atributo;

        // Consultamos la Base de Datos para saber qué dado tiene asignado (ej: "1d6")
        const formulaDado = this.actor.system.atributos[atributo];

        // Creamos y evaluamos la tirada
        const roll = new Roll(formulaDado);
        await roll.evaluate();

        // Enviamos el resultado al Chat
        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: `<h3>Tirada de Atributo: ${atributo.toUpperCase()}</h3>`
        });
    }


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

    async _onCambiarEstabilidad(event) {
        event.preventDefault();
        // Leemos el data-valor del HTML y actualizamos la base de datos
        const nuevoValor = parseInt(event.currentTarget.dataset.valor);
        await this.actor.update({ "system.estabilidad": nuevoValor });
    }


}