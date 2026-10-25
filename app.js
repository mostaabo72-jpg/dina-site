 const sb = supabase.createClient(CFG.url, CFG.anonKey);
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const egp = n => new Intl.NumberFormat('ar-EG', {style:'currency', currency:'EGP'}).format(n);
const dt = d => new Date(d).toLocaleDateString('ar-EG', {year:'numeric', month:'long', day:'numeric'});
const ST = {awaiting_review:'في انتظار المراجعة', confirmed:'تم تأكيد الدفع — بانتظار كود التفعيل', rejected:'مرفوض', cancelled:'ملغى', activated:'مفعّل'};
const SETTINGS = {instapay_name:'اسم صاحب حساب InstaPay', instapay_handle:'عنوان/رقم InstaPay للتحويل', support_contact:'وسيلة التواصل مع الإدارة', require_receipt:'هل صورة الإيصال مطلوبة؟ (true/false)', terms:'شروط الاستخدام والاشتراك', privacy:'سياسة الخصوصية', refund_policy:'سياسة الاسترداد', faq:'الأسئلة الشائعة'};
let me = null;
const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; setTimeout(() => t.hidden = true, 4000); };
const settings = async () => Object.fromEntries(((await sb.from('app_settings').select('key,value')).data || []).map(r => [r.key, r.value]));
const needLogin = () => '<p>يجب <a href="#/login">تسجيل الدخول</a> أولًا.</p>';

async function loadMe() {
  const {data:{session}} = await sb.auth.getSession();
  me = session ? (await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()).data : null;
  $('#nav').innerHTML = '<a href="#/lessons">الدروس</a><a href="#/live">الحصص المباشرة</a><a href="#/how">طريقة الاشتراك</a><a href="#/policies">السياسات</a>' + (me
    ? '<a href="#/account">حسابي</a>' + (me.role === 'admin' ? '<a href="#/admin/orders">الإدارة</a>' : '') + '<button data-act="logout">خروج</button>'
    : '<a href="#/login">دخول / حساب جديد</a>');
}

async function vHome() {
  const {data:plans} = await sb.from('plans').select('*').eq('is_active', true).order('price_egp');
  return `<section class="hero"><h1>منصة الأستاذة دينا مصطفى التعليمية</h1>
  <p>اشتراكات واضحة بالجنيه المصري، والدفع بتحويل InstaPay يدويًا ثم مراجعة وتفعيل من الإدارة.</p>
  <a class="btn" href="#/how">كيف أشترك؟</a></section><h2>الباقات</h2><div class="grid">` +
  ((plans || []).map(p => `<div class="card"><h3>${esc(p.name)}</h3><div class="price">${egp(p.price_egp)}</div>
  <p>المدة: ${p.duration_days} يومًا من تاريخ التفعيل</p><p class="muted">${esc(p.description)}</p>
  <details><summary>شروط الباقة</summary><p class="pre">${esc(p.terms) || 'لم تُحدد شروط إضافية.'}</p></details>
  <button class="btn" data-act="buy" data-id="${p.id}">اشترك</button></div>`).join('') || '<p class="muted">لم تنشر الإدارة باقات بعد.</p>') + '</div>';
}

const vHow = () => `<h1>طريقة الاشتراك</h1><div class="card"><ol>
<li>أنشئ حسابًا أو سجّل الدخول، ثم اختر الباقة وراجع سعرها ومدتها وشروطها.</li>
<li>يُنشأ لك طلب برقم محدد، وتظهر بيانات التحويل التي حددتها الإدارة.</li>
<li>حوّل المبلغ عبر InstaPay من تطبيقك مباشرة، ثم اكتب مرجع التحويل وأرفق صورة الإيصال.</li>
<li>تصبح حالة الطلب «في انتظار المراجعة». تتحقق الإدارة من وصول المبلغ فعليًا، ولا تعتمد على الصورة وحدها.</li>
<li>بعد تأكيد الدفع تصلك الإدارة بكود تفعيل خاص بحسابك وحده ويُستخدم مرة واحدة.</li>
<li>أدخل الكود في «حسابي» لتبدأ مدة الاشتراك من لحظة التفعيل، لا قبلها.</li></ol>
<h3>التجديد وانتهاء الاشتراك</h3><p>عند التجديد تُضاف المدة الجديدة بعد نهاية اشتراكك الحالي دون خسارة أي أيام. وعند الانتهاء يتوقف الوصول للمحتوى المدفوع فقط، ويبقى حسابك وتقدمك الدراسي كما هما.</p>
<p class="err">لا تشارك أبدًا كلمة مرور بنكية أو رقم بطاقة أو رمز OTP مع أي أحد، ولا نطلبها منك.</p></div>`;

async function vPol() {
  const S = await settings();
  return '<h1>الشروط والسياسات</h1>' + [['terms','شروط الاستخدام'],['privacy','سياسة الخصوصية'],['refund_policy','سياسة الاسترداد'],['faq','الأسئلة الشائعة'],['support_contact','التواصل مع الإدارة']]
    .map(([k,t]) => `<div class="card"><h3>${t}</h3><p class="pre">${esc(S[k]) || '<span class="muted">لم تعتمد الإدارة هذا القسم بعد.</span>'}</p></div>`).join('');
}

function vAuth(a) {
  if (a === 'recover') return `<h1>كلمة مرور جديدة</h1><form class="card" data-form="newpass"><label>كلمة المرور الجديدة (8 أحرف على الأقل)</label><input type="password" name="p" minlength="8" required><button class="btn">حفظ</button></form>`;
  return `<h1>الدخول</h1><div class="grid"><form class="card" data-form="login"><h3>تسجيل الدخول</h3>
  <label>البريد الإلكتروني</label><input type="email" name="e" required><label>كلمة المرور</label><input type="password" name="p" required><button class="btn">دخول</button>
  <details><summary>نسيت كلمة المرور</summary><button class="btn alt" type="button" data-act="reset">أرسل رابط الاستعادة للبريد أعلاه</button></details></form>
  <form class="card" data-form="signup"><h3>حساب جديد</h3><label>الاسم</label><input name="n" required maxlength="80">
  <label>البريد الإلكتروني</label><input type="email" name="e" required><label>كلمة المرور (8 أحرف على الأقل)</label><input type="password" name="p" minlength="8" required>
  <label><input type="checkbox" name="t" style="width:auto"> أنا معلم/معلمة وأرغب في الانضمام (يتطلب موافقة الإدارة)</label><button class="btn">إنشاء حساب</button></form></div>`;
}

async function vAcc() {
  if (!me) return needLogin();
  const [{data:orders}, {data:subs}] = await Promise.all([
    sb.from('orders').select('*').eq('user_id', me.id).order('created_at', {ascending:false}),
    sb.from('subscriptions').select('*').eq('user_id', me.id).eq('status', 'active').order('ends_at', {ascending:false}).limit(1)]);
  const s = subs && subs[0], live = s && new Date(s.starts_at) <= new Date() && new Date(s.ends_at) > new Date();
  return `<h1>حسابي</h1><div class="card"><h3>حالة الاشتراك</h3>` + (s
    ? `<p class="${live ? 'ok' : 'muted'}">${live ? 'فعّال' : 'غير فعّال حاليًا'} — من ${dt(s.starts_at)} إلى ${dt(s.ends_at)}</p>`
    : '<p class="muted">لا يوجد اشتراك. حسابك وتقدمك محفوظان دائمًا.</p>') + `</div>
  <form class="card" data-form="redeem"><h3>تفعيل كود</h3><input class="ltr" name="c" placeholder="XXXXX-XXXXX-XXXXX-XXXXX" required><button class="btn">تفعيل</button></form>
  <h2>طلباتي</h2>` + ((orders || []).map(o => `<div class="card"><b>طلب رقم ${o.order_no}</b> — ${esc(o.plan_name)} — ${egp(o.price_egp)}
  <p><span class="tag">${ST[o.status]}</span> ${o.review_note ? '— ' + esc(o.review_note) : ''}</p><a class="btn alt" href="#/order/${o.id}">التفاصيل</a></div>`).join('') || '<p class="muted">لا توجد طلبات.</p>');
}

async function vOrder(id) {
  if (!me) return needLogin();
  const [{data:o}, S] = await Promise.all([sb.from('orders').select('*').eq('id', id).maybeSingle(), settings()]);
  if (!o) return '<p>الطلب غير موجود.</p>';
  const need = S.require_receipt === 'true';
  return `<h1>طلب رقم ${o.order_no}</h1><div class="card"><p>الباقة: <b>${esc(o.plan_name)}</b></p><p>المبلغ: <span class="price">${egp(o.price_egp)}</span></p>
  <p>المدة: ${o.duration_days} يومًا تبدأ عند تفعيل الكود (لا تُخصم أثناء المراجعة).</p><p>الحالة: <span class="tag">${ST[o.status]}</span> ${o.review_note ? '— ' + esc(o.review_note) : ''}</p>
  <p class="muted">راجع <a href="#/policies">الشروط وسياسة الاسترداد</a> قبل الدفع.</p></div>` + (o.status === 'awaiting_review' ? `
  <div class="card"><h3>بيانات التحويل عبر InstaPay</h3>${S.instapay_handle ? `<p>حوّل <b>${egp(o.price_egp)}</b> إلى: <b class="ltr">${esc(S.instapay_handle)}</b> ${S.instapay_name ? '(' + esc(S.instapay_name) + ')' : ''}</p>` : '<p class="err">لم تضبط الإدارة بيانات التحويل بعد؛ لا تحوّل قبل ذلك.</p>'}
  <p class="muted">التحويل يدوي من تطبيقك. لا ندخل في أي بوابة دفع ولا نطلب بياناتك البنكية.</p></div>
  <form class="card" data-form="payinfo" data-id="${o.id}"><label>مرجع التحويل</label><input name="r" maxlength="64" value="${esc(o.transfer_reference)}" required>
  <label>صورة الإيصال ${need ? '(مطلوبة)' : '(اختيارية)'} — JPG/PNG/WebP حتى 5 ميجا</label><input type="file" name="f" accept="image/jpeg,image/png,image/webp" ${need && !o.receipt_path ? 'required' : ''}>
  ${o.receipt_path ? '<p class="ok">تم رفع إيصال سابقًا.</p>' : ''}<button class="btn">إرسال للمراجعة</button></form>` : '');
}

async function vAdmin(tab = 'orders') {
  if (!me || me.role !== 'admin') return '<p>غير مصرح.</p>';
  const tabs = [['orders','الطلبات'],['plans','الباقات'],['lessons','الدروس'],['live','الحصص'],['settings','الإعدادات'],['teachers','المعلمون'],['audit','السجل']];
  let h = '<h1>لوحة الإدارة</h1><div class="tabs">' + tabs.map(([k,t]) => `<a class="btn ${k === tab ? '' : 'alt'}" href="#/admin/${k}">${t}</a>`).join('') + '</div>';
  if (tab === 'orders') {
    const [{data:os, error:oe}, {data:cs}] = await Promise.all([sb.from('orders').select('*,profiles!orders_user_id_fkey(full_name,phone)').order('created_at', {ascending:false}).limit(100), sb.from('activation_codes').select('order_id,status')]);
    if (oe) return h + '<p class="err">تعذر تحميل الطلبات: ' + esc(oe.message) + '</p>';
    const cm = {}; (cs || []).forEach(c => { if (c.status !== 'revoked') cm[c.order_id] = c.status; });
    h += '<input id="q" placeholder="بحث بالاسم أو رقم الطلب…" oninput="document.querySelectorAll(\'.oc\').forEach(e=>e.hidden=!e.textContent.includes(this.value))">' +
      (os || []).map(o => `<div class="card oc"><b>#${o.order_no}</b> — ${esc(o.profiles?.full_name)} — ${esc(o.plan_name)} — ${egp(o.price_egp)} <span class="tag">${ST[o.status]}</span>
      <p class="muted">مرجع التحويل: ${esc(o.transfer_reference) || '—'} | ${dt(o.created_at)}</p><div class="row">
      ${o.receipt_path ? `<button class="btn alt" data-act="receipt" data-p="${esc(o.receipt_path)}">عرض الإيصال</button>` : ''}
      ${o.status === 'awaiting_review' ? `<button class="btn" data-act="approve" data-id="${o.id}">تأكيد وصول المبلغ</button><button class="btn bad" data-act="reject" data-id="${o.id}">رفض</button>` : ''}
      ${o.status === 'confirmed' && !cm[o.id] ? `<button class="btn" data-act="issue" data-id="${o.id}">إصدار كود</button>` : ''}
      ${cm[o.id] === 'unused' ? `<span class="tag">كود صادر غير مستخدم</span><button class="btn bad" data-act="revoke" data-id="${o.id}">إلغاء الكود</button>` : ''}</div></div>`).join('');
  } else if (tab === 'plans') {
    const {data:ps} = await sb.from('plans').select('*').order('created_at');
    h += `<form class="card" data-form="plan"><h3>باقة جديدة</h3><label>الاسم</label><input name="n" required><label>السعر (جنيه)</label><input type="number" name="p" min="0" step="0.01" required>
    <label>المدة (أيام)</label><input type="number" name="d" min="1" required><label>الوصف</label><input name="ds"><label>الشروط (تجديد/إلغاء/استرداد)</label><textarea name="t"></textarea><button class="btn">إضافة</button></form>` +
      (ps || []).map(p => `<div class="card"><b>${esc(p.name)}</b> — ${egp(p.price_egp)} — ${p.duration_days} يوم <span class="tag">${p.is_active ? 'منشورة' : 'مخفية'}</span>
      <button class="btn alt" data-act="toggleplan" data-id="${p.id}" data-v="${p.is_active}">${p.is_active ? 'إخفاء' : 'نشر'}</button></div>`).join('');
  } else if (tab === 'settings') {
    const S = await settings();
    h += '<form class="card" data-form="settings">' + Object.entries(SETTINGS).map(([k,l]) => `<label>${l}</label><textarea name="${k}" rows="${k.length > 9 ? 4 : 1}">${esc(S[k])}</textarea>`).join('') + '<button class="btn">حفظ</button></form>';
  } else if (tab === 'lessons') {
    const {data:ls} = await sb.from('lessons').select('id,title,program,is_free,published,iframe_url').order('created_at', {ascending:false});
    h += `<form class="card" data-form="lesson"><h3>درس جديد</h3><label>العنوان</label><input name="t" required maxlength="150">
    <label>البرنامج</label><select name="p"><option>القرآن الكريم</option><option>اللغة العربية</option><option>الإسلاميات</option></select>
    <label>ملخص قصير يراه الجميع (لا تضع فيه محتوى مدفوعًا)</label><input name="s" maxlength="200">
    <label>محتوى الدرس (للمشتركين فقط إن لم يكن مجانيًا)</label><textarea name="b" rows="8"></textarea>
    <label>رابط التطبيق التفاعلي (اختياري) — يجب أن يكون على موقع/نطاق منفصل عن المنصة، ويبدأ بـ https://</label><input type="url" name="u" maxlength="500" placeholder="https://...">
    <label><input type="checkbox" name="f" style="width:auto"> درس مجاني</label><label><input type="checkbox" name="pub" style="width:auto"> نشر الآن</label><button class="btn">إضافة</button></form>` +
      (ls || []).map(l => `<div class="card"><b>${esc(l.title)}</b> <span class="tag">${esc(l.program)}</span> <span class="tag">${l.is_free ? 'مجاني' : 'مدفوع'}</span> <span class="tag">${l.published ? 'منشور' : 'مسودة'}</span>${l.iframe_url ? ' <span class="tag">تطبيق تفاعلي</span>' : ''}
      <button class="btn alt" data-act="togglelesson" data-id="${l.id}" data-v="${l.published}">${l.published ? 'إلغاء النشر' : 'نشر'}</button></div>`).join('');
  } else if (tab === 'live') {
    const {data:ss} = await sb.from('live_sessions').select('*').order('starts_at', {ascending:false}).limit(100);
    h += `<form class="card" data-form="live"><h3>حصة جديدة (Google Meet)</h3>
    <label>العنوان</label><input name="t" required maxlength="150">
    <label>المادة</label><input name="s" maxlength="80">
    <label>الموعد (بتوقيت جهازك — يفضّل القاهرة)</label><input type="datetime-local" name="d" required>
    <label>المدة (دقيقة)</label><input type="number" name="m" value="30" min="10" max="180" required>
    <label>رابط Google Meet (يبدأ بـ https://meet.google.com/)</label><input type="url" name="u" required maxlength="300" placeholder="https://meet.google.com/abc-defg-hij">
    <label>بريد الطالب (اختياري: حصة فردية). اتركه فارغًا لحصة لكل المشتركين</label><input type="email" name="e">
    <label>ملاحظات للمشترك (اختياري)</label><textarea name="n" rows="2" maxlength="1000"></textarea>
    <label><input type="checkbox" name="pub" style="width:auto"> نشر الآن</label><button class="btn">إضافة</button></form>` +
      (ss || []).map(x => `<div class="card"><b>${esc(x.title)}</b> <span class="tag">${x.published ? 'منشورة' : 'مسودة'}</span>${x.student_id ? ' <span class="tag">حصة فردية</span>' : ''}
      <p class="muted">${esc(fmtCairo(x.starts_at))} — ${x.duration_min} دقيقة</p><div class="row">
      <button class="btn alt" data-act="togglelive" data-id="${x.id}" data-v="${x.published}">${x.published ? 'إلغاء النشر' : 'نشر'}</button>
      <button class="btn bad" data-act="deletelive" data-id="${x.id}">حذف</button></div></div>`).join('');
  } else if (tab === 'teachers') {
    const {data:ts} = await sb.from('profiles').select('*').neq('teacher_status', 'none');
    h += (ts || []).map(t => `<div class="card"><b>${esc(t.full_name)}</b> <span class="tag">${t.teacher_status}</span><div class="row">
    <button class="btn" data-act="teacher" data-id="${t.id}" data-s="approved">موافقة</button><button class="btn bad" data-act="teacher" data-id="${t.id}" data-s="rejected">رفض</button></div></div>`).join('') || '<p class="muted">لا طلبات.</p>';
  } else {
    const {data:ls} = await sb.from('audit_log').select('*').order('at', {ascending:false}).limit(100);
    h += (ls || []).map(l => `<div class="card"><b>${esc(l.action)}</b> — ${esc(l.subject)} — ${new Date(l.at).toLocaleString('ar-EG')} <span class="muted ltr">${esc(l.actor_id)}</span></div>`).join('');
  }
  return h;
}

const fmtCairo = d => new Date(d).toLocaleString('ar-EG', {timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit'});
const isMeet = u => /^https:\/\/meet\.google\.com\//.test(u || '');

async function vLive() {
  if (!me) return '<h1>الحصص المباشرة</h1><p>الحصص المباشرة لأصحاب الاشتراك الفعّال. <a href="#/login">سجّل الدخول</a> أولًا.</p>';
  const {data, error} = await sb.rpc('my_live_sessions');
  if (error) return '<p class="err">تعذر تحميل الحصص.</p>';
  const rows = data || [];
  if (!rows.length) return '<h1>الحصص المباشرة</h1><div class="card"><p>لا توجد حصص قادمة لك حاليًا.</p><p class="muted">الحصص المباشرة لأصحاب الاشتراك الفعّال، وتنسّق الإدارة مواعيدك. إن لم يكن لديك اشتراك فعّال فاطّلع على <a href="#/">الباقات</a>.</p></div>';
  return '<h1>الحصص المباشرة</h1><p class="muted">يظهر رابط الانضمام قبل الموعد بـ 15 دقيقة. حدّث الصفحة إن لم يظهر. المواعيد بتوقيت القاهرة. لا تشارك الرابط مع غيرك.</p>' + rows.map(s => `<div class="card"><h3>${esc(s.title)}</h3>
    ${s.subject ? '<span class="tag">' + esc(s.subject) + '</span> ' : ''}<p>🕒 ${esc(fmtCairo(s.starts_at))} — ${s.duration_min} دقيقة</p>
    ${s.notes ? '<p class="muted pre">' + esc(s.notes) + '</p>' : ''}
    ${s.meet_url && isMeet(s.meet_url) ? `<a class="btn" href="${esc(s.meet_url)}" target="_blank" rel="noopener noreferrer">انضم الآن</a>` : '<p class="muted">سيظهر رابط الانضمام قبل الموعد بـ 15 دقيقة.</p>'}</div>`).join('');
}

async function vLessons() {
  const {data, error} = await sb.rpc('lesson_catalog');
  if (error) return '<p class="err">تعذر تحميل الدروس.</p>';
  let done = new Set();
  if (me) done = new Set(((await sb.from('lesson_progress').select('lesson_id').eq('user_id', me.id)).data || []).map(r => r.lesson_id));
  const open = (data || []).filter(l => l.unlocked), n = open.filter(l => done.has(l.id)).length;
  return '<h1>الدروس</h1>' + (me
    ? `<div class="card"><b>تقدمك:</b> أكملت ${n} من ${open.length} درسًا متاحًا لك<progress value="${n}" max="${open.length || 1}" style="width:100%"></progress></div>`
    : '<p class="muted"><a href="#/login">سجّل الدخول</a> لحفظ تقدمك.</p>') + '<div class="grid">' +
    ((data || []).map(l => `<div class="card"><span class="tag">${esc(l.program)}</span> ${l.is_free ? '<span class="tag">مجاني</span>' : ''}<h3>${esc(l.title)}</h3><p class="muted">${esc(l.summary)}</p>` +
      (l.unlocked ? `<a class="btn" href="#/lesson/${l.id}">${done.has(l.id) ? '✓ ' : ''}فتح الدرس</a>` : '<p class="err">🔒 يتطلب اشتراكًا فعّالًا</p>' + (done.has(l.id) ? '<p class="ok">✓ أكملته سابقًا، وتقدمك محفوظ</p>' : '') + '<a class="btn alt" href="#/">عرض الباقات</a>') + '</div>').join('') || '<p class="muted">لم تُنشر دروس بعد.</p>') + '</div>';
}

const safeAppUrl = u => { try { const x = new URL(u); return (x.protocol === 'https:' || (x.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(x.hostname))) ? x : null; } catch { return null; } };
let appCtx = null, lastSave = 0;

async function vLesson(id) {
  const {data:l} = await sb.from('lessons').select('*').eq('id', id).maybeSingle();
  if (!l) return '<h1>الدرس غير متاح</h1><p>هذا الدرس يتطلب اشتراكًا فعّالًا أو غير منشور.</p><a class="btn" href="#/lessons">العودة للدروس</a>';
  const done = me && !!(await sb.from('lesson_progress').select('lesson_id').eq('user_id', me.id).eq('lesson_id', id).maybeSingle()).data;
  const au = l.iframe_url ? safeAppUrl(l.iframe_url) : null;
  let appHtml = '';
  if (au) {
    appCtx = me ? {id: l.id, origin: au.origin} : null;
    const ap = me ? (await sb.from('app_progress').select('stars,completed').eq('user_id', me.id).eq('lesson_id', id).maybeSingle()).data : null;
    appHtml = `<div class="card"><iframe id="appframe" src="${esc(au.href)}" sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy="no-referrer" loading="lazy" title="${esc(l.title)}" style="width:100%;height:75vh;border:0;border-radius:12px"></iframe>` +
      (me ? `<p>⭐ نقاطك المحفوظة: <b id="appstars">${ap ? ap.stars : 0}</b></p>` : '<p class="muted">سجّل الدخول لحفظ نقاطك.</p>') + '</div>';
  }
  return `<a href="#/lessons">← كل الدروس</a><h1>${esc(l.title)}</h1><p class="muted">${esc(l.program)}</p>` + (l.body ? `<div class="card pre">${esc(l.body)}</div>` : '') + appHtml +
    (me ? (done ? '<p class="ok">✓ أكملت هذا الدرس</p>' : `<button class="btn" data-act="done" data-id="${l.id}">تم إكمال الدرس</button>`) : '<p class="muted">سجّل الدخول لحفظ تقدمك.</p>');
}

// استقبال النقاط من التطبيق داخل الإطار: نقبل فقط رسائل ذلك الإطار ومن نطاقه هو بالذات.
let appSaveTimer = 0;
async function saveAppProgress(m, ctx) {
  if (!ctx || !me || ctx.id !== (appCtx && appCtx.id)) return;   // تجاهل لو غادر الطالب الدرس
  const stars = Math.max(0, Math.min(10000, parseInt(m.stars, 10) || 0));
  const {error} = await sb.rpc('save_app_progress', {p_lesson: ctx.id, p_stars: stars, p_completed: !!m.completed});   // لا تنقص النقاط المحفوظة أبدًا
  if (error) return;
  const cur = (await sb.from('app_progress').select('stars').eq('user_id', me.id).eq('lesson_id', ctx.id).maybeSingle()).data;
  const el = document.getElementById('appstars'); if (el && cur) el.textContent = cur.stars;
  if (m.completed) await sb.from('lesson_progress').insert({user_id: me.id, lesson_id: ctx.id});   // تكرار الإدخال يُتجاهل
}
// استقبال النقاط من التطبيق داخل الإطار: نقبل فقط رسائل ذلك الإطار ومن نطاقه هو بالذات.
// نؤجّل الحفظ 700ms ونحفظ آخر قيمة (لا نُسقط التحديثات السريعة).
addEventListener('message', ev => {
  const f = document.getElementById('appframe');
  if (!appCtx || !me || !f || ev.source !== f.contentWindow || ev.origin !== appCtx.origin) return;
  const m = ev.data;
  if (!m || m.type !== 'dina-progress') return;
  const ctx = appCtx;
  clearTimeout(appSaveTimer);
  appSaveTimer = setTimeout(() => saveAppProgress(m, ctx), m.completed ? 0 : 700);
});

const V = {'': vHome, how: vHow, policies: vPol, login: vAuth, account: vAcc, order: vOrder, admin: vAdmin, lessons: vLessons, lesson: vLesson, live: vLive};
async function route() {
  appCtx = null;
  const raw = location.hash.slice(1);
  if (raw.includes('error_code=')) {   // رابط استعادة/تأكيد منتهي أو مستخدم من Supabase
    const ec = new URLSearchParams(raw).get('error_code');
    toast(ec === 'otp_expired' ? 'الرابط منتهي أو سبق استخدامه. اطلب رابطًا جديدًا من «نسيت كلمة المرور».' : 'تعذر استخدام الرابط، حاول مجددًا.');
    location.replace(location.pathname + location.search + '#/login');
    return;
  }
  const [, p = '', a] = raw.split('/');
  app.innerHTML = '<p class="muted">جارٍ التحميل…</p>';
  try { app.innerHTML = await (V[p] || vHome)(a); } catch (e) { app.innerHTML = '<p class="err">تعذر تحميل الصفحة، حاول مجددًا.</p>'; }
  scrollTo(0, 0);
}
const rpc = async (fn, args, ok) => { const {data, error} = await sb.rpc(fn, args); if (error) { toast(error.message || 'تعذر تنفيذ العملية'); return null; } if (ok) toast(ok); return data ?? true; };

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return; const d = b.dataset, id = d.id;
  if (d.act === 'logout') { await sb.auth.signOut(); location.hash = '#/'; }
  else if (d.act === 'buy') { if (!me) { location.hash = '#/login'; return; } const o = await rpc('create_order', {p_plan_id: id}); if (o && o !== true) location.hash = '#/order/' + o; }
  else if (d.act === 'reset') { const e = document.querySelector('[data-form=login] [name=e]').value; if (!e) return toast('اكتب بريدك أولًا'); await sb.auth.resetPasswordForEmail(e, {redirectTo: location.origin + location.pathname}); toast('إن كان البريد مسجلًا فسيصلك رابط الاستعادة'); }
  else if (d.act === 'receipt') { const {data} = await sb.storage.from('receipts').createSignedUrl(d.p, 60); if (data) open(data.signedUrl, '_blank', 'noopener'); }
  else if (d.act === 'approve') { if (confirm('هل تأكدت من وصول المبلغ فعليًا إلى حسابك؟') && await rpc('review_order', {p_order_id: id, p_approve: true}, 'تم تأكيد الدفع')) route(); }
  else if (d.act === 'reject') { const n = prompt('سبب الرفض (إلزامي):'); if (n && await rpc('review_order', {p_order_id: id, p_approve: false, p_note: n}, 'تم الرفض')) route(); }
  else if (d.act === 'issue') { const c = await rpc('issue_activation_code', {p_order_id: id}); if (c && c !== true) { prompt('انسخ الكود وأرسله للمشترك الآن. لن يظهر مرة أخرى:', c); route(); } }
  else if (d.act === 'revoke') { const n = prompt('سبب إلغاء الكود:'); if (n && await rpc('revoke_activation_code', {p_order_id: id, p_reason: n}, 'تم إلغاء الكود')) route(); }
  else if (d.act === 'teacher') { if (await rpc('set_teacher_status', {p_user: id, p_status: d.s}, 'تم التحديث')) route(); }
  else if (d.act === 'done') { const {error} = await sb.from('lesson_progress').insert({user_id: me.id, lesson_id: id}); if (error && error.code !== '23505') toast('تعذر حفظ التقدم'); else { toast('أحسنت! تم حفظ تقدمك'); route(); } }
  else if (d.act === 'togglelesson') { const {error} = await sb.from('lessons').update({published: d.v !== 'true'}).eq('id', id); error ? toast('تعذر التحديث') : route(); }
  else if (d.act === 'togglelive') { const {error} = await sb.from('live_sessions').update({published: d.v !== 'true'}).eq('id', id); error ? toast('تعذر التحديث') : route(); }
  else if (d.act === 'deletelive') { if (confirm('حذف هذه الحصة نهائيًا؟')) { const {error} = await sb.from('live_sessions').delete().eq('id', id); error ? toast('تعذر الحذف') : route(); } }
  else if (d.act === 'toggleplan') { const {error} = await sb.from('plans').update({is_active: d.v !== 'true'}).eq('id', id); error ? toast('تعذر التحديث') : route(); }
});

document.addEventListener('submit', async ev => {
  const f = ev.target.dataset.form; if (!f) return; ev.preventDefault(); const v = Object.fromEntries(new FormData(ev.target));
  if (f === 'login') { const {error} = await sb.auth.signInWithPassword({email: v.e, password: v.p}); error ? toast('بيانات الدخول غير صحيحة') : (await loadMe(), location.hash = '#/account'); }
  else if (f === 'signup') { const {error} = await sb.auth.signUp({email: v.e, password: v.p, options: {data: {full_name: v.n, wants_teacher: v.t ? 'true' : 'false'}}}); toast(error ? 'تعذر إنشاء الحساب، راجع البيانات' : 'تم الإنشاء. إن طُلب تأكيد البريد فافحص رسائلك ثم سجّل الدخول'); }
  else if (f === 'newpass') { const {error} = await sb.auth.updateUser({password: v.p}); toast(error ? 'تعذر تغيير كلمة المرور' : 'تم تغيير كلمة المرور'); if (!error) location.hash = '#/account'; }
  else if (f === 'redeem') { const r = await rpc('redeem_activation_code', {p_code: v.c}); if (r) { toast(r.ok ? 'تم تفعيل اشتراكك' : r.message); if (r.ok) route(); } }
  else if (f === 'payinfo') {
    const file = ev.target.f.files[0]; let path = null;
    if (file) {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) return toast('الصورة يجب أن تكون JPG/PNG/WebP وأقل من 5 ميجا');
      path = `${me.id}/${ev.target.dataset.id}-${Date.now()}.${file.type.split('/')[1]}`;
      const {error} = await sb.storage.from('receipts').upload(path, file, {contentType: file.type}); if (error) return toast('تعذر رفع الإيصال');
    }
    if (await rpc('attach_payment_info', {p_order_id: ev.target.dataset.id, p_reference: v.r, p_receipt_path: path}, 'تم الإرسال، حالة طلبك: في انتظار المراجعة')) location.hash = '#/account';
  }
  else if (f === 'live') {
    const {error} = await sb.rpc('admin_add_live_session', {p_title: v.t, p_subject: v.s || '', p_starts: new Date(v.d).toISOString(), p_duration: parseInt(v.m, 10), p_url: v.u, p_notes: v.n || '', p_student_email: v.e || '', p_published: !!v.pub});
    if (error) toast(/check constraint|violates/i.test(error.message) ? 'تحقق من البيانات: يجب أن يكون الرابط من meet.google.com' : (error.message || 'تعذر إضافة الحصة')); else route();
  }
  else if (f === 'lesson') { const {error} = await sb.from('lessons').insert({title: v.t, program: v.p, summary: v.s || '', body: v.b || '', is_free: !!v.f, published: !!v.pub, iframe_url: v.u || null, created_by: me.id}); error ? toast('تعذر إضافة الدرس') : route(); }
  else if (f === 'plan') { const {error} = await sb.from('plans').insert({name: v.n, price_egp: v.p, duration_days: v.d, description: v.ds, terms: v.t}); error ? toast('تعذر الإضافة') : route(); }
  else if (f === 'settings') { const rows = Object.entries(v).map(([key, value]) => ({key, value, updated_by: me.id, updated_at: new Date().toISOString()})); const {error} = await sb.from('app_settings').upsert(rows); toast(error ? 'تعذر الحفظ' : 'تم الحفظ'); }
});

sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') { setTimeout(async () => { await loadMe(); location.hash = '#/login/recover'; }, 0); }
  else if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') { setTimeout(loadMe, 0); }  // تأجيل لتفادي تعليق مكتبة Supabase
});
addEventListener('hashchange', route);
loadMe().then(route);