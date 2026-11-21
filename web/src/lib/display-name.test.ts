import { describe, expect, it } from 'vitest'
import { displayName } from './display-name'

describe('displayName', () => {
  it('shows brydit in lowercase whatever the stored case', () => {
    expect(displayName('Brydit')).toBe('brydit')
    expect(displayName('BRYDIT')).toBe('brydit')
  })

  it('leaves other names alone', () => {
    expect(displayName('PayYoBills')).toBe('PayYoBills')
  })

  it('returns null for a missing name', () => {
    expect(displayName(null)).toBeNull()
    expect(displayName(undefined)).toBeNull()
    expect(displayName('')).toBeNull()
  })
})
