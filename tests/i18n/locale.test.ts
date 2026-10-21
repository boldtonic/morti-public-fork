import { describe, expect, it } from 'vitest'
import { resolveInitialLocale } from '~~/shared/i18n/locale'

describe('resolveInitialLocale', () => {
  it('devuelve el locale guardado cuando es válido', () => {
    expect(resolveInitialLocale('en')).toBe('en')
    expect(resolveInitialLocale('es')).toBe('es')
  })

  it('cae a "es" con valores inválidos o ausentes', () => {
    expect(resolveInitialLocale(null)).toBe('es')
    expect(resolveInitialLocale(undefined)).toBe('es')
    expect(resolveInitialLocale('fr')).toBe('es')
    expect(resolveInitialLocale('')).toBe('es')
  })
})
