// module/sheets/personaje-sheet.mjs

export class PersonajeSheet extends foundry.appv1.sheets.ActorSheet {


    // 1. Configuración de la ventana (Añadimos la gestión de pestañas)
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "actor", "mystery-paper-theme"],
            template: "systems/dorso_oscuro/templates/personaje-sheet.hbs",
            width: 750,  // Lo ensanchamos un pelín más para que respire
            height: 850,
            // AQUI ESTÁ LA MAGIA DE LAS PESTAÑAS:
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "expediente" }]
        });
    }

    async getData() {
        const context = super.getData();
        context.system = context.data.system;

        context.config = {
            opcionesDado: { "1d4": "1D4", "1d6": "1D6", "1d8": "1D8" }
        };

        // Filtros de Habilidades (se quedan igual)
        context.habilidadesTecnicas = context.items.filter(i => i.type === "habilidad" && i.system.tipo === "tecnica");
        context.habilidadesGenerales = context.items.filter(i => i.type === "habilidad" && i.system.tipo === "general");

        // --- FILTROS DE CARTAS ---
        context.cartasAlma = context.items.filter(i => i.type === "carta_alma");

        // 1. Filtramos las que están en el Banquillo (máximo 3 según tus reglas [cite: 649])
        context.banquillo = context.items.filter(i => (i.type === "carta_poder" || i.type === "carta_objeto") && i.system.enBanquillo);

        // 2. Filtramos la Baraja Activa separando Poderes de Objetos
        const barajaActiva = context.items.filter(i => (i.type === "carta_poder" || i.type === "carta_objeto") && !i.system.enBanquillo);

        context.barajaPoderes = barajaActiva.filter(i => i.type === "carta_poder");
        context.barajaObjetos = barajaActiva.filter(i => i.type === "carta_objeto");

        // Track de estabilidad... (se queda igual)
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

        //NUEVO: Escuchador para guardar valores de habilidades "al vuelo"
        html.find('.skill-values input').change(ev => {
            ev.preventDefault();
            const input = ev.currentTarget;
            const itemId = $(input).closest('.item').data('itemId'); // Sacamos el ID de la habilidad
            const field = input.dataset.edit; // "system.valorActual"
            const value = Number(input.value); // Convertimos el texto a número

            // Actualizamos el Item específico dentro de este Actor
            this.actor.updateEmbeddedDocuments("Item", [{
                _id: itemId,
                [field]: value
            }]);
        });

        // NUEVO: Escuchador para borrar ítems
        html.find('.item-delete').click(this._onBorrarItem.bind(this));
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


    async _onBorrarItem(event) {
        event.preventDefault();

        // Buscamos a qué fila pertenece la papelera que hemos pulsado
        const li = $(event.currentTarget).parents(".item");
        // Obtenemos el objeto completo de la base de datos de nuestro actor
        const item = this.actor.items.get(li.data("itemId"));

        // Usamos la API nativa de Foundry para sacar un cuadro de confirmación
        Dialog.confirm({
            title: `Borrar Habilidad`,
            content: `<p style="text-align: center;">¿Estás seguro de que quieres borrar la habilidad <strong>${item.name}</strong>?</p>`,
            yes: () => item.delete(), // Si pulsa sí, la borramos de la base de datos
            no: () => {}, // Si pulsa no, no hacemos nada
            defaultYes: false // El botón "No" viene marcado por defecto por seguridad
        });
    }

}