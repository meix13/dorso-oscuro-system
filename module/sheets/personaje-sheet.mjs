// module/sheets/personaje-sheet.mjs
import { ManoHUD } from "../apps/mano-hud.mjs";

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
        context.user = game.user;
        context.config = {
            opcionesDado: { "1d4": "1D4", "1d6": "1D6", "1d8": "1D8" }
        };

        // Filtros de Habilidades (se quedan igual)
        context.habilidadesTecnicas = context.items.filter(i => i.type === "habilidad" && i.system.tipo === "tecnica");
        context.habilidadesGenerales = context.items.filter(i => i.type === "habilidad" && i.system.tipo === "general");

        // En module/sheets/personaje-sheet.mjs -> getData()

        // --- FILTROS DE CARTAS ---
        context.cartasAlma = context.items.filter(i => i.type === "carta_alma");

        // 1. Filtramos las que están en el Banquillo (máximo 3 según tus reglas)
        context.banquillo = context.items.filter(i => (i.type === "carta_poder" || i.type === "carta_objeto") && i.system.enBanquillo);

        // 2. Filtramos la Baraja Activa separando Poderes de Objetos
        // NOTA: Es importante comprobar la pertenencia al Actor y que no sea alma
        const barajaActiva = context.items.filter(i => (i.type === "carta_poder" || i.type === "carta_objeto") && !i.system.enBanquillo);

        context.barajaPoderes = barajaActiva.filter(i => i.type === "carta_poder");
        context.barajaObjetos = barajaActiva.filter(i => i.type === "carta_objeto");


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

        // (Debajo del escuchador de borrar ítem)
        html.find('.item-toggle-bench').click(this._onToggleBanquillo.bind(this));

        // Escuchador para Ver/Editar una carta o habilidad
        html.find('.item-edit').click(ev => {
            ev.preventDefault();
            const li = $(ev.currentTarget).parents(".item");
            const item = this.actor.items.get(li.data("itemId"));
            item.sheet.render(true); // Esto abre la ficha de la carta
        });


        html.find('.open-hud-btn').click(async ev => {
            // Si NO tiene un mazo creado, lo registramos por primera vez
            if (!this.actor.system.deckId) {
                await this._registrarMazoDeJuego();
            }

            // Abrimos el HUD (si ya estaba abierto, Foundry simplemente le da foco)
            new ManoHUD(this.actor).render(true);
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

    async _onToggleBanquillo(event) {
        event.preventDefault();

        // Identificamos la carta pulsada
        const li = $(event.currentTarget).parents(".item");
        const item = this.actor.items.get(li.data("itemId"));

        // Comprobamos si ya está en el banquillo
        const enBanquillo = item.system.enBanquillo;

        if (enBanquillo) {
            // Si está, la sacamos a la baraja activa
            await item.update({ "system.enBanquillo": false });
        } else {
            // Si NO está, primero contamos cuántas hay ya en el banquillo
            const cartasBanquillo = this.actor.items.filter(i =>
                (i.type === "carta_poder" || i.type === "carta_objeto") && i.system.enBanquillo
            );

            if (cartasBanquillo.length >= 3) {
                return ui.notifications.warn("El banquillo ya tiene el máximo de 3 cartas.");
            }
            // Si hay hueco, la metemos
            await item.update({ "system.enBanquillo": true });
        }
    }

    // Sobrescribimos el método nativo para evitar que los jugadores arrastren cartas a su ficha
    async _onDropItemCreate(itemData) {
        // Permitimos que arrastren si NO es una carta, O si el usuario ES el DJ
        if (
            game.user.isGM ||
            !(itemData.type === "carta_alma" || itemData.type === "carta_poder" || itemData.type === "carta_objeto")
        ) {
            // Si es DJ o no es una carta, que haga el comportamiento normal
            return super._onDropItemCreate(itemData);
        } else {
            // Si es un jugador intentando meterse cartas, le damos un aviso
            ui.notifications.error("Solo el Director de Juego puede otorgar cartas.");
            return false;
        }
    }


    // Nueva función para preparar los objetos "Cards" de Foundry
    async _registrarMazoDeJuego() {
        const actor = this.actor;
        const name = actor.name;


        // Limpiamos mazos viejos
        if (actor.system.deckId) await game.cards.get(actor.system.deckId)?.delete();
        if (actor.system.handId) await game.cards.get(actor.system.handId)?.delete();
        if (actor.system.discardId) await game.cards.get(actor.system.discardId)?.delete();
        if (actor.system.eliminadasId) await game.cards.get(actor.system.eliminadasId)?.delete();
        if (actor.system.enJuegoId) await game.cards.get(actor.system.enJuegoId)?.delete(); // NUEVO

        // 1. Crear el Mazo (Deck)
        const mazoData = {
            name: `Mazo: ${name}`,
            type: "pile",
            cards: actor.items
                // CORRECCIÓN: Quitamos carta_alma de aquí. ¡Solo poderes y objetos!
                .filter(i => (i.type === "carta_poder" || i.type === "carta_objeto") && !i.system.enBanquillo)
                .map(i => {
                    const reverso = "img_varias/cards/cartas_v2/reverso_carta1.png"; // Ya no hace falta comprobar si es alma
                    return {
                        name: i.name,
                        type: "base",
                        faces: [{ name: i.name, img: i.img }],
                        back: { name: "Dorso", img: reverso },
                        face: 0,
                        flags: { dorso_oscuro: { itemId: i.id } }
                    };
                })
        };
        const deck = await Cards.create(mazoData);

        // 2. Crear las otras pilas
        const hand = await Cards.create({ name: `Mano: ${name}`, type: "hand" });
        const discard = await Cards.create({ name: `Descarte: ${name}`, type: "pile" });
        const eliminadas = await Cards.create({ name: `Eliminadas: ${name}`, type: "pile" });
        const enJuego = await Cards.create({ name: `En Juego: ${name}`, type: "pile" }); // NUEVO

        // Guardar IDs y barajar
        await actor.update({
            "system.deckId": deck.id,
            "system.handId": hand.id,
            "system.discardId": discard.id,
            "system.eliminadasId": eliminadas.id,
            "system.enJuegoId": enJuego.id // NUEVO
        });

        await deck.shuffle();
        ui.notifications.info(`Baraja de ${name} preparada.`);

    }


}