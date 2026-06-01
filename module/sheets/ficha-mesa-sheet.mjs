export class FichaMesaSheet extends foundry.appv1.sheets.ActorSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["dorso_oscuro", "sheet", "actor", "ficha-mesa"],
            template: "systems/dorso_oscuro/templates/ficha-mesa-sheet.hbs",
            width: 350,
            height: 400,
            resizable: false
        });
    }

    async getData() {
        const context = super.getData();
        context.system = context.actor.system;
        context.isGM = game.user.isGM;
        return context;
    }
}