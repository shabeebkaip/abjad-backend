import { buildOtpEmail } from '../otp-sender.util';
import { config } from '../../config';

describe('buildOtpEmail (B6)', () => {
  it('each purpose has its own subject, Arabic first then English', () => {
    const subjects = (['signup', 'login', 'reset'] as const).map((p) => buildOtpEmail('123456', p).subject);
    expect(new Set(subjects).size).toBe(3);
    for (const s of subjects) {
      expect(s).toMatch(/[؀-ۿ]/);
      expect(s.indexOf('|')).toBeGreaterThan(0);
    }
    expect(buildOtpEmail('123456', 'reset').subject).toContain('Reset your Abjad password');
  });

  it('reset body says a reset was requested and carries the not-you line in both languages', () => {
    const { html, text } = buildOtpEmail('654321', 'reset');
    expect(text).toContain("If you didn't request this, ignore this email. Your password is unchanged.");
    expect(text).toContain('إذا لم تطلب ذلك');
    expect(html).not.toMatch(/login or registration/);
    expect(html.indexOf('dir="rtl"')).toBeLessThan(html.indexOf('dir="ltr"'));
  });

  it('includes the code and expiry minutes; login/signup have no not-you line', () => {
    for (const p of ['login', 'signup'] as const) {
      const { html, text } = buildOtpEmail('654321', p);
      expect(html).toContain('654321');
      expect(text).toContain(`${config.otp.expiryMinutes} minutes`);
      expect(text).not.toMatch(/didn't request/);
    }
  });
});
