export class MercaderPapeleraSheet extends foundry.appv1.sheets.ActorSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "actor", "mercader-papelera"],
            template: "systems/dorso_oscuro/templates/mercader-papelera-sheet.hbs",
            width: 520,
            height: 600,
            resizable: true
        });
    }

    async getData() {
        const context = super.getData();
        // Pasamos la lista ordenada de las cartas (items) que posee este actor "Papelera"
        context.items = this.actor.items.contents.sort((a, b) => a.name.localeCompare(b.name));
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Escuchar el clic en el botón flotante de eliminación
        html.find('.btn-recuperar-carta').click(async (ev) => {
            ev.preventDefault();
            const itemId = $(ev.currentTarget).data('itemId');
            const item = this.actor.items.get(itemId);

            if (item) {
                // Confirmación rápida en cascada estética para el GM
                Dialog.confirm({
                    title: "Recuperar Carta",
                    content: `<p style="font-family: 'Kalam', cursive; text-align: center; font-size: 15px;">¿Seguro que quieres eliminar <b>${item.name}</b> del Almacén?<br><span style="color:#aaa; font-size:12px;">Esto la devolverá al stock disponible de la aventura.</span></p>`,
                    yes: async () => {
                        await item.delete();
                        ui.notifications.info(`Carta "${item.name}" devuelta a la aventura.`);
                    },
                    defaultYes: true
                });
            }
        });

        // Efectos hover visuales para el botón de borrar
        html.find('.btn-recuperar-carta').hover(
            function() { $(this).css({'transform': 'scale(1.15)', 'background': '#b30000'}); },
            function() { $(this).css({'transform': 'scale(1)', 'background': '#8b0000'}); }
        );
    }
}