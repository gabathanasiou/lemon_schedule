import { describe, it, expect } from 'vitest';
import { CAST_DETAIL_FIELDS, castDetailsFromMmsProperties, castDetailsOf } from '../castDetails';

describe('cast detail registry', () => {
  it('has unique keys and the Artiste label for the performer', () => {
    const keys = CAST_DETAIL_FIELDS.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(CAST_DETAIL_FIELDS.find(f => f.key === 'performer')?.label).toBe('Artiste');
  });

  it('fills blanks so manager rows and report getters never see undefined', () => {
    const d = castDetailsOf({ performer: 'James Stewart', phone: '213-555-2345' });
    expect(d.performer).toBe('James Stewart');
    expect(d.phone).toBe('213-555-2345');
    expect(d.email).toBe('');
    expect(d.agent).toBe('');
    expect(Object.keys(d).sort()).toEqual(CAST_DETAIL_FIELDS.map(f => f.key).sort());
  });
});

describe('castDetailsFromMmsProperties', () => {
  it("maps the fixture's Cast Members properties", () => {
    const d = castDetailsFromMmsProperties([
      { name: 'Full Name', value: 'James Stewart' },
      { name: 'Phone', value: '213-555-2345' },
      { name: 'Agent', value: 'Agent: Teddy Stein, Wrn. Morris' },
      { name: 'Agent Ph', value: '213-555-1427' },
      { name: 'Address', value: '124 Balmoral Lane, Los Angeles, CA 90064' },
      { name: 'Rate', value: '0' },
      { name: 'Per', value: '2' },
      { name: 'Notes', value: '  ' },
    ]);
    expect(d).toEqual({
      performer: 'James Stewart',
      phone: '213-555-2345',
      agent: 'Agent: Teddy Stein, Wrn. Morris',
      agentPhone: '213-555-1427',
      address: '124 Balmoral Lane, Los Angeles, CA 90064',
      rate: '0',
      per: '2',
    });
  });

  it('ignores unknown properties, blanks and (MMS-absent) email', () => {
    expect(castDetailsFromMmsProperties([
      { name: 'Email', value: 'a@b.c' },
      { name: 'Unknown', value: 'x' },
      { name: 'Phone', value: '' },
    ])).toEqual({});
  });

  it('trims values and keys', () => {
    expect(castDetailsFromMmsProperties([{ name: ' Full Name ', value: '  Donna Reed ' }]))
      .toEqual({ performer: 'Donna Reed' });
  });
});
