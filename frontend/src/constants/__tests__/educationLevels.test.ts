import { EDUCATION_LEVELS } from '../educationLevels'

describe('EDUCATION_LEVELS', () => {
  it('contains professional level', () => {
    const values = EDUCATION_LEVELS.map(l => l.value)
    expect(values).toContain('professional')
  })
  
  it('does not contain university level', () => {
    const values = EDUCATION_LEVELS.map(l => (l as any).value)
    expect(values).not.toContain('university')
  })
  
  it('has no duplicate values', () => {
    const values = EDUCATION_LEVELS.map(l => l.value)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })
  
  it('contains all Nigerian secondary levels', () => {
    const values = EDUCATION_LEVELS.map(l => l.value)
    expect(values).toContain('jss_1')
    expect(values).toContain('jss_2')
    expect(values).toContain('jss_3')
    expect(values).toContain('ss_1')
    expect(values).toContain('ss_2')
    expect(values).toContain('ss_3')
  })
  
  it('contains primary levels', () => {
    const values = EDUCATION_LEVELS.map(l => l.value)
    expect(values).toContain('primary_1')
    expect(values).toContain('primary_6')
  })
})
