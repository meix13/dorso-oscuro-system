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

        // EL TOTAL ES ABSOLUTO: El Mazo nunca pierde cartas físicamente,
        // así que su "size" es siempre el total de tu baraja. ¡Se acabó sumar pilas!
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

        // --- GESTIÓN DE ENERGÍA ---
        html.find('.energy-control').click(async ev => {
            const action = ev.currentTarget.dataset.action;
            const actor = this.actor;
            let current = actor.system.energia.value;
            let nuevoValor = current; // Usamos esta variable para calcular el resultado final

            if (action === "plus") {
                nuevoValor = current + 1;
            }
            else if (action === "minus") {
                nuevoValor = Math.max(current - 1, 0);
            }
            else if (action === "collect") {
                let energiaTotal = 0;

                // 1. Energía del Alma Activa
                const alma = actor.items.get(actor.system.almaActivaId);
                if (alma) energiaTotal += (alma.system.energiaBase || 0);

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

            // UN SOLO UPDATE AL FINAL: Así evitamos que se pisen los datos
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


        // --- BOTONES DE ROBO (NATIVO FOUNDRY - UN SOLO CLIC) ---
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

                // --- PASO 1: Robamos todo lo que podamos de las disponibles en el mazo ---
                const aRobarAhora = Math.min(numARobar, deck.availableCards.length);
                if (aRobarAhora > 0) {
                    await deck.shuffle();
                    await hand.draw(deck, aRobarAhora);
                    cartasRobadas += aRobarAhora;
                    numARobar -= aRobarAhora;
                }

                // --- PASO 2: Si nos siguen faltando cartas, reciclamos automáticamente ---
                if (numARobar > 0) {
                    if (discard.cards.size > 0) {
                        ui.notifications.info("Mazo vacío. Reciclando el descarte y robando el resto...");

                        // Devolvemos el descarte al mazo (Foundry les quita el check 'Drawn' internamente)
                        const idsDescarte = discard.cards.map(c => c.id);
                        await discard.pass(deck, idsDescarte);

                        // Barajamos
                        await deck.shuffle();

                        // RESPIRO VITAL: Le damos a la base de datos 0.4 segundos para que asiente
                        // los checks quitados y el nuevo orden antes de volver a robar.
                        await new Promise(resolve => setTimeout(resolve, 400));

                        // Robamos lo que nos faltaba (o lo que se pueda si el descarte era muy pequeño)
                        const aRobarFinal = Math.min(numARobar, deck.availableCards.length);
                        if (aRobarFinal > 0) {
                            await hand.draw(deck, aRobarFinal);
                            cartasRobadas += aRobarFinal;
                            numARobar -= aRobarFinal;
                        }
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

            // Si no le quedan cartas en la mano, acabamos el turno directamente
            if (cartasEnMano.length === 0) {
                return this._ejecutarFinDeTurno([]);
            }

            // Si tiene cartas, construimos el cuadro de diálogo visual
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
                            // Recogemos los IDs de las cartas que el jugador ha marcado en rojo
                            const selectedIds = [];
                            htmlContent.find('.discard-card-option.selected').each(function() {
                                selectedIds.push($(this).data('cardId'));
                            });
                            // Ejecutamos el cierre pasándole las cartas seleccionadas
                            await this._ejecutarFinDeTurno(selectedIds);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancelar Acción"
                    }
                },
                render: (htmlContent) => {
                    // Animación y marcado de las cartas al hacerles clic
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
                title: "⚠️ FINALIZAR COMBATE ⚠️",
                content: `
                    <div style="text-align: center; padding: 10px;">
                        <h3 style="color: red; border-bottom: 1px solid red; padding-bottom: 5px;">¡ATENCIÓN!</h3>
                        <p>Estás a punto de <b>CERRAR LA MESA</b>.</p>
                        <p>Esto borrará tu mazo actual, tu mano, tu descarte, y <b>recogerá TODAS tus cartas del tablero (incluyendo tu Alma y Objetos)</b>.</p>
                        <p><i>¿Estás completamente seguro de que quieres terminar la partida y resetear todo?</i></p>
                    </div>
                `,
                yes: async () => {
                    const actor = this.actor;

                    // 0. ¡TU IDEA! Borramos el Actor Temporal del Alma
                    const tempActors = game.actors.filter(a => a.flags.dorso_oscuro?.isTempAlma && a.flags.dorso_oscuro?.ownerId === actor.id);
                    for (let temp of tempActors) {
                        await temp.delete();
                    }

                    // 1. Limpiar TODAS las cartas de este jugador del tablero
                    const tokensABorrar = canvas.tokens.placeables.filter(t => {
                        const f = t.document.flags.dorso_oscuro;
                        return f?.isCard && f?.actorId === actor.id;
                    });

                    if (tokensABorrar.length > 0) {
                        const ids = tokensABorrar.map(t => t.id);
                        await canvas.scene.deleteEmbeddedDocuments("Token", ids);

                        // ¡EL RESPIRO MAGICO! Esperamos medio segundo para que la aspiradora (deleteToken)
                        // guarde las cartas ANTES de que el paso 2 borre las pilas de la base de datos.
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // 2. Borrar los contenedores de Cards de la barra lateral de Foundry
                    if (actor.system.deckId) await game.cards.get(actor.system.deckId)?.delete();
                    if (actor.system.handId) await game.cards.get(actor.system.handId)?.delete();
                    if (actor.system.discardId) await game.cards.get(actor.system.discardId)?.delete();
                    if (actor.system.eliminadasId) await game.cards.get(actor.system.eliminadasId)?.delete();
                    if (actor.system.enJuegoId) await game.cards.get(actor.system.enJuegoId)?.delete();

                    // 3. Limpiar los IDs en el actor y resetear stats
                    await actor.update({
                        "system.deckId": "",
                        "system.handId": "",
                        "system.discardId": "",
                        "system.eliminadasId": "",
                        "system.almaActivaId": "", // Vaciamos el alma para la próxima partida
                        "system.energia.value": 0,
                        "system.merma": 0,
                        "system.decadencia": 0,
                        "system.enJuegoId": "", // Reseteamos el ID
                    });

                    ui.notifications.warn(`La mesa de ${actor.name} ha sido recogida por completo.`);
                    this.close();
                },
                no: () => {},
                defaultYes: false // CRÍTICO: Hace que el botón por defecto sea "No" para evitar dobles clics o pulsaciones de Enter accidentales.
            });
        });



        // --- SELECCIONAR ALMA ---
        html.find('.choose-soul-btn, .change-soul').click(ev => {
            this._onElegirAlma();
        });

        // --- DRAG & DROP ---
        html.find('.card-in-hand, .soul-image-container').on('dragstart', this._onDragStart.bind(this));

        // --- GESTIÓN DE VIDA DEL ALMA ---
        html.find('.soul-life-input').change(async ev => {
            const newValue = parseInt(ev.currentTarget.value);
            const almaId = this.actor.system.almaActivaId;
            const activeSoul = this.actor.items.get(almaId);

            if (activeSoul) {
                // Si el valor es mayor que el máximo, lo capamos (opcional según tus reglas)
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
        // Recuperamos los botones por defecto (el de "Cerrar")
        let buttons = super._getHeaderButtons();

        // Insertamos nuestro botón de Minimizar al principio de la lista
        buttons.unshift({
            label: "Minimizar",
            class: "minimize-hud",
            icon: "fas fa-minus",
            onclick: ev => {
                // Si ya está minimizada, la maximiza. Si no, la minimiza.
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

    // --- ACTUALIZAR VISUALES DEL TOKEN EN EL TABLERO ---
    async _refreshTokenVisuals() {
        const actor = this.actor;

        const almaToken = canvas.tokens.placeables.find(t => {
            const f = t.document.flags.dorso_oscuro;
            return f?.isCard && f?.actorId === actor.id && f?.type === "carta_alma";
        });

        if (!almaToken) return;

        const almaItem = actor.items.get(actor.system.almaActivaId);

        // 1. Actualizamos el ACTOR TEMPORAL real
        if (almaToken.actor) {
            await almaToken.actor.update({
                "system.hp.value": almaItem ? almaItem.system.vida.value : 0,
                "system.hp.max": almaItem ? almaItem.system.vida.max : 10,
                "system.energia.value": actor.system.energia.value
            });
        }

        // 2. CONSTRUIMOS EL HUD DE TEXTO DINÁMICO
        const vidaActual = almaItem ? almaItem.system.vida.value : 0;
        const energiaActual = actor.system.energia.value;
        const nombreCarta = almaItem ? almaItem.name : "Alma";

        // Base: Vida y Energía siempre visibles
        let nombreHUD = `❤️ ${vidaActual}  |  ⚡ ${energiaActual}`;

        // Añadimos Merma solo si es mayor que 0
        if (actor.system.merma > 0) {
            nombreHUD += `  |  ⏬ ${actor.system.merma}`; // ¡Cambiado a la doble flecha!
        }

        // Añadimos Decadencia solo si es mayor que 0
        if (actor.system.decadencia > 0) {
            nombreHUD += `  |  🩸 ${actor.system.decadencia}`;
        }

        // Cerramos con el nombre de la carta
        nombreHUD += `  |  ${nombreCarta}`;

        // 3. Iconos de estado visuales (los dejamos por si la gente hace zoom out)
        const effects = [];
        if (actor.system.merma > 0) effects.push("icons/svg/downgrade.svg");
        if (actor.system.decadencia > 0) effects.push("icons/svg/blood.svg");

        // Actualizamos el Token
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
            // 1. Procesar los descartes de la mano (TODO VA AL DESCARTE NORMAL)
            if (cartasADescartarIds.length > 0) {
                const hand = game.cards.get(this.actor.system.handId);
                const discard = game.cards.get(this.actor.system.discardId);

                if (hand && discard) {
                    // Ya no filtramos. Mandamos las seleccionadas directo al descarte.
                    // Usamos .pass() porque aquí sí estamos mandando IDs específicos seleccionados por el jugador
                    await hand.pass(discard, cartasADescartarIds);
                    ui.notifications.info(`Has descartado ${cartasADescartarIds.length} carta(s) voluntariamente.`);
                }
            }

            // 2. Limpiar energía sobrante
            let currentEnergy = this.actor.system.energia.value;
            if (currentEnergy > 7) {
                await this.actor.update({"system.energia.value": 7});
            }

            // 3. Limpiar poderes de la mesa (El Hook de sistema.js aplicará "Desaparece" si corresponde)
            const tokensABorrar = canvas.tokens.placeables.filter(t => {
                const f = t.document.flags.dorso_oscuro;
                return f?.isCard && f?.actorId === this.actor.id && f?.type === "carta_poder";
            });

            if (tokensABorrar.length > 0) {
                const ids = tokensABorrar.map(t => t.id);
                await canvas.scene.deleteEmbeddedDocuments("Token", ids);

                // Respiro para la aspiradora
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