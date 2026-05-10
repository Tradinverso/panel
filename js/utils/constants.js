// Factor interno usado SOLO para convertir el importe monetario que devuelve
// el Apps Script legacy a porcentaje. La app trabaja en % en todo momento;
// este factor refleja el capital base con el que el Google Sheet original
// calcula sus columnas de importe. No se expone al usuario.
//
// Si en el futuro el sheet de origen cambia, basta con actualizar este número.
export const SHEET_CONVERSION_FACTOR = 50000;
