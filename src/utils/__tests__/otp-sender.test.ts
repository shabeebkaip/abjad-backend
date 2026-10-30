import { otpEmailCopy } from '../otp-sender.util';

describe('otpEmailCopy (B6)', () => {
  it('reset gets a reset-specific subject and a "not you" line', () => {
    const c = otpEmailCopy('reset');
    expect(c.subject).toBe('Reset your Abjad password');
    expect(c.intro).not.toMatch(/login or registration/);
    expect(c.footer).toMatch(/didn't request this/);
  });

  it.each(['login', 'signup'] as const)('%s keeps the verification wording', (p) => {
    const c = otpEmailCopy(p);
    expect(c.subject).toBe('Your Abjad Verification Code');
    expect(c.footer).toBe('');
  });
});
