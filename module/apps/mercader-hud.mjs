// module/apps/mercader-hud.mjs
import { MercaderManager } from "./mercader.mjs";

export class MercaderHud extends Application {
    constructor(options = {}) {
        super(options);
        this.ofertaActual = { objetos: [], poderes: [] };
        // NUEVO: Filtros actuales del catálogo
        this.filtros = { nombre: "", mundo: "", tipo: "" };
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

        // Pasamos los mundos para pintar los checkboxes
        data.mundos = [
            { id: "inicial", nombre: "Inicial (Base)" },
            { id: "ghilliam_duh", nombre: "Ghilliam Duh" },
            { id: "cu_sith", nombre: "Cu Sith" },
            { id: "aletehia", nombre: "Aletehia" },
            { id: "glaistig", nombre: "Glaistig" }
        ];

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

        // --- GENERAR OFERTA ---
        html.find('#btn-generar-oferta').click(ev => {
            const numObj = parseInt(html.find('#num-objetos').val()) || 2;
            const numPod = parseInt(html.find('#num-poderes').val()) || 7;

            const mundosSeleccionados = [];
            html.find('.mundo-checkbox:checked').each(function() {
                mundosSeleccionados.push($(this).val());
            });

            if (mundosSeleccionados.length === 0) {
                return ui.notifications.warn("Debes seleccionar al menos un mundo para generar cartas.");
            }

            // Llamamos al cerebro del mercader
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

        // --- PASAR TODA LA OFERTA AL TABLERO ---
        html.find('#btn-pasar-tablero').click(async ev => {
            if (!this.ofertaActual.objetos.length && !this.ofertaActual.poderes.length) {
                return ui.notifications.warn("No hay una oferta generada para pasar al tablero.");
            }

            const totalCartas = [...this.ofertaActual.objetos, ...this.ofertaActual.poderes];
            const gridSize = canvas.grid.size;

            // Punto de inicio: centro de la pantalla actual del DJ
            const viewCenter = canvas.stage.pivot;
            let startX = viewCenter.x - (gridSize * 10); // Un poco a la izquierda
            let startY = viewCenter.y - (gridSize * 5);  // Un poco arriba

            const tokensACrear = [];
            const cartasPorFila = 8;
            const espaciadoX = 2.8; // Un pelín más que el ancho (2.5) para que no se peguen
            const espaciadoY = 4.0; // Un pelín más que el alto (3.6)

            totalCartas.forEach((item, index) => {
                const fila = Math.floor(index / cartasPorFila);
                const columna = index % cartasPorFila;
                const precio = item.system.costeEsencia || 0;
                tokensACrear.push({
                    name: `💰 ${precio}  |  ${item.name}`,
                    texture: { src: item.img },
                    width: 2.5,
                    height: 3.6,
                    x: startX + (columna * espaciadoX * gridSize),
                    y: startY + (fila * espaciadoY * gridSize),
                    lockRotation: true,
                    displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                    flags: {
                        dorso_oscuro: {
                            isCard: true,
                            isMercader: true, // ETIQUETA CLAVE
                            itemId: item.id,
                            type: item.type,
                            nombreReal: item.name,
                            imgReal: item.img
                        }
                    }
                });
            });

            await canvas.scene.createEmbeddedDocuments("Token", tokensACrear);
            ui.notifications.info(`Se han desplegado ${totalCartas.length} cartas en la mesa.`);
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

        // --- GENERAR MESA MERCADER  ---
        html.find('#btn-generar-mesa').click(ev => {
            const mundosSeleccionados = [];
            html.find('.mundo-checkbox:checked').each(function() {
                mundosSeleccionados.push($(this).val());
            });

            if (mundosSeleccionados.length === 0) {
                return ui.notifications.warn("Debes seleccionar al menos un mundo.");
            }

            // Llamamos al cerebro forzando 2 objetos y 12 poderes
            this.ofertaActual = MercaderManager.generarOferta(mundosSeleccionados, 2, 12);
            this.render(false);
            ui.notifications.info("Se ha generado la Mesa del Mercader (2 Objetos / 12 Poderes).");
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

    }


}