import { describe, expect, it } from 'vitest';

import { VERSION } from '../version';

describe('VERSION', () => {
  it('is a non-empty string', () => {
    expect(VERSION).toBeTypeOf('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('looks like a semver version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
