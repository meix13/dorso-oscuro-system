// module/models.mjs

export class PersonajeData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            atributos: new fields.SchemaField({
                mental: new fields.StringField({initial: "1d6", choices: ["1d4", "1d6", "1d8"]}),
                social: new fields.StringField({initial: "1d6", choices: ["1d4", "1d6", "1d8"]}),
                fisico: new fields.StringField({initial: "1d6", choices: ["1d4", "1d6", "1d8"]}),
            }),
            hp: new fields.SchemaField({
                value: new fields.NumberField({initial: 10, integer: true, min: 0}),
                max: new fields.NumberField({initial: 10, integer: true, min: 1})
            }),
            esencia: new fields.NumberField({initial: 1, integer: true, min: 1}),
            estabilidad: new fields.NumberField({initial: 15, integer: true, min: -11, max: 22}),
            cordura: new fields.NumberField({initial: 5, integer: true, min: 0, max: 5}),
            credito: new fields.NumberField({initial: 1, integer: true, min: 0, max: 5}),

            // NUEVO: Umbral de Daño
            umbral: new fields.NumberField({initial: 3, integer: true, min: 2, max: 4}),

            ocupacion: new fields.StringField({initial: ""}),
            edad: new fields.StringField({initial: ""}),
            procedencia: new fields.StringField({initial: ""})
        };
    }
}

export class HabilidadData extends foundry.abstract.TypeDataModel {
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            descripcion: new fields.HTMLField(),
            valorMax: new fields.NumberField({initial: 3, min: 1, max: 12, integer: true}),
            valorActual: new fields.NumberField({initial: 3, min: 0, integer: true}),
            atributoBase: new fields.StringField({initial: "mental", choices: ["mental", "social", "fisico"]}),
            // NUEVO: Tipo de habilidad
            tipo: new fields.StringField({initial: "general", choices: ["tecnica", "general"]})
        };
    }
}