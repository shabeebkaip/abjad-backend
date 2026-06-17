import type {
  IPricingHero,
  IPricingTrustStrip,
  IPricingWhyReason,
  IPricingTestimonial,
  IPricingFaqItem,
  IPricingFooterLegal,
  PricingPaymentMethod,
} from '../models/pricing-page-content.model';

// Default copy for /pricing per locale. Used by:
//   - the seed script to populate a fresh environment
//   - the pricing-page service as a fallback when a locale row is missing
//   - tests
//
// The copy here is the v1 sign-off; marketing edits via /admin/pricing-page
// override these for production. Keep both locales feature-complete: the
// public page will mix-and-match if a string is missing, which looks worse
// than visiting the page in either pure locale.

interface LocaleDefaults {
  hero: IPricingHero;
  trustStrip: IPricingTrustStrip;
  whyAbjad: IPricingWhyReason[];
  testimonials: IPricingTestimonial[];
  faq: IPricingFaqItem[];
  paymentMethods: PricingPaymentMethod[];
  footerLegal: IPricingFooterLegal;
}

const SHARED_PAYMENT_METHODS: PricingPaymentMethod[] = [
  'mada', 'apple_pay', 'stcpay', 'moyasar_card', 'bank_transfer',
];

const EN: LocaleDefaults = {
  hero: {
    eyebrow: '★ Trusted by Saudi schools',
    headline: 'The fastest way to hire qualified teachers in Saudi Arabia.',
    subheadline: 'Post jobs, screen candidates with AI-powered matching, and onboard your next hire in days — not months.',
    primaryCtaText: 'Start 5-day free trial',
    primaryCtaHref: '/register?role=school',
    secondaryCtaText: 'Book a demo',
    secondaryCtaHref: '/contact?intent=demo',
    reassurance: 'No credit card required · Cancel anytime · Mada · Apple Pay · STC Pay',
  },
  trustStrip: {
    logos: [],
  },
  whyAbjad: [
    {
      icon: 'Clock',
      title: 'Hire in days, not months',
      body: 'Average time-to-hire on Abjad is under two weeks — vs. industry average of 12+ weeks via brokers and classifieds.',
    },
    {
      icon: 'Sparkles',
      title: 'AI-powered Best Match',
      body: 'Our matching engine ranks candidates by subject, grade level, experience, location, language, and qualifications — so you see your strongest fits first.',
    },
    {
      icon: 'ShieldCheck',
      title: 'Built for Saudi Arabia',
      body: 'Bilingual UX, ZATCA-compliant invoicing, Mada and STC Pay support, and aligned with Vision 2030 education reforms.',
    },
  ],
  testimonials: [],
  faq: [
    {
      q: 'Is VAT included in the price?',
      a: 'All prices on this page exclude 15% Saudi VAT. VAT is calculated and itemised on every invoice, in line with ZATCA requirements.',
    },
    {
      q: 'What payment methods do you accept?',
      a: 'Mada, Apple Pay, STC Pay, Visa/Mastercard (via Moyasar), and direct bank transfer. Larger schools typically pay annually via bank transfer.',
    },
    {
      q: 'Can I cancel my subscription?',
      a: 'Yes. You can cancel anytime from your school dashboard. Your plan stays active until the end of the current billing period — no further charges.',
    },
    {
      q: 'Do you offer refunds?',
      a: 'If you cancel within the first 7 days after your trial converts to a paid plan, we issue a full refund. After that, cancellation is effective at the end of the current period.',
    },
    {
      q: 'How does the 5-day trial work?',
      a: 'Start a trial with no card required. You get full access to post one job, view up to 3 candidate CVs per day, and shortlist as normal. Convert anytime to keep your data — or let it expire with no charge.',
    },
    {
      q: 'Do you support multiple campuses?',
      a: 'Yes. Each campus can be configured under a single school account, with team seats shared across them. For larger groups (5+ campuses), our enterprise sales team will tailor a plan to your structure.',
    },
    {
      q: 'Are my candidate records private?',
      a: 'Yes. Your candidate pipeline, interview notes, and shortlist data are visible only to your school team — never to other schools or to teachers.',
    },
  ],
  paymentMethods: SHARED_PAYMENT_METHODS,
  footerLegal: {
    vatNumber: '',
    crNumber: '',
    address: 'Riyadh, Saudi Arabia',
  },
};

const AR: LocaleDefaults = {
  hero: {
    eyebrow: '★ تثق بنا المدارس السعودية',
    headline: 'الطريقة الأسرع لتوظيف معلمين مؤهلين في المملكة العربية السعودية.',
    subheadline: 'انشر الوظائف، رشّح المرشحين بالذكاء الاصطناعي، ووظّف معلمك القادم في أيام لا أشهر.',
    primaryCtaText: 'ابدأ تجربة مجانية لمدة 5 أيام',
    primaryCtaHref: '/register?role=school',
    secondaryCtaText: 'احجز عرضاً توضيحياً',
    secondaryCtaHref: '/contact?intent=demo',
    reassurance: 'بدون بطاقة ائتمان · ألغ في أي وقت · مدى · آبل باي · STC Pay',
  },
  trustStrip: {
    logos: [],
  },
  whyAbjad: [
    {
      icon: 'Clock',
      title: 'وظّف في أيام، لا أشهر',
      body: 'متوسط وقت التوظيف على منصة أبجد أقل من أسبوعين — مقارنة بمعدل الصناعة الذي يتجاوز 12 أسبوعاً عبر الوسطاء والإعلانات التقليدية.',
    },
    {
      icon: 'Sparkles',
      title: 'مطابقة ذكية بالذكاء الاصطناعي',
      body: 'محرّك المطابقة لدينا يرتّب المرشحين حسب المادة والمرحلة والخبرة والموقع واللغة والمؤهلات — لتظهر لك الأنسب أولاً.',
    },
    {
      icon: 'ShieldCheck',
      title: 'مصمّم للمملكة العربية السعودية',
      body: 'تجربة ثنائية اللغة، فواتير متوافقة مع هيئة الزكاة والضريبة، دعم مدى و STC Pay، ومتوافق مع إصلاحات التعليم في رؤية 2030.',
    },
  ],
  testimonials: [],
  faq: [
    {
      q: 'هل ضريبة القيمة المضافة مشمولة في السعر؟',
      a: 'جميع الأسعار في هذه الصفحة لا تشمل ضريبة القيمة المضافة بنسبة 15%. يتم احتساب الضريبة وإدراجها كبند منفصل في كل فاتورة، وفقاً لمتطلبات هيئة الزكاة والضريبة.',
    },
    {
      q: 'ما طرق الدفع المتاحة؟',
      a: 'مدى، آبل باي، STC Pay، فيزا/ماستر كارد (عبر مُيسّر)، والتحويل البنكي المباشر. المدارس الكبرى عادةً ما تدفع سنوياً عبر التحويل البنكي.',
    },
    {
      q: 'هل يمكنني إلغاء الاشتراك؟',
      a: 'نعم. يمكنك الإلغاء في أي وقت من لوحة تحكم المدرسة. تبقى باقتك فعّالة حتى نهاية فترة الفوترة الحالية — دون أي رسوم إضافية.',
    },
    {
      q: 'هل تقدّمون استرداداً للمدفوعات؟',
      a: 'إذا ألغيتَ خلال أول 7 أيام من تحوّل التجربة إلى باقة مدفوعة، نُصدر استرداداً كاملاً. بعد ذلك، يصبح الإلغاء سارياً في نهاية الفترة الحالية.',
    },
    {
      q: 'كيف تعمل تجربة الخمسة أيام؟',
      a: 'ابدأ التجربة بدون بطاقة ائتمان. تحصل على وصول كامل لنشر وظيفة واحدة، وعرض ما يصل إلى 3 سير ذاتية في اليوم، وعمل قائمة مختصرة بشكل طبيعي. حوّل في أي وقت للاحتفاظ ببياناتك — أو دع التجربة تنتهي دون أي رسوم.',
    },
    {
      q: 'هل تدعمون عدّة فروع؟',
      a: 'نعم. يمكن تهيئة كل فرع تحت حساب مدرسة واحد، مع مشاركة مقاعد الفريق فيما بينها. للمجموعات الكبرى (5 فروع أو أكثر)، فريق المبيعات لدينا يصمّم باقة مخصّصة لهيكلكم.',
    },
    {
      q: 'هل سجلات المرشحين خاصة؟',
      a: 'نعم. مسار المرشحين، ملاحظات المقابلات، وبيانات القائمة المختصرة تظهر فقط لفريق مدرستك — أبداً لا للمدارس الأخرى أو للمعلمين.',
    },
  ],
  paymentMethods: SHARED_PAYMENT_METHODS,
  footerLegal: {
    vatNumber: '',
    crNumber: '',
    address: 'الرياض، المملكة العربية السعودية',
  },
};

export const PRICING_PAGE_DEFAULTS: Record<'en' | 'ar', LocaleDefaults> = { en: EN, ar: AR };
