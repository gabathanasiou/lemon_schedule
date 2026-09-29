import { describe, it, expect } from 'vitest';
import { formatTempC } from '../reportWeather';

describe('formatTempC', () => {
  it('rounds to the nearest degree and appends the unit', () => {
    expect(formatTempC(23.6)).toBe('24°C');
    expect(formatTempC(17.2)).toBe('17°C');
  });

  it('renders an em dash when the API returned no value', () => {
    expect(formatTempC(null)).toBe('—');
  });
});
