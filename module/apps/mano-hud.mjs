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
        const data = await super.getData();
        data.actor = this.actor;
        data.system = this.actor.system;

        // Obtenemos todos los contenedores de cartas
        const hand = game.cards.get(this.actor.system.handId);
        const deck = game.cards.get(this.actor.system.deckId);
        const discard = game.cards.get(this.actor.system.discardId);
        const eliminadas = game.cards.get(this.actor.system.eliminadasId);
        const enJuego = game.cards.get(this.actor.system.enJuegoId);

        // Guardamos los conteos individuales
        data.mano = hand ? hand.cards : [];
        data.conteoMazo = deck ? deck.cards.size : 0;
        data.conteoDescarte = discard ? discard.cards.size : 0;
        data.conteoEliminadas = eliminadas ? eliminadas.cards.size : 0;
        data.conteoEnJuego = enJuego ? enJuego.cards.size : 0;

        // --- CÁLCULO DEL TOTAL ---
        // Sumamos absolutamente todas las cartas que pertenecen al sistema de juego actual
        data.totalMazo = data.conteoMazo +
            data.conteoDescarte +
            data.conteoEliminadas +
            data.conteoEnJuego +
            (hand ? hand.cards.size : 0);

        data.activeSoul = this.actor.items.get(this.actor.system.almaActivaId);

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

            if (!hand || !deck || !discard) return;

            let numARobar = 0;
            if (countStr === "limit") {
                const limiteMano = 4; // Aquí en el futuro sumaremos los bonos de equipo
                numARobar = Math.max(0, limiteMano - hand.cards.size);
            } else {
                numARobar = parseInt(countStr);
            }

            if (numARobar <= 0) {
                return ui.notifications.warn("Ya tienes la mano llena o no has pedido cartas.");
            }

            // --- LÓGICA DE ROBO FÍSICO (Sin clonaciones de Foundry) ---
            let cartasRobadas = 0;

            while (numARobar > 0) {

                // 1. Miramos cuántas cartas físicas quedan en el mazo
                if (deck.cards.size > 0) {
                    const aRobarAhora = Math.min(numARobar, deck.cards.size);

                    // Extraemos los IDs exactos de las cartas superiores
                    const cartasParaMover = deck.cards.contents.slice(0, aRobarAhora).map(c => c.id);

                    // PASAMOS FÍSICAMENTE las cartas a la mano (esto las borra del mazo)
                    await deck.pass(hand, cartasParaMover);

                    numARobar -= aRobarAhora;
                    cartasRobadas += aRobarAhora;
                }

                // 2. Si faltan cartas y el mazo se ha vaciado
                if (numARobar > 0) {
                    if (discard.cards.size > 0) {
                        ui.notifications.info("Mazo vacío. Recuperando el Descarte y barajando...");

                        // Pasamos todas las cartas del descarte al mazo
                        const cartasDescarteIds = discard.cards.map(c => c.id);
                        await discard.pass(deck, cartasDescarteIds);

                        // Barajamos el mazo recién llenado
                        await deck.shuffle();

                    } else {
                        ui.notifications.error(`Solo pudiste robar ${cartasRobadas} carta(s). No hay más disponibles.`);
                        break;
                    }
                }
            }

            if (cartasRobadas > 0) {
                ui.notifications.info(`Has robado ${cartasRobadas} carta(s).`);
            }
            this.render();
        });



        // --- FIN DE TURNO ---
        html.find('.end-turn-btn').click(async ev => {
            let currentEnergy = this.actor.system.energia.value;

            // 1. Limpiar energía sobrante
            if (currentEnergy > 7) {
                await this.actor.update({"system.energia.value": 7});
                ui.notifications.info("Energía reseteada a 7.");
            }

            // 2. LIMPIAR MESA (Solo los poderes)
            // Buscamos todos los tokens en la escena actual que pertenezcan a este actor y sean cartas de poder
            const tokensABorrar = canvas.tokens.placeables.filter(t => {
                const f = t.document.flags.dorso_oscuro;
                return f?.isCard && f?.actorId === this.actor.id && f?.type === "carta_poder";
            });

            if (tokensABorrar.length > 0) {
                const ids = tokensABorrar.map(t => t.id);
                await canvas.scene.deleteEmbeddedDocuments("Token", ids);
                ui.notifications.info("Poderes de la mesa enviados al olvido.");
            }

            this.render();
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

                    // 1. Limpiar TODAS las cartas de este jugador del tablero (Alma, Poderes, Objetos)
                    // Fíjate que aquí ya no filtramos por tipo de carta, así que borra todas.
                    const tokensABorrar = canvas.tokens.placeables.filter(t => {
                        const f = t.document.flags.dorso_oscuro;
                        return f?.isCard && f?.actorId === actor.id;
                    });

                    if (tokensABorrar.length > 0) {
                        const ids = tokensABorrar.map(t => t.id);
                        await canvas.scene.deleteEmbeddedDocuments("Token", ids);
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