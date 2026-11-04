// Errores tipados del dominio. Se evita lanzar strings sueltos para poder
// distinguir validación, configuración de plantilla y falta de datos.
export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_CONFIG_INVALID'
  | 'MISSING_FIELD_VALUE'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function templateNotFound(producto: string, tipoEndoso: string): AppError {
  return new AppError(
    'TEMPLATE_NOT_FOUND',
    `No existe una plantilla activa para el producto "${producto}" y el tipo de endoso "${tipoEndoso}"`,
    404,
    { producto, tipoEndoso },
  );
}

export function templateConfigInvalid(message: string, details?: unknown): AppError {
  return new AppError('TEMPLATE_CONFIG_INVALID', message, 500, details);
}

export function missingFieldValue(label: string, sourceKey: string): AppError {
  return new AppError(
    'MISSING_FIELD_VALUE',
    `Falta el valor de "${label}" (input.${sourceKey}) y la plantilla no define un valor por defecto`,
    422,
    { label, sourceKey },
  );
}
