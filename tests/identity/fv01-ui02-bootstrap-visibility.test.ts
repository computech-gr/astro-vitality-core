import { describe, expect, it } from 'vitest';
import { parseFirstOperatorBootstrapStatus } from '@/infrastructure/first-operator-activation';

describe('FV-01-UI-02 bootstrap state fail-closed parsing', () => {
  it('accepts a complete new-install state', () => {
    expect(parseFirstOperatorBootstrapStatus({operator_exists:false, bootstrap_armed:true, bootstrap_consumed:false})).toEqual({operatorExists:false,bootstrapArmed:true,bootstrapConsumed:false});
  });
  it('does not treat incomplete or invalid responses as new deployments', () => {
    expect(parseFirstOperatorBootstrapStatus({operator_exists:false})).toBeNull();
    expect(parseFirstOperatorBootstrapStatus(null)).toBeNull();
  });
  it('preserves already-provisioned state', () => {
    expect(parseFirstOperatorBootstrapStatus({operator_exists:true, bootstrap_armed:false, bootstrap_consumed:true})?.operatorExists).toBe(true);
  });
});
