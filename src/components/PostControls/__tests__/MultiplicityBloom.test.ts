import {getMultiplicityPetalCount} from '../multiplicity-bloom'

describe('getMultiplicityPetalCount', () => {
  it.each([
    [Number.NaN, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, 2],
    [3, 3],
    [5, 5],
    [12, 5],
  ])('maps %s viewer records to %s petals', (count, expected) => {
    expect(getMultiplicityPetalCount(count)).toBe(expected)
  })
})
