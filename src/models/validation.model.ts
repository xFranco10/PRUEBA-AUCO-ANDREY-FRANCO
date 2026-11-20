import { Schema, model, type InferSchemaType } from 'mongoose';

// Datos que aporta la API pública (Nager.Date). Se guardan separados de lo que envía el usuario.
const enrichmentSchema = new Schema(
  {
    commonName: { type: String, required: true },
    officialName: { type: String, required: true },
    region: { type: String, required: true },
    countryCode: { type: String, required: true },
  },
  { _id: false },
);

const validationSchema = new Schema(
  {
    // Datos enviados por el usuario
    name: { type: String, required: true, trim: true },
    // String (no número) para no perder ceros a la izquierda ni precisión
    document: { type: String, required: true, index: true },
    country: { type: String, required: true, uppercase: true, trim: true },

    // Datos obtenidos de la API externa
    enrichment: { type: enrichmentSchema, required: true },
  },
  {
    // Agrega createdAt y updatedAt automáticamente
    timestamps: true,
    toJSON: {
      // En las respuestas se expone "id" en lugar de "_id" y se oculta "__v"
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// El tipo TypeScript se infiere del esquema para no duplicar la definición
export type ValidationAttrs = InferSchemaType<typeof validationSchema>;

export const ValidationModel = model('Validation', validationSchema);
