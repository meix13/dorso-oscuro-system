// module/apps/mercader-hud.mjs
import { MercaderManager } from "./mercader.mjs";

export class MercaderHud extends Application {
    constructor(options = {}) {
        super(options);
        this.ofertaActual = { objetos: [], poderes: [] };
        this.filtros = { nombre: "", mundo: "", tipo: "" };
        this.mundosActivos = ["inicial"];
        this.cantidadesOferta = { objetos: 2, poderes: 7 };
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "mercader-hud",
            title: "El Mercader - Dorso Oscuro",
            template: "systems/dorso_oscuro/templates/apps/mercader-hud.hbs",
            width: 780, // Lo ensanchamos un pelín para que quepan bien los nuevos botones
            height: 650,
            classes: ["dorso_oscuro", "mercader-app"],
            resizable: true,
            dragDrop: [{ dragSelector: ".mercader-card" }],
            // NUEVO: Activamos el sistema de pestañas de Foundry
            tabs: [{ navSelector: ".tabs", contentSelector: ".tab-content", initial: "tienda" }]
        });
    }

    async getData() {
        const data = await super.getData();
        data.oferta = this.ofertaActual;
        data.cantidades = this.cantidadesOferta;

        const listaMundos = [
            { id: "inicial", nombre: "Inicial (Base)" },
            { id: "ghilliam_duh", nombre: "Ghilliam Duh" },
            { id: "cu_sith", nombre: "Cu Sith" },
            { id: "aletehia", nombre: "Aletehia" },
            { id: "glaistig", nombre: "Glaistig" }
        ];

        data.mundos = listaMundos.map(m => ({
            ...m,
            checked: this.mundosActivos.includes(m.id)
        }));

        // --- LÓGICA DEL CATÁLOGO ---
        let catalogo = MercaderManager.obtenerCatalogoCompleto();

        // Aplicar filtros
        if (this.filtros.nombre) {
            catalogo = catalogo.filter(c => c.name.toLowerCase().includes(this.filtros.nombre.toLowerCase()));
        }
        if (this.filtros.mundo) {
            catalogo = catalogo.filter(c => c.mundo === this.filtros.mundo);
        }
        if (this.filtros.tipo) {
            catalogo = catalogo.filter(c => c.tipo.toLowerCase() === this.filtros.tipo.toLowerCase());
        }

        data.catalogo = catalogo;
        data.filtros = this.filtros;

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Botón 1: Crear cartas iniciales en los mazos
        html.find('.btn-crear-cartas-iniciales').click(async ev => {
            ev.preventDefault();
            await MercaderManager.inyectarCartasInicialesMasivo();
        });

        html.find('.btn-draft-inicial').click(async ev => {
            ev.preventDefault();
            await MercaderManager.generarDraftInicial();
            this.close(); // Opcional: cierra el HUD tras generar el draft
        });

        // --- GENERAR OFERTA ---
        html.find('#btn-generar-oferta').click(ev => {
            const numObj = parseInt(html.find('#num-objetos').val()) || 2;
            const numPod = parseInt(html.find('#num-poderes').val()) || 7;

            // NUEVO: Salvamos la configuración del usuario en la clase
            this.cantidadesOferta.objetos = numObj;
            this.cantidadesOferta.poderes = numPod;

            const mundosSeleccionados = [];
            html.find('.mundo-checkbox:checked').each(function() {
                mundosSeleccionados.push($(this).val());
            });

            if (mundosSeleccionados.length === 0) {
                return ui.notifications.warn("Debes seleccionar al menos un mundo para generar cartas.");
            }

            this.ofertaActual = MercaderManager.generarOferta(mundosSeleccionados, numObj, numPod);
            this.render(false);
        });

        // --- ARRASTRAR CARTA DE LA OFERTA A UN JUGADOR/TABLERO ---
        html.find('.mercader-card').on('dragstart', ev => {
            const itemId = ev.currentTarget.dataset.itemId;
            const item = game.items.get(itemId);
            if (!item) return;

            // Usamos el formato nativo "Item" de Foundry.
            // Así el DJ puede soltarlo directamente en la ficha del personaje.
            const dragData = {
                type: "Item",
                uuid: item.uuid
            };
            ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(dragData));
        });

        html.find('#btn-pasar-tablero').click(async ev => {
            ev.preventDefault();

            // 1. OBTENER LAS CARTAS DE LA TIENDA ACTUAL
            // Juntamos los objetos y poderes de tu variable interna
            const itemsOferta = [...this.ofertaActual.objetos, ...this.ofertaActual.poderes];

            // Buscamos el ítem real en la base de datos de Foundry usando su ID
            const cartasTienda = itemsOferta.map(c => game.items.get(c.id || c._id)).filter(i => i);

            if (!cartasTienda || cartasTienda.length === 0) {
                return ui.notifications.warn("No hay cartas en la oferta para pasar al tablero.");
            }

            // 2. SEPARAR POR CATEGORÍAS (Objetos primero, luego Poderes)
            const objetos = cartasTienda.filter(i => i.type === "carta_objeto");
            const poderes = cartasTienda.filter(i => i.type === "carta_poder");

            const grupos = [
                { items: objetos, titulo: "Objetos" },
                { items: poderes, titulo: "Poderes" }
            ];

            ui.notifications.info("Desplegando la Tienda en el tablero...");
            const tokensToCreate = [];
            const gridSize = canvas.grid.size;
            const viewCenter = canvas.stage.pivot;

            // Centramos la cámara
            let startX = viewCenter.x - (gridSize * 15);
            let startY = viewCenter.y - (gridSize * 10);

            const maxFilas = 5;
            const espaciadoX = 2.8;
            const espaciadoY = 4.0;

            let columnaGlobalActual = 0;

            // 3. GENERAR EN COLUMNAS EXACTAMENTE IGUAL QUE EL DRAFT
            for (let grupo of grupos) {
                if (grupo.items.length === 0) continue;

                let indexDentroDelGrupo = 0;

                for (let item of grupo.items) {
                    const fila = indexDentroDelGrupo % maxFilas;
                    const columnaLocal = Math.floor(indexDentroDelGrupo / maxFilas);
                    const precio = item.system.costeEsencia || 0;

                    tokensToCreate.push({
                        name: `💰 ${precio}  |  ${item.name}`,
                        texture: { src: item.img },
                        width: 2.5,
                        height: 3.6,
                        x: startX + ((columnaGlobalActual + columnaLocal) * espaciadoX * gridSize),
                        y: startY + (fila * espaciadoY * gridSize),
                        lockRotation: true,
                        displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                        flags: {
                            dorso_oscuro: {
                                isCard: true,
                                isMercader: true, // Funciona con tu botón de recoger
                                isGlobal: true,   // <--- MAGIA: Activa el botón de entregar carta
                                itemId: item.id,
                                type: item.type,
                                nombreReal: item.name,
                                imgReal: item.img
                            }
                        }
                    });

                    indexDentroDelGrupo++;
                }

                // Dejamos un pasillo vacío entre los Objetos y los Poderes
                const columnasUsadasPorEsteGrupo = Math.ceil(indexDentroDelGrupo / maxFilas);
                columnaGlobalActual += columnasUsadasPorEsteGrupo + 1;
            }

            // 4. SPAWN DE CARTAS EN LA MESA
            if (tokensToCreate.length > 0) {
                await canvas.scene.createEmbeddedDocuments("Token", tokensToCreate);
                this.close(); // Opcional: Cierra el menú del mercader para que veas la mesa limpia
            }
        });

        // --- RECOGER TOKENS DEL MERCADER ---
        html.find('#btn-recoger-tablero').click(async ev => {
            const tokensMercader = canvas.tokens.placeables.filter(t =>
                t.document.getFlag("dorso_oscuro", "isMercader")
            );

            if (tokensMercader.length === 0) {
                return ui.notifications.info("No hay tokens del mercader que recoger.");
            }

            const ids = tokensMercader.map(t => t.id);
            await canvas.scene.deleteEmbeddedDocuments("Token", ids);
            ui.notifications.info("Mesa del mercader recogida.");
        });

        // --- LIMPIAR OFERTA ---
        html.find('#btn-limpiar-oferta').click(ev => {
            // Vaciamos el objeto de la oferta actual
            this.ofertaActual = { objetos: [], poderes: [] };

            // Refrescamos la interfaz para que desaparezcan las cartas
            this.render(false);

            ui.notifications.info("El escaparate del mercader ha sido vaciado.");
        });

        html.find('.mundo-checkbox').change(ev => {
            const mundosSeleccionados = [];
            html.find('.mundo-checkbox:checked').each(function() {
                mundosSeleccionados.push($(this).val());
            });
            this.mundosActivos = mundosSeleccionados;
            // No hace falta re-renderizar aquí, solo guardamos el dato
        });
        // --- GENERAR MESA MERCADER  ---
        html.find('#btn-generar-mesa').click(ev => {
            if (this.mundosActivos.length === 0) {
                return ui.notifications.warn("Debes seleccionar al menos un mundo.");
            }

            this.ofertaActual = MercaderManager.generarOferta(this.mundosActivos, 2, 15);
            this.render(false); // Al re-renderizar, getData usará this.mundosActivos y mantendrá los checks
            ui.notifications.info("Mesa Mercader generada.");
        });

        // Buscador de texto
        html.find('.filtro-catalogo').on('input', ev => {
            this.filtros.nombre = ev.target.value;
            this.render(false);
        });

        // Selectores de mundo/tipo
        html.find('.select-filtro').change(ev => {
            const campo = ev.target.dataset.campo;
            this.filtros[campo] = ev.target.value;
            this.render(false);
        });

        // Botón: Añadir a la oferta manual
        html.find('.btn-add-oferta').click(ev => {
            const itemId = ev.currentTarget.dataset.itemId;
            const item = game.items.get(itemId);
            if (!item) return;

            if (item.type === "carta_objeto") this.ofertaActual.objetos.push(item);
            else this.ofertaActual.poderes.push(item);

            ui.notifications.info(`Añadida "${item.name}" a la oferta.`);
            this.render(false);
        });

        html.find('.ver-imagen').click(ev => {
            ev.stopPropagation(); // Evitamos que el clic dispare otros eventos
            const img = ev.currentTarget.dataset.img;
            const name = ev.currentTarget.dataset.name;

            new ImagePopout(img, {
                title: name,
                shareable: true
            }).render(true);
        });

        // En mercader-hud.mjs -> activateListeners

        html.find('.btn-rastrear').click(ev => {
            const itemId = ev.currentTarget.dataset.itemId;
            const info = MercaderManager.obtenerDetalleUbicacion(itemId);

            if (!info) return;

            // Construimos el HTML del desglose
            let listadoJugadores = info.enJugadores.length > 0
                ? info.enJugadores.map(j => `<li><b>${j.nombre}:</b> ${j.cantidad} copia(s)</li>`).join('')
                : "<li>Ningún jugador tiene esta carta.</li>";

            let content = `
            <div style="font-family: 'Kalam', cursive; font-size: 14px;">
                <p style="border-bottom: 1px solid #444; padding-bottom: 5px;">Distribución de <b>${info.nombre}</b> (Total: ${info.total})</p>
                <ul style="list-style: none; padding: 0;">
                    <li style="color: #6f6; margin-bottom: 5px;"><i class="fas fa-box-open"></i> <b>En el limbo (Stock):</b> ${info.disponibles}</li>
                    <li style="color: #ffaa00; margin-bottom: 5px;"><i class="fas fa-users"></i> <b>En posesión:</b>
                        <ul style="padding-left: 15px; font-size: 12px; color: #ccc;">${listadoJugadores}</ul>
                    </li>
                    <li style="color: #f66;"><i class="fas fa-trash"></i> <b>En la Papelera:</b> ${info.enPapelera}</li>
                </ul>
            </div>
        `;

            new Dialog({
                title: `Rastreo: ${info.nombre}`,
                content: content,
                buttons: { cerrar: { label: "Cerrar" } }
            }).render(true);
        });

    }


}