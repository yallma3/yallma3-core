import { describe, it, expect } from 'vitest'

function sum(a: number, b: number): number {
  return a + b
}

describe('sum function', () => {
  it('adds 1 + 2 to equal 3', () => {
    expect(sum(1, 2)).toBe(3)
  })

  it('adds 0 + 0 to equal 0', () => {
    expect(sum(0, 0)).toBe(0)
  })
})