// module/apps/mano-hud.mjs

export class ManoHUD extends Application {
    static isProcessing = false;

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
        const data = await super.getData();
        data.actor = this.actor;
        data.system = this.actor.system;

        // Obtenemos los contenedores
        const hand = game.cards.get(this.actor.system.handId);
        const deck = game.cards.get(this.actor.system.deckId);
        const discard = game.cards.get(this.actor.system.discardId);
        const eliminadas = game.cards.get(this.actor.system.eliminadasId);
        const enJuego = game.cards.get(this.actor.system.enJuegoId);

        // --- LA MAGIA NATIVA DE FOUNDRY ---
        // availableCards es un Array con las cartas que NO tienen marcado 'Drawn'
        const numMazoDisponible = deck ? deck.availableCards.length : 0;
        const numDescarte = discard ? discard.cards.size : 0;
        const numEliminadas = eliminadas ? eliminadas.cards.size : 0;

        data.mano = hand ? hand.cards : [];

        // Estos son los números que lee el HTML
        data.conteoMazo = numMazoDisponible;
        data.conteoDescarte = numDescarte;
        data.conteoEliminadas = numEliminadas;

        // EL TOTAL ES ABSOLUTO: El Mazo nunca pierde cartas físicamente
        data.totalMazo = deck ? deck.cards.size : 0;

        // --- CÁLCULO DINÁMICO DEL LÍMITE DE MANO ---
        let baseLimit = 4;
        let bonusTotal = 0;

        const activeSoul = this.actor.items.get(this.actor.system.almaActivaId);
        if (activeSoul) bonusTotal += (activeSoul.system.limiteManoBonus || 0);

        const objetosEnMesa = canvas.tokens.placeables.filter(t => {
            const f = t.document.flags.dorso_oscuro;
            return f?.isCard && f?.actorId === this.actor.id && f?.type === "carta_objeto";
        });

        for (let t of objetosEnMesa) {
            const item = this.actor.items.get(t.document.flags.dorso_oscuro.itemId);
            if (item) bonusTotal += (item.system.limiteManoBonus || 0);
        }

        data.totalLimiteMano = baseLimit + bonusTotal;
        data.activeSoul = activeSoul;

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // --- ELIMINAR CARTA MANUALMENTE DESDE LA MANO ---
        html.find('.manual-ban-btn').click(async ev => {
            ev.stopPropagation(); // Evita que se active el zoom o el drag

            const itemId = $(ev.currentTarget).parents('.item').data('itemId');
            const hand = game.cards.get(this.actor.system.handId);
            const eliminadas = game.cards.get(this.actor.system.eliminadasId);

            if (hand && eliminadas) {
                const card = hand.cards.find(c => c.flags.dorso_oscuro?.itemId === itemId);
                if (card) {
                    await card.pass(eliminadas);
                    ui.notifications.info("Carta enviada a Eliminadas por efecto externo.");
                    this.render(true);
                }
            }
        });

        // --- GESTIÓN DE ENERGÍA ---
        html.find('.energy-control').click(async ev => {
            const action = ev.currentTarget.dataset.action;
            const actor = this.actor;
            let current = actor.system.energia.value;
            let nuevoValor = current;

            if (action === "plus") {
                nuevoValor = current + 1;
            } else if (action === "minus") {
                nuevoValor = Math.max(current - 1, 0);
            } else if (action === "collect") {
                let energiaTotal = 0;

                // 1. Energía del Alma Activa
                const alma = actor.items.get(actor.system.almaActivaId);
                if (alma) energiaTotal += (alma.system.energiaAportada || 0);

                // 2. Energía de los Objetos en el Tablero
                const objetosEnMesa = canvas.tokens.placeables.filter(t => {
                    const f = t.document.flags.dorso_oscuro;
                    return f?.isCard && f?.actorId === actor.id && f?.type === "carta_objeto";
                });

                for (let t of objetosEnMesa) {
                    const itemObjeto = actor.items.get(t.document.flags.dorso_oscuro.itemId);
                    if (itemObjeto) {
                        energiaTotal += (itemObjeto.system.energiaAportada || 0);
                    }
                }

                nuevoValor = current + energiaTotal;
                ui.notifications.info(`Has recolectado ${energiaTotal} de energía.`);
            }

            await actor.update({"system.energia.value": nuevoValor});
            await this._refreshTokenVisuals();
            this.render();
        });

        // --- GESTIÓN DE MALUS ---
        html.find('.malus-control').click(async ev => {
            const field = ev.currentTarget.dataset.field; // "merma" o "decadencia"
            const action = ev.currentTarget.dataset.action;
            let val = foundry.utils.getProperty(this.actor.system, field);

            val = action === "plus" ? val + 1 : Math.max(val - 1, 0);

            await this.actor.update({[`system.${field}`]: val});
            await this._refreshTokenVisuals();
            this._updateTokenVisuals(field, val);
            this.render();
        });

        // --- BOTONES DE ROBO (NATIVO FOUNDRY) ---
        html.find('.draw-cards').click(async ev => {
            if (ManoHUD.isProcessing) return ui.notifications.warn("Procesando cartas, espera un instante...");
            ManoHUD.isProcessing = true;

            try {
                const countStr = ev.currentTarget.dataset.count;
                const hand = game.cards.get(this.actor.system.handId);
                const deck = game.cards.get(this.actor.system.deckId);
                const discard = game.cards.get(this.actor.system.discardId);

                if (!hand || !deck || !discard) return;

                let numARobar = 0;
                if (countStr === "limit") {
                    const currentData = await this.getData();
                    numARobar = Math.max(0, currentData.totalLimiteMano - hand.cards.size);
                } else {
                    numARobar = parseInt(countStr);
                }

                if (numARobar <= 0) {
                    ManoHUD.isProcessing = false;
                    return ui.notifications.warn("Mano llena o no has pedido cartas.");
                }

                let cartasRobadas = 0;

                // --- PASO 1: Robamos de las disponibles en el mazo ---
                const aRobarAhora = Math.min(numARobar, deck.availableCards.length);
                if (aRobarAhora > 0) {
                    await deck.shuffle();
                    await hand.draw(deck, aRobarAhora);
                    cartasRobadas += aRobarAhora;
                    numARobar -= aRobarAhora;
                }

                // --- PASO 2: Reciclamos automáticamente el descarte ---
                if (numARobar > 0 && discard.cards.size > 0) {
                    ui.notifications.info("Mazo vacío. Reciclando el descarte y robando el resto...");

                    const idsDescarte = discard.cards.map(c => c.id);
                    await discard.pass(deck, idsDescarte);
                    await deck.shuffle();

                    await new Promise(resolve => setTimeout(resolve, 400));

                    const aRobarFinal = Math.min(numARobar, deck.availableCards.length);
                    if (aRobarFinal > 0) {
                        await hand.draw(deck, aRobarFinal);
                        cartasRobadas += aRobarFinal;
                        numARobar -= aRobarFinal;
                    }
                }

                // --- AVISOS FINALES ---
                if (numARobar > 0) {
                    ui.notifications.warn(`Solo pudiste robar ${cartasRobadas} carta(s). No hay más cartas en el juego.`);
                } else if (cartasRobadas > 0) {
                    ui.notifications.info(`Has robado ${cartasRobadas} carta(s) con éxito.`);
                }

            } catch (error) {
                console.error("Dorso Oscuro | Error crítico en el robo:", error);
                ui.notifications.error("Hubo un error al robar. Recarga (F5) por seguridad.");
            } finally {
                ManoHUD.isProcessing = false;
                this.render();
            }
        });

        // --- FIN DE TURNO ---
        html.find('.end-turn-btn').click(async ev => {
            const hand = game.cards.get(this.actor.system.handId);
            const cartasEnMano = hand ? hand.cards.contents : [];

            if (cartasEnMano.length === 0) {
                return this._ejecutarFinDeTurno([]);
            }

            let cardsHtml = `<div class="flexrow" style="flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 15px;">`;
            cartasEnMano.forEach(c => {
                cardsHtml += `
                    <div class="discard-card-option" data-card-id="${c.id}" style="cursor: pointer; border: 2px solid transparent; border-radius: 5px; width: 80px; transition: all 0.2s;">
                        <img src="${c.faces[0].img}" style="width: 100%; border-radius: 3px; pointer-events: none;">
                    </div>
                `;
            });
            cardsHtml += `</div>`;
            cardsHtml += `<p style="text-align: center; color: #ccc; font-size: 13px;">Haz clic en las cartas que quieras descartar. Se pondrán rojas.</p>`;

            new Dialog({
                title: "¿Descartar cartas?",
                content: cardsHtml,
                buttons: {
                    end: {
                        icon: '<i class="fas fa-hourglass-end"></i>',
                        label: "Finalizar Turno",
                        callback: async (htmlContent) => {
                            const selectedIds = [];
                            htmlContent.find('.discard-card-option.selected').each(function() {
                                selectedIds.push($(this).data('cardId'));
                            });
                            await this._ejecutarFinDeTurno(selectedIds);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancelar Acción"
                    }
                },
                render: (htmlContent) => {
                    htmlContent.find('.discard-card-option').click(function() {
                        $(this).toggleClass('selected');
                        if ($(this).hasClass('selected')) {
                            $(this).css({'border-color': '#ff4444', 'opacity': '0.6', 'transform': 'scale(0.95)'});
                        } else {
                            $(this).css({'border-color': 'transparent', 'opacity': '1', 'transform': 'scale(1)'});
                        }
                    });
                },
                default: "end"
            }, { width: 500 }).render(true);
        });

        // --- CERRAR MESA (Finalizar Partida de verdad) ---
        html.find('.end-combat-btn').click(async ev => {
            Dialog.confirm({
                title: "Recoger Mesa",
                content: "¿Quieres recoger todas tus cartas? Se borrarán tus mazos, tokens y el alma temporal de esta partida.",
                yes: async () => {
                    // 1. Borrar el ACTOR TEMPORAL del alma
                    // Buscamos en game.actors el que tenga el flag de 'isTempAlma' y pertenezca a este jugador
                    //Quitado porque el jugador no puede borrarlo, lo hará el DJ desde su HUD al finalizar
                    // const tempAlmaActor = game.actors.find(a =>
                    //     a.flags.dorso_oscuro?.isTempAlma &&
                    //     a.flags.dorso_oscuro?.ownerId === this.actor.id
                    // );


                    // if (tempAlmaActor) {
                    //     try {
                    //         await tempAlmaActor.delete();
                    //     } catch (e) {
                    //         console.warn("Dorso Oscuro | No se pudo borrar el actor temporal del alma.");
                    //     }
                    // }

                    // 2. Borrar Tokens del jugador en el tablero
                    const tokens = canvas.tokens.placeables.filter(t => {
                        const f = t.document.flags.dorso_oscuro;
                        return f?.actorId === this.actor.id;
                    });

                    if (tokens.length > 0) {
                        await canvas.scene.deleteEmbeddedDocuments("Token", tokens.map(t => t.id), { limpiezaTotal: true });
                    }

                    // 3. Borrar Pilas de Cartas
                    const pilas = ["deckId", "handId", "discardId", "enJuegoId", "eliminadasId"];
                    for (let key of pilas) {
                        const id = this.actor.system[key];
                        if (id) {
                            const stack = game.cards.get(id);
                            try {
                                if (stack) await stack.delete();
                            } catch (e) {
                                console.warn(`Dorso Oscuro | No se pudo borrar la pila ${key}.`);
                            }
                        }
                    }

                    // 4. Curar el Alma (Poner vida al máximo)
                    const almaId = this.actor.system.almaActivaId;
                    if (almaId) {
                        const alma = this.actor.items.get(almaId);
                        if (alma) {
                            await alma.update({"system.vida.value": alma.system.vida.max});
                        }
                    }

                    // 5. Resetear IDs en el actor, energía y quitar el alma seleccionada
                    await this.actor.update({
                        "system.deckId": "",
                        "system.handId": "",
                        "system.discardId": "",
                        "system.enJuegoId": "",
                        "system.eliminadasId": "",
                        "system.energia.value": 0,
                        "system.almaActivaId": ""
                    });

                    ui.notifications.info(`La mesa de ${this.actor.name} ha sido recogida por completo.`);
                    this.close();
                }
            });
        });

        // --- SELECCIONAR ALMA ---
        html.find('.choose-soul-btn, .change-soul').click(ev => {
            this._onElegirAlma();
        });

        // --- DRAG & DROP ---
        html.find('.card-in-hand, .soul-image-container').on('dragstart', this._onDragStart.bind(this));

        // --- VER CARTA EN GRANDE (Clic Derecho) ---
        html.find('.card-in-hand').on('contextmenu', ev => {
            ev.preventDefault();

            const itemId = ev.currentTarget.dataset.itemId;
            if (!itemId) return;

            const item = this.actor.items.get(itemId);
            if (item) {
                new ImagePopout(item.img, {
                    title: item.name,
                    uuid: item.uuid
                }).render(true);
            }
        });

        // --- GESTIÓN DE VIDA DEL ALMA ---
        html.find('.soul-life-input').change(async ev => {
            const newValue = parseInt(ev.currentTarget.value);
            const almaId = this.actor.system.almaActivaId;
            const activeSoul = this.actor.items.get(almaId);

            if (activeSoul) {
                const cappedValue = Math.min(newValue, activeSoul.system.vida.max);
                await activeSoul.update({"system.vida.value": cappedValue});
                await this._refreshTokenVisuals();
                ui.notifications.info(`Vida de ${activeSoul.name} actualizada.`);
            }
            this.render();
        });
    }

    // --- BOTONES DE LA CABECERA (Añadir Minimizar) ---
    _getHeaderButtons() {
        let buttons = super._getHeaderButtons();

        buttons.unshift({
            label: "Minimizar",
            class: "minimize-hud",
            icon: "fas fa-minus",
            onclick: ev => {
                if (this._minimized) {
                    this.maximize();
                } else {
                    this.minimize();
                }
            }
        });

        return buttons;
    }

    // Método para poner iconos en el token del tablero
    _updateTokenVisuals(type, value) {
        const tokens = this.actor.getActiveTokens();
        const icon = type === "merma" ? "icons/svg/downgrade.svg" : "icons/svg/skull.svg";

        tokens.forEach(t => {
            if (value > 0) {
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

        let buttons = {};
        almas.forEach(alma => {
            buttons[alma.id] = {
                label: `<img src="${alma.img}" width="30" height="45" style="vertical-align: middle; margin-right: 10px;"> ${alma.name}`,
                callback: async () => {
                    await this.actor.update({"system.almaActivaId": alma.id});
                    ui.notifications.info(`${alma.name} ha despertado.`);
                    this.render();
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

        const dragData = {
            type: "CartaDorsoOscuro",
            actorId: this.actor.id,
            itemId: itemId
        };

        event.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    // --- ACTUALIZAR VISUALES DEL TOKEN EN EL TABLERO ---
    async _refreshTokenVisuals() {
        const actor = this.actor;

        const almaToken = canvas.tokens.placeables.find(t => {
            const f = t.document.flags.dorso_oscuro;
            return f?.isCard && f?.actorId === actor.id && f?.type === "carta_alma";
        });

        if (!almaToken) return;

        const almaItem = actor.items.get(actor.system.almaActivaId);

        if (almaToken.actor) {
            await almaToken.actor.update({
                "system.hp.value": almaItem ? almaItem.system.vida.value : 0,
                "system.hp.max": almaItem ? almaItem.system.vida.max : 10,
                "system.energia.value": actor.system.energia.value
            });
        }

        const vidaActual = almaItem ? almaItem.system.vida.value : 0;
        const energiaActual = actor.system.energia.value;
        const nombreCarta = almaItem ? almaItem.name : "Alma";

        let nombreHUD = `❤️ ${vidaActual}  |  ⚡ ${energiaActual}`;

        if (actor.system.merma > 0) {
            nombreHUD += `  |  ⏬ ${actor.system.merma}`;
        }

        if (actor.system.decadencia > 0) {
            nombreHUD += `  |  🩸 ${actor.system.decadencia}`;
        }

        nombreHUD += `  |  ${nombreCarta}`;

        const effects = [];
        if (actor.system.merma > 0) effects.push("icons/svg/downgrade.svg");
        if (actor.system.decadencia > 0) effects.push("icons/svg/blood.svg");

        await almaToken.document.update({
            name: nombreHUD,
            effects: effects
        });
    }

    // --- LÓGICA INTERNA DE FINALIZAR TURNO ---
    async _ejecutarFinDeTurno(cartasADescartarIds = []) {
        if (ManoHUD.isProcessing) return;
        ManoHUD.isProcessing = true;

        try {
            if (cartasADescartarIds.length > 0) {
                const hand = game.cards.get(this.actor.system.handId);
                const discard = game.cards.get(this.actor.system.discardId);

                if (hand && discard) {
                    await hand.pass(discard, cartasADescartarIds);
                    ui.notifications.info(`Has descartado ${cartasADescartarIds.length} carta(s) voluntariamente.`);
                }
            }

            let currentEnergy = this.actor.system.energia.value;
            if (currentEnergy > 7) {
                await this.actor.update({"system.energia.value": 7});
            }

            // Los objetos de jugador ya se quedan en mesa por defecto. Solo filtramos los poderes.
            const tokensABorrar = canvas.tokens.placeables.filter(t => {
                const f = t.document.flags.dorso_oscuro;
                if (f?.isCard && f?.actorId === this.actor.id && f?.type === "carta_poder") {
                    const item = this.actor.items.get(f.itemId);
                    if (!item) return true;

                    // LA MAGIA: Si es un poder con vida > 0 y le queda vida, se salva de borrarse
                    if (item.system.vida && item.system.vida.max > 0 && item.system.vida.value > 0) {
                        return false;
                    }
                    return true; // Si es un poder normal o su vida es 0, se borra
                }
                return false;
            });

            if (tokensABorrar.length > 0) {
                const ids = tokensABorrar.map(t => t.id);
                await canvas.scene.deleteEmbeddedDocuments("Token", ids);
                await new Promise(resolve => setTimeout(resolve, 300));
            }

        } catch (error) {
            console.error("Dorso Oscuro | Error en el fin de turno:", error);
        } finally {
            ManoHUD.isProcessing = false;
            this.render();
        }
    }
}