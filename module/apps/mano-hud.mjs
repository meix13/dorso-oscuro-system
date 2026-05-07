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
            width: 1150,
            height: 350,
            title: "Mesa de Juego",
            resizable: true,
            minimizable: true
        });
    }

    async getData() {
        const data = super.getData();
        data.actor = this.actor;
        data.system = this.actor.system;

        // Obtenemos los objetos reales de cartas
        const hand = game.cards.get(this.actor.system.handId);
        const deck = game.cards.get(this.actor.system.deckId);
        const discard = game.cards.get(this.actor.system.discardId);

        data.mano = hand ? hand.cards : [];
        data.conteoMazo = deck ? deck.cards.size : 0;
        data.conteoDescarte = discard ? discard.cards.size : 0;

        // Obtenemos el objeto del Alma Activa
        data.activeSoul = this.actor.items.get(this.actor.system.almaActivaId);

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // --- GESTIÓN DE ENERGÍA ---
        html.find('.energy-control').click(async ev => {
            const action = ev.currentTarget.dataset.action;
            let current = this.actor.system.energia.value;

            // Ya no hay límite máximo de 7 al sumar, el límite se aplica al final del turno
            if (action === "plus") current = current + 1;
            if (action === "minus") current = Math.max(current - 1, 0);
            if (action === "collect") {
                // Aquí sumaremos la energía base del alma y objetos (por ahora simulamos +2)
                current = current + 2;
            }

            await this.actor.update({"system.energia.value": current});
            this.render();
        });

        // --- GESTIÓN DE MALUS ---
        html.find('.malus-control').click(async ev => {
            const field = ev.currentTarget.dataset.field; // "merma" o "decadencia"
            const action = ev.currentTarget.dataset.action;
            let val = foundry.utils.getProperty(this.actor.system, field);

            val = action === "plus" ? val + 1 : Math.max(val - 1, 0);

            await this.actor.update({[`system.${field}`]: val});
            this._updateTokenVisuals(field, val);
            this.render();
        });

        // --- BOTONES DE ROBO ---
        html.find('.draw-cards').click(async ev => {
            const countStr = ev.currentTarget.dataset.count;
            const hand = game.cards.get(this.actor.system.handId);
            const deck = game.cards.get(this.actor.system.deckId);
            const discard = game.cards.get(this.actor.system.discardId);

            if (!hand || !deck) return;

            let numARobar = 0;
            if (countStr === "limit") {
                // Lógica de tus reglas: Robar hasta completar el límite (ej: 4)
                // Más adelante lo haremos dinámico, por ahora fijo a 4
                numARobar = 4 - hand.cards.size;
            } else {
                numARobar = parseInt(countStr);
            }

            if (numARobar <= 0) return;

            // --- LÓGICA DE ROBO INTELIGENTE ---
            for (let i = 0; i < numARobar; i++) {
                if (deck.cards.size === 0) {
                    if (discard.cards.size > 0) {
                        ui.notifications.warn("Mazo vacío. Barajando descarte...");
                        await discard.deal([deck], discard.cards.size);
                        await deck.shuffle();
                    } else {
                        ui.notifications.error("¡No quedan cartas en el mazo ni en el descarte!");
                        break;
                    }
                }
                await deck.deal([hand], 1);
            }
            this.render();
        });



        // --- FIN DE TURNO ---
        html.find('.end-turn-btn').click(async ev => {
            let currentEnergy = this.actor.system.energia.value;
            let updates = {};

            // Regla: La energía no usada por encima de 7 se pierde
            if (currentEnergy > 7) {
                updates["system.energia.value"] = 7;
                ui.notifications.info("La energía sobrante por encima de 7 se ha disipado.");
            }

            // Aquí podemos añadir que si la Decadencia > 0, aplique el daño automáticamente
            // if (this.actor.system.decadencia > 0) { ... }

            if (Object.keys(updates).length > 0) {
                await this.actor.update(updates);
            }

            // Simulación visual de descartar las cartas sobrantes irá aquí
            this.render();
        });

        // --- CERRAR MESA (Finalizar Partida de verdad) ---
        html.find('.end-combat-btn').click(async ev => {
            Dialog.confirm({
                title: "Finalizar Combate",
                content: "<p>¿Estás seguro? Esto borrará el mazo actual y devolverá todo al estado inicial.</p>",
                yes: async () => {
                    const actor = this.actor;
                    // 1. Borrar los contenedores de Cards de la barra lateral de Foundry
                    if (actor.system.deckId) await game.cards.get(actor.system.deckId)?.delete();
                    if (actor.system.handId) await game.cards.get(actor.system.handId)?.delete();
                    if (actor.system.discardId) await game.cards.get(actor.system.discardId)?.delete();

                    // 2. Limpiar los IDs en el actor y resetear stats efímeros
                    await actor.update({
                        "system.deckId": "",
                        "system.handId": "",
                        "system.discardId": "",
                        "system.energia.value": 0,
                        "system.merma": 0,
                        "system.decadencia": 0
                    });

                    ui.notifications.warn(`Partida de ${actor.name} finalizada.`);
                    this.close();
                },
                no: () => {},
                defaultYes: false
            });
        });

        // --- SELECCIONAR ALMA ---
        html.find('.choose-soul-btn, .change-soul').click(ev => {
            this._onElegirAlma();
        });

        // --- DRAG & DROP ---
        html.find('.card-in-hand, .soul-image-container').on('dragstart', this._onDragStart.bind(this));
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

    // Nueva función para el diálogo de selección
    async _onElegirAlma() {
        const almas = this.actor.items.filter(i => i.type === "carta_alma");

        if (almas.length === 0) {
            return ui.notifications.warn("No tienes cartas de Alma disponibles en tu ficha.");
        }

        // Construimos los botones para el diálogo
        let buttons = {};
        almas.forEach(alma => {
            buttons[alma.id] = {
                label: `<img src="${alma.img}" width="30" height="45" style="vertical-align: middle; margin-right: 10px;"> ${alma.name}`,
                callback: async () => {
                    await this.actor.update({"system.almaActivaId": alma.id});
                    ui.notifications.info(`${alma.name} ha despertado.`);
                    this.render();

                    // OPCIONAL: Si quieres que al elegirla aparezca automáticamente en el tablero como Token
                    // this._crearTokenDeAlma(alma);
                }
            };
        });

        new Dialog({
            title: "Elegir Alma para el Combate",
            content: "<p style='text-align:center;'>Selecciona el alma que te representará en esta partida.</p>",
            buttons: buttons,
            default: almas[0].id
        }).render(true);
    }

    _onDragStart(event) {
        const itemId = event.currentTarget.dataset.itemId;
        if (!itemId) return;
        console.log("Dorso Oscuro | Agarrando carta con ID:", itemId);
        // Empaquetamos los datos con un tipo "personalizado" para que Foundry no se confunda
        const dragData = {
            type: "CartaDorsoOscuro",
            actorId: this.actor.id,
            itemId: itemId
        };

        event.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }
}