/** Locale de UI persistido. Vive en fichero propio (sin dependencias de ui-copy)
 *  para que ui-copy pueda importarlo sin ciclos. */
export const UI_LOCALE_STORAGE_KEY = 'tenon-locale'

export const UI_LOCALES = ['en', 'es'] as const
export type SupportedUiLocale = typeof UI_LOCALES[number]

export function resolveInitialLocale(stored: string | null | undefined): SupportedUiLocale {
  return UI_LOCALES.includes(stored as SupportedUiLocale)
    ? stored as SupportedUiLocale
    : 'es'
}
