// module/sheets/personaje-sheet.mjs
import { ManoHUD } from "../apps/mano-hud.mjs";
import { MercaderManager } from "../apps/mercader.mjs";

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
        context.enrichedNotas = await TextEditor.enrichHTML(context.system.notas || "", {
            async: true,
            secrets: this.actor.isOwner
        });


        // Filtros de Habilidades ordenadas alfabéticamente
        context.habilidadesTecnicas = context.items
            .filter(i => i.type === "habilidad" && i.system.tipo === "tecnica")
            .sort((a, b) => a.name.localeCompare(b.name));

        context.habilidadesGenerales = context.items
            .filter(i => i.type === "habilidad" && i.system.tipo === "general")
            .sort((a, b) => a.name.localeCompare(b.name));


        // FILTROS DE INVENTARIO (Armas y Objetos) ---
        context.armas = context.items.filter(i => i.type === "arma");
        context.objetos = context.items.filter(i => i.type === "objeto");

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

        // --- CARTAS DE EQUIPO GLOBALES ---
        // Buscamos las cartas de equipo que el jugador tiene permiso de ver (las que el DJ ha desbloqueado)

        const unlocked = game.settings.get("dorso_oscuro", "equiposDesbloqueados") || {};
        // Filtramos para que SOLO aparezcan las cartas que el DJ ha desbloqueado
        context.equipoDisponible = game.items.filter(i =>
            i.type === "carta_equipo" &&
            unlocked[i.id] === true  // <--- ESTA ES LA CLAVE
        ).map(item => {
            return {
                id: item.id,
                name: item.name,
                img: item.img,
                formato: item.system.formato
            };
        });

        return context;
    }

    // 3. Escuchar Eventos del DOM (Clics)
    activateListeners(html) {
        super.activateListeners(html);


        // Botones de Descanso y Recuperación
        html.find('.btn-dormir').click(this._onDormir.bind(this));
        html.find('.btn-recuperacion-total').click(this._onRecuperacionTotal.bind(this));


        // Escuchamos el clic en la habilidad y en el lápiz de editar (los que ya tenías)
        html.find('.tirar-habilidad').click(this._onTirarHabilidad.bind(this));
        html.find('.cambiar-dado').click(this._onCambiarDado.bind(this));

        // NUEVO: Escuchamos el clic directamente en la imagen para tirar el dado
        html.find('.tirar-atributo').click(this._onTirarAtributo.bind(this));
        html.find('.estabilidad-box').click(this._onCambiarEstabilidad.bind(this));

        html.find('.tirar-habilidad').click(this._onTirarHabilidad.bind(this));
        html.find('.arma-roll').click(this._onTirarArma.bind(this)); // NUEVO ESCUCHADOR


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

        // NUEVO: Escuchador para Ver cartas GLOBALES (Equipo)
        html.find('.item-edit-global').click(ev => {
            ev.preventDefault();
            const itemId = $(ev.currentTarget).data("itemId");
            const itemGlobal = game.items.get(itemId);
            if (itemGlobal) itemGlobal.sheet.render(true);
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

        // Creamos un diálogo emergente mejorado
        new Dialog({
            title: `Usar ${item.name}`,
            content: `
                <div style="padding: 10px; text-align: center; color: #e0e0e0;">
                    <p style="font-size: 16px; margin-bottom: 15px;">¿Cuántos puntos de <b>${item.name}</b> quieres gastar?<br><span style="font-size: 13px; color: #aaa;">(Máximo disponible: ${puntosDisponibles})</span></p>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <i class="fas fa-bolt" style="color: #00ccff; font-size: 24px;"></i>
                        <input type="number" id="puntos-gasto" value="1" min="1" max="${puntosDisponibles}" style="width: 80px; height: 45px; text-align: center; background: #111; color: #fff; border: 2px solid #00ccff; font-size: 24px; font-weight: bold; border-radius: 5px; font-family: 'Kalam', cursive;">
                    </div>
                </div>
            `,
            buttons: {
                lanzar: {
                    icon: '<i class="fas fa-dice"></i>',
                    label: "Lanzar Dado",
                    callback: async (htmlContent) => {
                        const gasto = parseInt(htmlContent.find('#puntos-gasto').val());

                        if (gasto > puntosDisponibles || gasto <= 0 || isNaN(gasto)) {
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
                            flavor: `<h3><i class="fas fa-dice-d20"></i> ${item.name}</h3>Utiliza Atributo <b>${atributoBase.toUpperCase()}</b> gastando <b>${gasto}</b> punto(s).`
                        });
                    }
                }
            },
            default: "lanzar"
        }, { width: 350, classes: ["dorso_oscuro", "dialog"] }).render(true);
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

        // Verificamos si es el DJ y si el objeto es una carta comerciable
        const isGM = game.user.isGM;
        const esCartaComerciable = item.type === "carta_poder" || item.type === "carta_objeto";

        // Si es el DJ borrando una carta, le damos las opciones avanzadas
        if (isGM && esCartaComerciable) {
            new Dialog({
                title: `Borrar o Vender Carta`,
                content: `
                    <p style="text-align: center; margin-bottom: 5px;">¿Qué deseas hacer con la carta <strong>${item.name}</strong>?</p>
                    <div style="background: rgba(0,0,0,0.1); border: 1px solid #444; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                        <p style="font-size: 13px; margin: 0 0 8px 0;">
                            <i class="fas fa-trash" style="color: #ff4444;"></i> <b>Normal:</b> Para corregir errores. Simplemente se borra del jugador sin alterar la economía.
                        </p>
                        <p style="font-size: 13px; margin: 0;">
                            <i class="fas fa-store" style="color: #00ccff;"></i> <b>Mercader:</b> El mercader la destruye, se retira del mundo para que no vuelva a salir en el mercado, y el jugador paga esencia. <br>
                            <span style="font-size: 11px; color: #888; font-style: italic;">(Nota: Si quieres recuperarla en el futuro, busca el actor oculto "Papelera del Mercader" y bórrala de su ficha).</span>
                        </p>
                    </div>
                    <div class="flexrow" style="align-items: center; justify-content: center; margin-bottom: 10px; gap: 10px;">
                        <label style="font-weight: bold; flex: 0 0 auto;">Coste de eliminación (Esencia):</label>
                        <input type="number" id="precio-venta" value="4" style="width: 50px; text-align: center; font-weight: bold; background: #111; color: #fff; border: 1px solid #444;">
                    </div>
                `,
                buttons: {
                    vender: {
                        label: "ELIMINAR MERCADER",
                        icon: '<i class="fas fa-store"></i>',
                        callback: async (html) => {
                            const precio = parseInt(html.find('#precio-venta').val()) || 0;
                            await MercaderManager.venderCarta(this.actor.id, item.id, precio);
                        }
                    },
                    normal: {
                        label: "ELIMINAR NORMAL",
                        icon: '<i class="fas fa-trash"></i>',
                        callback: () => item.delete()
                    },
                    cancelar: {
                        label: "Cancelar",
                        icon: '<i class="fas fa-times"></i>'
                    }
                },
                default: "vender"
            }, { width: 500 }).render(true);

        } else {
            // Borrado clásico nativo si no es DJ o si es una habilidad/alma
            Dialog.confirm({
                title: `Borrar Item`,
                content: `<p style="text-align: center;">¿Estás seguro de que quieres borrar <strong>${item.name}</strong>?</p>`,
                yes: () => item.delete(),
                no: () => {},
                defaultYes: false
            });
        }
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


    // Función para preparar los objetos "Cards" de Foundry
    async _registrarMazoDeJuego() {
        const actor = this.actor;
        let folderId = null;

        // --- 1. GESTIÓN DE CARPETAS (Solo para el Director de Juego) ---
        // Si el usuario es el GM, organizamos en carpetas. Si es jugador, folderId se queda null (Raíz).
        if (game.user.isGM) {
            try {
                let rootFolder = game.folders.find(f => f.name === "PARTIDAS" && f.type === "Cards");
                if (!rootFolder) rootFolder = await Folder.create({ name: "PARTIDAS", type: "Cards" });

                let actorCardsFolder = game.folders.find(f => f.name === actor.name && f.type === "Cards" && f.folder?.id === rootFolder.id);
                if (!actorCardsFolder) {
                    actorCardsFolder = await Folder.create({ name: actor.name, type: "Cards", folder: rootFolder.id });
                }
                folderId = actorCardsFolder.id;
            } catch (error) {
                console.error("Dorso Oscuro | Error al organizar carpetas del GM:", error);
            }
        }

        // --- 2. CREACIÓN DE LAS 5 PILAS (Directo al raíz si es jugador) ---
        const createStack = async (name, type) => {
            return await Cards.create({
                name: `[${name}] ${actor.name}`,
                type: type,
                folder: folderId, // Si es null, Foundry lo crea en el raíz automáticamente
                ownership: actor.ownership // Mantenemos esto para que el jugador sea dueño de sus cartas
            });
        };

        const deck = await createStack("Mazo", "deck");
        const hand = await createStack("Mano", "hand");
        const discard = await createStack("Descarte", "pile");
        const banished = await createStack("Eliminadas", "pile");
        const inPlay = await createStack("En Juego", "pile");

        // --- 3. POBLAR EL MAZO ---
        const itemsCartas = actor.items.filter(i =>
            (i.type === "carta_poder" || i.type === "carta_objeto") && !i.system.enBanquillo
        );

        const cardsData = itemsCartas.map(item => ({
            name: item.name,
            faces: [{ img: item.img, name: item.name }],
            back: { img: "systems/dorso_oscuro/assets/cartas/reverso_carta1.png" },
            flags: { dorso_oscuro: { itemId: item.id } }
        }));

        await deck.createEmbeddedDocuments("Card", cardsData);

        // --- 4. GUARDAR IDs EN EL ACTOR ---
        await actor.update({
            "system.deckId": deck.id,
            "system.handId": hand.id,
            "system.discardId": discard.id,
            "system.eliminadasId": banished.id,
            "system.enJuegoId": inPlay.id
        });
    }

    async _onTirarArma(event) {
        event.preventDefault();
        const li = $(event.currentTarget).parents(".item");
        const arma = this.actor.items.get(li.data("itemId"));

        const habilidadName = arma.system.habilidadAsociada;
        if (!habilidadName) {
            return ui.notifications.warn(`El arma ${arma.name} no tiene ninguna habilidad asociada.`);
        }

        // Buscamos si el personaje tiene esta habilidad
        const habilidad = this.actor.items.find(i => i.type === "habilidad" && i.name === habilidadName);

        if (!habilidad) {
            return ui.notifications.error(`No posees la habilidad "${habilidadName}" necesaria para usar ${arma.name}.`);
        }

        const puntosDisponibles = habilidad.system.valorActual;
        const atributoBase = habilidad.system.atributoBase;
        const dadoAtributo = this.actor.system.atributos[atributoBase];

        new Dialog({
            title: `Atacar con ${arma.name}`,
            content: `
                <div style="padding: 10px; text-align: center; color: #e0e0e0;">
                    <p style="font-size: 16px; margin-bottom: 15px;">¿Cuántos puntos de <b>${habilidad.name}</b> quieres gastar para atacar?<br><span style="font-size: 13px; color: #aaa;">(Máximo disponible: ${puntosDisponibles})</span></p>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <i class="fas fa-bolt" style="color: #00ccff; font-size: 24px;"></i>
                        <input type="number" id="puntos-gasto-arma" value="0" min="0" max="${puntosDisponibles}" style="width: 80px; height: 45px; text-align: center; background: #111; color: #fff; border: 2px solid #00ccff; font-size: 24px; font-weight: bold; border-radius: 5px; font-family: 'Kalam', cursive;">
                    </div>
                </div>
            `,
            buttons: {
                lanzar: {
                    icon: '<i class="fas fa-crosshairs"></i>',
                    label: "Atacar",
                    callback: async (htmlContent) => {
                        const gasto = parseInt(htmlContent.find('#puntos-gasto-arma').val()) || 0;

                        if (gasto > puntosDisponibles || gasto < 0) {
                            return ui.notifications.error("Cantidad de gasto inválida.");
                        }

                        // A) Restar puntos si el gasto es mayor a 0
                        if (gasto > 0) {
                            await habilidad.update({ "system.valorActual": puntosDisponibles - gasto });
                        }

                        // B) Tirada de Habilidad (Ej: 1d6 + 2, o solo 1d6)
                        const formulaAtaque = gasto > 0 ? `${dadoAtributo} + ${gasto}` : `${dadoAtributo}`;
                        const rollAtaque = new Roll(formulaAtaque);
                        await rollAtaque.evaluate();

                        await rollAtaque.toMessage({
                            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                            flavor: `<h3><i class="fas fa-crosshairs"></i> Ataque con ${arma.name}</h3>Utiliza <b>${habilidad.name}</b> (${atributoBase.toUpperCase()}) gastando <b>${gasto}</b> punto(s).`
                        });

                        // C) Tirada de Daño del arma
                        if (arma.system.danio) {
                            try {
                                const rollDanio = new Roll(arma.system.danio);
                                await rollDanio.evaluate();
                                await rollDanio.toMessage({
                                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                                    flavor: `<h3><i class="fas fa-tint" style="color: #8b0000;"></i> Daño: ${arma.name}</h3>`
                                });
                            } catch (error) {
                                console.error("Dorso Oscuro | Error en la fórmula de daño:", error);
                                ui.notifications.error(`La fórmula de daño "${arma.system.danio}" no es válida.`);
                            }
                        }
                    }
                }
            },
            default: "lanzar"
        }, { width: 350, classes: ["dorso_oscuro", "dialog"] }).render(true);
    }


    // --- LÓGICA DE DORMIR ---
    async _onDormir(event) {
        event.preventDefault();

        // Filtramos solo las habilidades generales del actor
        const generales = this.actor.items.filter(i => i.type === "habilidad" && i.system.tipo === "general");

        // Creamos los checkboxes para el diálogo
        let checkboxes = generales.map(h => `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; border-bottom: 1px dashed rgba(255,255,255,0.2); padding-bottom: 4px;">
                <label for="chk-${h.id}" style="font-family: 'Kalam', cursive; font-size: 16px;">${h.name} <span style="font-size: 12px; color: #aaa;">(${h.system.valorActual}/${h.system.valorMax})</span></label>
                <input type="checkbox" class="dormir-skill-chk" id="chk-${h.id}" value="${h.id}" data-name="${h.name}" ${h.system.valorActual === h.system.valorMax ? 'disabled' : ''}>
            </div>
        `).join('');

        const content = `
            <div style="padding: 10px; color: #e0e0e0;">
                <p style="text-align:center; font-family: 'Kalam', cursive; font-size: 16px; margin-bottom: 15px;">Elige hasta <strong>3 habilidades generales</strong> para recuperar al máximo:</p>
                <div style="max-height: 220px; overflow-y: auto; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 5px; border: 1px solid #444; color: #fff;">
                    ${checkboxes || '<p style="text-align: center; color: #888;">No hay habilidades generales.</p>'}
                </div>
                <p style="text-align:center; font-size: 14px; font-weight: bold; margin-top: 10px; min-height: 20px;" id="dormir-warning"></p>
            </div>
        `;

        new Dialog({
            title: "Descansar y Entrar al Dorso Oscuro",
            content: content,
            buttons: {
                dormir: {
                    icon: '<i class="fas fa-moon"></i>',
                    label: "Dormir",
                    callback: async (htmlContent) => {
                        const selectedIds = [];
                        const selectedNames = [];
                        htmlContent.find('.dormir-skill-chk:checked').each(function() {
                            selectedIds.push($(this).val());
                            selectedNames.push($(this).data('name'));
                        });

                        const updates = [];

                        // 1. Recuperar Habilidades Elegidas
                        for (let id of selectedIds) {
                            const item = this.actor.items.get(id);
                            if (item) {
                                updates.push({ _id: id, "system.valorActual": item.system.valorMax });
                            }
                        }
                        if (updates.length > 0) {
                            await this.actor.updateEmbeddedDocuments("Item", updates);
                        }

                        // 2. Recuperar Salud (+1)
                        let saludActual = this.actor.system.hp.value;
                        let saludMax = this.actor.system.hp.max;
                        let saludRecuperada = 0;
                        if (saludActual < saludMax) {
                            await this.actor.update({ "system.hp.value": saludActual + 1 });
                            saludRecuperada = 1;
                        }

                        // 3. Recuperar Estabilidad (1d4+2)
                        const roll = new Roll("1d4 + 2");
                        await roll.evaluate();
                        let estActual = this.actor.system.estabilidad;
                        let estMax = 22; // Máximo establecido en tu sistema
                        let nuevaEstabilidad = Math.min(estMax, estActual + roll.total);
                        let recReal = nuevaEstabilidad - estActual;
                        await this.actor.update({ "system.estabilidad": nuevaEstabilidad });

                        // 4. Mandar Resumen al Chat
                        let mensaje = `<h3 style="border-bottom: 1px solid #4a3424; color: #4a3424;"><i class="fas fa-bed"></i> Descanso Completado</h3>`;
                        mensaje += `<p><b>${this.actor.name}</b> ha dormido recuperando sus fuerzas.</p><ul style="font-size: 14px; margin-top: 5px;">`;

                        // Salud
                        mensaje += `<li><b>Salud:</b> ${saludRecuperada > 0 ? `Recupera +1 <span style="color: #444;">(${saludActual + 1}/${saludMax})</span>` : `Ya estaba al máximo.`}</li>`;

                        // Estabilidad
                        mensaje += `<li><b>Estabilidad:</b> Recupera +${recReal} <span style="color: #444;">(Tirada: ${roll.total}) [${nuevaEstabilidad}/22]</span></li>`;

                        // Habilidades
                        mensaje += `<li><b>Hab. Generales:</b> ${selectedNames.length > 0 ? selectedNames.join(', ') : `Ninguna`}</li>`;

                        mensaje += `</ul>`;

                        await roll.toMessage({
                            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                            flavor: mensaje
                        });
                    }
                },
                cancelar: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancelar"
                }
            },
            render: (htmlContent) => {
                // Controlar que no marquen más de 3
                htmlContent.find('.dormir-skill-chk').change(function() {
                    if (htmlContent.find('.dormir-skill-chk:checked').length > 3) {
                        this.checked = false;
                        htmlContent.find('#dormir-warning').text('¡Solo puedes recuperar 3 habilidades!').css('color', '#ffaa00');
                    } else {
                        htmlContent.find('#dormir-warning').text('');
                    }
                });
            },
            default: "dormir"
        }, { width: 400, classes: ["dorso_oscuro", "dialog"] }).render(true);
    }

    // --- LÓGICA DE RECUPERACIÓN TOTAL ---
    async _onRecuperacionTotal(event) {
        event.preventDefault();

        Dialog.confirm({
            title: `Recuperación Total - ${this.actor.name}`,
            content: `
                <div style="text-align: center; padding: 10px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 30px; color: #ffaa00; margin-bottom: 10px;"></i>
                    <p style="font-family: 'Kalam', cursive; font-size: 18px;">Esto solo pasa al cambiar de capítulo.</p>
                    <p style="font-size: 14px; color: #aaa;">¿Estás seguro de que quieres recuperar al máximo TODAS tus habilidades Técnicas y Generales?</p>
                </div>
            `,
            yes: async () => {
                const habilidades = this.actor.items.filter(i => i.type === "habilidad");
                const updates = habilidades.map(h => ({
                    _id: h.id,
                    "system.valorActual": h.system.valorMax
                }));

                if (updates.length > 0) {
                    await this.actor.updateEmbeddedDocuments("Item", updates);
                    ui.notifications.info(`Todas las habilidades de ${this.actor.name} han sido restauradas al máximo.`);
                }
            },
            no: () => {},
            defaultYes: false
        }, { classes: ["dorso_oscuro", "dialog"] });
    }


}