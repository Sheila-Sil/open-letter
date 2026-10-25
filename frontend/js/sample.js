// The example letter: drawn fresh each time so its dates are always a few weeks from today,
// plus the explanation and reply the app shows for it. No AI or internet needed.
// "Lakeview County" is made up; 555 phone numbers and .example websites are reserved for samples.

import { formatDate } from './i18n.js';

const DAY = 24 * 60 * 60 * 1000;

export function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function sampleDates() {
  const today = todayUTC();
  const notice = new Date(today - 3 * DAY);
  const deadline = new Date(+today + 21 * DAY);
  const coverageEnds = new Date(+deadline + 15 * DAY);
  return { notice, deadline, coverageEnds };
}

const englishDate = (d) => new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(d);
const isoDate = (d) => d.toISOString().slice(0, 10);

// Exact sentences from the letter. The sample explanation quotes them, just like a real one would.
function letterQuotes() {
  const { deadline, coverageEnds } = sampleDates();
  return {
    deadline: `Your renewal must be received by ${englishDate(deadline)}.`,
    coverageEnds: `your health coverage will end on ${englishDate(coverageEnds)}`,
    form: 'The completed renewal form (enclosed, page 2)',
    income: 'Proof of income for the last 30 days, such as pay stubs or a letter from your employer',
    send: 'Online at benefits.lakeview.example/renew, by mail to the address above, or in person at our office',
    interpreters: 'We offer free interpreters in your language.',
    hearing: 'You have the right to ask for a fair hearing if you disagree with any decision.',
  };
}

export function drawSampleLetter() {
  const { notice } = sampleDates();
  const q = letterQuotes();
  const canvas = document.createElement('canvas');
  canvas.width = 1275;
  canvas.height = 1650;
  const ctx = canvas.getContext('2d');
  const sans = 'Arial, "Liberation Sans", "DejaVu Sans", Helvetica, sans-serif';
  const left = 100;
  const width = 1075;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'alphabetic';

  const text = (str, x, y, size, { bold = false, color = '#111' } = {}) => {
    ctx.font = `${bold ? '700 ' : ''}${size}px ${sans}`;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  };

  const paragraph = (str, y, size = 23, opts = {}) => {
    ctx.font = `${opts.bold ? '700 ' : ''}${size}px ${sans}`;
    const lineHeight = Math.round(size * 1.55);
    let line = '';
    for (const word of str.split(' ')) {
      const attempt = line ? `${line} ${word}` : word;
      if (ctx.measureText(attempt).width > width - (opts.indent || 0) && line) {
        text(line, left + (opts.indent || 0), y, size, opts);
        y += lineHeight;
        line = word;
      } else {
        line = attempt;
      }
    }
    text(line, left + (opts.indent || 0), y, size, opts);
    return y + lineHeight + (opts.gap ?? 14);
  };

  // Letterhead
  text('LAKEVIEW COUNTY', left, 110, 40, { bold: true, color: '#1d2b4f' });
  text('Health Coverage Services', left, 152, 28, { color: '#1d2b4f' });
  text('1200 Civic Center Drive, Lakeview, ST 00000', left, 188, 20, { color: '#444' });
  ctx.strokeStyle = '#1d2b4f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left, 215);
  ctx.lineTo(left + width, 215);
  ctx.stroke();

  ctx.strokeStyle = '#b42318';
  ctx.lineWidth = 3;
  ctx.strokeRect(865, 72, 310, 54);
  text('SAMPLE · NOT REAL MAIL', 885, 108, 22, { bold: true, color: '#b42318' });

  // Notice details (the private numbers here are fake, but formatted like real ones)
  text(`Notice date: ${englishDate(notice)}`, left, 270, 22);
  text('Case number: 4417-2209-35', 700, 270, 22);
  text('Member ID: 9081 4472 1150', left, 308, 22);
  text('SSN: XXX-XX-4821', 700, 308, 22);

  text('MARIA GARCIA', left, 390, 22);
  text('45 OAK STREET APT 3', left, 422, 22);
  text('LAKEVIEW ST 00000', left, 454, 22);

  let y = 535;
  y = paragraph('ACTION REQUIRED: Renew your Medicaid health coverage', y, 32, { bold: true, gap: 18 });
  y = paragraph('Every year we must check if you still qualify for Medicaid. We could not confirm your household income using our records.', y);
  y = paragraph(q.deadline, y, 23, { bold: true });
  y = paragraph(`If we do not receive your renewal form and proof of income by this date, ${q.coverageEnds}.`, y);
  y = paragraph('What you need to send:', y, 23, { bold: true, gap: 4 });
  y = paragraph(`•  ${q.form}`, y, 23, { gap: 4, indent: 20 });
  y = paragraph(`•  ${q.income}`, y, 23, { indent: 20 });
  y = paragraph('How to send it:', y, 23, { bold: true, gap: 4 });
  y = paragraph(`${q.send}, Monday to Friday, 8:00 a.m. to 5:00 p.m.`, y);
  y = paragraph(`Questions? Call us at 1-800-555-0142 (TTY 711). ${q.interpreters}`, y);
  paragraph(`${q.hearing} See page 3.`, y);

  text('LCHCS-REN-01 (Rev. 2026)', left, 1590, 18, { color: '#666' });
  text('Page 1 of 3', 1060, 1590, 18, { color: '#666' });
  return canvas;
}

// Text for the sample explanation, per language. {D} = deadline, {E} = date coverage ends.
const SAMPLE_TEXT = {
  en: {
    type: 'Medicaid renewal notice',
    summary: 'Your health coverage (Medicaid) will end unless you renew it. The county needs a form and proof of how much money your household earns.',
    due: 'Renewal form and proof of income',
    actions: [
      'Fill out the renewal form. It is page 2 of this letter.',
      'Get proof of your income from the last 30 days, like pay stubs or a letter from your boss.',
      'Send both before {D}: online, by mail, or in person.',
      'Keep a copy of everything you send.',
    ],
    hours: 'Monday to Friday, 8 a.m. to 5 p.m.',
    facts: [
      ['If they don’t get your papers in time, your coverage ends on {E}.', ''],
      ['You can ask for a free interpreter when you call.', ''],
      ['If you disagree with their decision, you can ask for a fair hearing (a meeting where someone reviews your case).', ''],
    ],
  },
  es: {
    type: 'Aviso de renovación de Medicaid',
    summary: 'Su seguro médico (Medicaid) terminará si no lo renueva. El condado necesita un formulario y una prueba de cuánto dinero gana su hogar.',
    due: 'Formulario de renovación y prueba de ingresos',
    actions: [
      'Llene el formulario de renovación. Es la página 2 de esta carta.',
      'Consiga prueba de sus ingresos de los últimos 30 días, como talones de pago o una carta de su jefe.',
      'Envíe las dos cosas antes del {D}: por internet, por correo o en persona.',
      'Guarde una copia de todo lo que envíe.',
    ],
    hours: 'De lunes a viernes, de 8 a. m. a 5 p. m.',
    facts: [
      ['Si no reciben sus papeles a tiempo, su seguro termina el {E}.', 'su seguro médico terminará el {E}'],
      ['Puede pedir un intérprete gratis cuando llame.', 'Ofrecemos intérpretes gratis en su idioma.'],
      ['Si no está de acuerdo con una decisión, puede pedir una audiencia imparcial (una reunión donde alguien revisa su caso).', 'Usted tiene derecho a pedir una audiencia imparcial si no está de acuerdo con cualquier decisión.'],
    ],
  },
  zh: {
    type: 'Medicaid 续保通知',
    summary: '如果不续保，您的医疗保险（Medicaid）将会终止。县政府需要一份表格，以及您家庭收入的证明。',
    due: '续保表格和收入证明',
    actions: [
      '填写续保表格，就是这封信的第 2 页。',
      '准备最近 30 天的收入证明，例如工资单或老板写的信。',
      '在{D}之前寄出这两样东西：可以网上提交、邮寄或亲自送去。',
      '把寄出的所有文件都留一份副本。',
    ],
    hours: '周一至周五，上午 8 点至下午 5 点',
    facts: [
      ['如果他们没有按时收到您的文件，您的医疗保险将在{E}终止。', '您的医疗保险将在{E}终止'],
      ['打电话时可以要求免费口译员。', '我们提供您的语言的免费口译服务。'],
      ['如果您不同意他们的决定，可以申请公平听证会（有人重新审查您的案子）。', '如果您不同意任何决定，您有权要求公平听证会。'],
    ],
  },
  vi: {
    type: 'Thông báo gia hạn Medicaid',
    summary: 'Bảo hiểm y tế (Medicaid) của bạn sẽ chấm dứt nếu bạn không gia hạn. Quận cần một mẫu đơn và giấy tờ chứng minh thu nhập của gia đình bạn.',
    due: 'Mẫu đơn gia hạn và giấy tờ chứng minh thu nhập',
    actions: [
      'Điền mẫu đơn gia hạn. Đó là trang 2 của lá thư này.',
      'Chuẩn bị giấy tờ chứng minh thu nhập trong 30 ngày qua, như phiếu lương hoặc thư của chủ.',
      'Gửi cả hai trước ngày {D}: trên mạng, qua bưu điện, hoặc nộp trực tiếp.',
      'Giữ một bản sao của mọi thứ bạn gửi.',
    ],
    hours: 'Thứ Hai đến Thứ Sáu, 8 giờ sáng đến 5 giờ chiều',
    facts: [
      ['Nếu họ không nhận được giấy tờ kịp lúc, bảo hiểm của bạn sẽ chấm dứt vào ngày {E}.', 'bảo hiểm y tế của bạn sẽ chấm dứt vào ngày {E}'],
      ['Bạn có thể xin thông dịch viên miễn phí khi gọi điện.', 'Chúng tôi có thông dịch viên miễn phí bằng ngôn ngữ của bạn.'],
      ['Nếu không đồng ý với quyết định, bạn có thể xin một buổi điều trần công bằng (một buổi họp để xem xét lại hồ sơ).', 'Bạn có quyền yêu cầu điều trần công bằng nếu bạn không đồng ý với bất kỳ quyết định nào.'],
    ],
  },
  ar: {
    type: 'إشعار تجديد Medicaid',
    summary: 'سينتهي تأمينك الصحي (Medicaid) إذا لم تجدده. تحتاج المقاطعة إلى استمارة وإثبات لدخل أسرتك.',
    due: 'استمارة التجديد وإثبات الدخل',
    actions: [
      'املأ استمارة التجديد. إنها الصفحة 2 من هذه الرسالة.',
      'أحضر إثباتًا لدخلك خلال آخر 30 يومًا، مثل قسائم الراتب أو رسالة من صاحب العمل.',
      'أرسل الاثنين قبل {D}: عبر الإنترنت أو بالبريد أو شخصيًا.',
      'احتفظ بنسخة من كل ما ترسله.',
    ],
    hours: 'من الاثنين إلى الجمعة، من 8 صباحًا إلى 5 مساءً',
    facts: [
      ['إذا لم تصلهم أوراقك في الوقت المحدد، سينتهي تأمينك في {E}.', 'سينتهي تأمينك الصحي في {E}'],
      ['يمكنك طلب مترجم مجاني عندما تتصل.', 'نوفر مترجمين مجانًا بلغتك.'],
      ['إذا لم توافق على قرارهم، يمكنك طلب جلسة استماع عادلة (اجتماع يراجع فيه شخص ما حالتك).', 'لديك الحق في طلب جلسة استماع عادلة إذا لم توافق على أي قرار.'],
    ],
  },
};

function fill(str, dates) {
  return str.replace('{D}', formatDate(dates.deadline)).replace('{E}', formatDate(dates.coverageEnds));
}

// Same shape as the server's answer (see backend/schemas.py).
export function sampleResult(lang) {
  const s = SAMPLE_TEXT[lang] || SAMPLE_TEXT.en;
  const dates = sampleDates();
  const q = letterQuotes();
  const actionQuotes = [q.form, q.income, q.send, null];
  const factQuotes = [q.coverageEnds, q.interpreters, q.hearing];
  return {
    status: 'ok',
    document_type: s.type,
    sender: 'Lakeview County Health Coverage Services',
    summary: s.summary,
    urgency: 'high',
    deadline: { date: isoDate(dates.deadline), what_is_due: s.due, quote: q.deadline },
    actions: s.actions.map((step, i) => ({ step: fill(step, dates), quote: actionQuotes[i] })),
    contacts: [{
      name: 'Health Coverage Services',
      phone: '1-800-555-0142',
      website: 'https://benefits.lakeview.example/renew',
      hours: s.hours,
    }],
    key_facts: s.facts.map(([fact, translation], i) => ({
      fact: fill(fact, dates),
      quote: factQuotes[i],
      quote_translation: fill(translation, dates),
    })),
    scam_check: { possible_scam: false, reasons: [] },
    uncertain: [],
    confidence: 'high',
    reply_needed: false,
  };
}

const REPLY_EN = `Dear Lakeview County Health Coverage Services,

I received your Medicaid renewal notice dated {N}. I am gathering my proof of income, but I need more time to get my pay stubs from my employer.

Could you please give me more time to send my renewal form and documents? Please let me know the new date.

My case number is [Your case number].

Thank you for your help.

Sincerely,
[Your full name]
[Your phone number]
[Today's date]`;

const REPLY_TEXT = {
  en: {
    translated: '',
    fill: ['Your full name, as it appears on the letter', 'The case number on the letter (we hid it to protect your privacy)', 'A phone number where they can reach you', 'Today’s date'],
    tips: ['Send this before {D}, even while you ask for more time.', 'Keep a copy of this letter.', 'You can also call 1-800-555-0142.'],
  },
  es: {
    translated: `Estimada oficina de Lakeview County Health Coverage Services:

Recibí su aviso de renovación de Medicaid con fecha del {N}. Estoy reuniendo mi prueba de ingresos, pero necesito más tiempo para obtener mis talones de pago de mi empleador.

¿Podrían darme más tiempo para enviar mi formulario de renovación y mis documentos? Por favor, díganme cuál es la nueva fecha.

Mi número de caso es [Your case number].

Gracias por su ayuda.

Atentamente,
[Your full name]
[Your phone number]
[Today's date]`,
    fill: ['Su nombre completo, como aparece en la carta', 'El número de caso de la carta (lo ocultamos para proteger su privacidad)', 'Un número de teléfono donde puedan llamarle', 'La fecha de hoy'],
    tips: ['Envíela antes del {D}, aunque esté pidiendo más tiempo.', 'Guarde una copia de esta carta.', 'También puede llamar al 1-800-555-0142.'],
  },
  zh: {
    translated: `致 Lakeview County Health Coverage Services：

我收到了你们日期为{N}的 Medicaid 续保通知。我正在准备收入证明，但需要更多时间向雇主索取工资单。

能否请你们给我更多时间寄送续保表格和文件？请告诉我新的截止日期。

我的案件号码是 [Your case number]。

谢谢你们的帮助。

此致
[Your full name]
[Your phone number]
[Today's date]`,
    fill: ['您的全名，与信上写的一样', '信上的案件号码（为了保护您的隐私，我们把它遮住了）', '可以联系到您的电话号码', '今天的日期'],
    tips: ['即使在申请延期，也请在{D}之前寄出这封信。', '把这封信留一份副本。', '您也可以打电话给 1-800-555-0142。'],
  },
  vi: {
    translated: `Kính gửi Lakeview County Health Coverage Services,

Tôi đã nhận được thông báo gia hạn Medicaid ghi ngày {N}. Tôi đang chuẩn bị giấy tờ chứng minh thu nhập, nhưng tôi cần thêm thời gian để lấy phiếu lương từ chủ.

Xin quý văn phòng cho tôi thêm thời gian để gửi mẫu đơn gia hạn và giấy tờ. Xin cho tôi biết hạn chót mới.

Số hồ sơ của tôi là [Your case number].

Cảm ơn sự giúp đỡ của quý vị.

Trân trọng,
[Your full name]
[Your phone number]
[Today's date]`,
    fill: ['Họ tên đầy đủ của bạn, giống như trong thư', 'Số hồ sơ trong thư (chúng tôi đã che để bảo vệ quyền riêng tư của bạn)', 'Số điện thoại để họ liên lạc với bạn', 'Ngày hôm nay'],
    tips: ['Hãy gửi thư này trước ngày {D}, ngay cả khi bạn đang xin thêm thời gian.', 'Giữ một bản sao của lá thư này.', 'Bạn cũng có thể gọi 1-800-555-0142.'],
  },
  ar: {
    translated: `إلى Lakeview County Health Coverage Services،

استلمت إشعار تجديد Medicaid المؤرخ في {N}. أنا أجمع إثبات دخلي، لكنني أحتاج إلى وقت أطول للحصول على قسائم راتبي من صاحب العمل.

هل يمكنكم من فضلكم منحي وقتًا إضافيًا لإرسال استمارة التجديد والمستندات؟ أرجو إخباري بالموعد الجديد.

رقم قضيتي هو [Your case number].

شكرًا لمساعدتكم.

مع التحية،
[Your full name]
[Your phone number]
[Today's date]`,
    fill: ['اسمك الكامل كما هو مكتوب في الرسالة', 'رقم القضية المكتوب في الرسالة (أخفيناه لحماية خصوصيتك)', 'رقم هاتف يمكنهم الاتصال بك عليه', 'تاريخ اليوم'],
    tips: ['أرسل هذه الرسالة قبل {D}، حتى وأنت تطلب وقتًا إضافيًا.', 'احتفظ بنسخة من هذه الرسالة.', 'يمكنك أيضًا الاتصال بالرقم 1-800-555-0142.'],
  },
};

export function sampleReply(lang) {
  const r = REPLY_TEXT[lang] || REPLY_TEXT.en;
  const dates = sampleDates();
  const placeholders = ['[Your full name]', '[Your case number]', '[Your phone number]', "[Today's date]"];
  return {
    subject: 'Request for more time: Medicaid renewal',
    letter_to_send: REPLY_EN.replace('{N}', englishDate(dates.notice)),
    letter_translated: r.translated.replace('{N}', formatDate(dates.notice)),
    fill_in: placeholders.map((placeholder, i) => ({ placeholder, explanation: r.fill[i] })),
    tips: r.tips.map((tip) => fill(tip, dates)),
  };
}
