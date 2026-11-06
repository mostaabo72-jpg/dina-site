// اختبارات تكاملية فعلية على مشروع Supabase تجريبي. تنشئ مستخدمين وبيانات وتحاول تنظيفها بعد الانتهاء.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const {SUPABASE_URL: U, SUPABASE_ANON_KEY: A, SUPABASE_SERVICE_ROLE_KEY: S} = process.env;
if (!U || !A || !S) throw new Error('اضبط SUPABASE_URL و SUPABASE_ANON_KEY و SUPABASE_SERVICE_ROLE_KEY');
const mk = k => createClient(U, k, {auth: {persistSession: false, autoRefreshToken: false}});
const svc = mk(S), run = Date.now(), PASS = 'Test-pass-12345', users = [];
const CODE_RE = /^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/;
const fakeId = '00000000-0000-4000-8000-000000000000';

async function user(tag, meta = {}) {
  const email = `t-${tag}-${run}@example.com`;
  const {data, error} = await svc.auth.admin.createUser({email, password: PASS, email_confirm: true, user_metadata: meta});
  assert.ifError(error);
  const c = mk(A), r = await c.auth.signInWithPassword({email, password: PASS});
  assert.ifError(r.error);
  users.push(data.user.id);
  return {c, id: data.user.id, email};
}
const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {type: 'image/png'});
let admin, stud, other, teacher, plan, order, code, freeLesson, paidLesson;

test('تجهيز: مدير وباقة اختبار', async () => {
  admin = await user('admin');
  assert.ifError((await svc.from('profiles').update({role: 'admin'}).eq('id', admin.id)).error);
  other = await user('other');
  const r = await svc.from('plans').insert({name: 'TEST PLAN', price_egp: 100, duration_days: 30}).select().single();
  assert.ifError(r.error); plan = r.data;
});

test('1) إنشاء حساب طالب وتسجيل الدخول', async () => {
  stud = await user('stud', {full_name: 'طالب اختبار'});
  const {data} = await stud.c.from('profiles').select('*').single();
  assert.equal(data.role, 'student'); assert.equal(data.teacher_status, 'none');
});

test('2) حساب معلم ينتظر الموافقة ولا يأخذ دورًا من بيانات التسجيل', async () => {
  teacher = await user('teach', {full_name: 'معلم', wants_teacher: 'true', role: 'admin'});
  const {data} = await teacher.c.from('profiles').select('*').single();
  assert.equal(data.role, 'student'); assert.equal(data.teacher_status, 'pending');
  const ins = await teacher.c.from('lessons').insert({title: 'x', program: 'p', created_by: teacher.id});
  assert.ok(ins.error, 'المعلم غير المعتمد لا ينشر دروسًا');
  assert.ifError((await admin.c.rpc('set_teacher_status', {p_user: teacher.id, p_status: 'approved'})).error);
  const ok = await teacher.c.from('lessons').insert({title: 'درس معلم', program: 'p', created_by: teacher.id}).select().single();
  assert.ifError(ok.error);
  await svc.from('lessons').delete().eq('id', ok.data.id);
});

test('3) المستخدم العادي لا يصل لوظائف المدير', async () => {
  for (const [fn, args] of [['review_order', {p_order_id: fakeId, p_approve: true}], ['issue_activation_code', {p_order_id: fakeId}],
      ['revoke_activation_code', {p_order_id: fakeId, p_reason: 'x'}], ['set_teacher_status', {p_user: stud.id, p_status: 'approved'}]])
    assert.ok((await stud.c.rpc(fn, args)).error, fn + ' يجب أن تُرفض');
  const up = await stud.c.from('profiles').update({role: 'admin'}).eq('id', stud.id);
  assert.ok(up.error, 'ترقية النفس يجب أن تُرفض');
  assert.equal((await stud.c.from('profiles').select('id')).data.length, 1, 'يرى ملفه فقط');
  assert.equal((await stud.c.from('audit_log').select('*')).data.length, 0);
  assert.equal((await stud.c.from('activation_codes').select('*')).data.length, 0);
});

test('4) إنشاء طلب دفع بسعر الخادم', async () => {
  const r = await stud.c.rpc('create_order', {p_plan_id: plan.id});
  assert.ifError(r.error); order = r.data;
  const o = (await stud.c.from('orders').select('*').eq('id', order).single()).data;
  assert.equal(Number(o.price_egp), 100); assert.equal(o.status, 'awaiting_review');
  assert.equal(o.duration_days, 30);
});

test('12) الإيصالات والطلبات خاصة بصاحبها والمدير فقط', async () => {
  const path = `${stud.id}/${order}.png`;
  assert.ifError((await stud.c.storage.from('receipts').upload(path, png(), {contentType: 'image/png'})).error);
  assert.ok((await other.c.storage.from('receipts').upload(`${stud.id}/evil.png`, png(), {contentType: 'image/png'})).error, 'الرفع في مجلد غيره مرفوض');
  assert.ok((await stud.c.storage.from('receipts').upload(`${stud.id}/a.txt`, new Blob(['x'], {type: 'text/plain'}), {contentType: 'text/plain'})).error, 'نوع غير صورة مرفوض');
  assert.ok((await other.c.storage.from('receipts').download(path)).error, 'غيره لا يقرأ الإيصال');
  assert.ifError((await admin.c.storage.from('receipts').download(path)).error);
  assert.equal((await other.c.from('orders').select('*').eq('id', order)).data.length, 0);
  assert.ok((await other.c.rpc('attach_payment_info', {p_order_id: order, p_reference: 'x', p_receipt_path: null})).error);
  assert.ifError((await stud.c.rpc('attach_payment_info', {p_order_id: order, p_reference: 'REF1', p_receipt_path: path})).error);
});

test('11) لا يمكن تعديل السعر أو الحالة أو الباقة من المتصفح', async () => {
  await stud.c.from('orders').update({price_egp: 1, status: 'confirmed'}).eq('id', order);
  await stud.c.from('plans').update({price_egp: 1}).eq('id', plan.id);
  await stud.c.from('subscriptions').insert({user_id: stud.id, plan_id: plan.id, order_id: order, starts_at: new Date().toISOString(), ends_at: '2099-01-01'});
  const o = (await svc.from('orders').select('price_egp,status').eq('id', order).single()).data;
  assert.equal(Number(o.price_egp), 100); assert.equal(o.status, 'awaiting_review');
  assert.equal(Number((await svc.from('plans').select('price_egp').eq('id', plan.id).single()).data.price_egp), 100);
  assert.equal((await svc.from('subscriptions').select('id').eq('user_id', stud.id)).data.length, 0);
});

test('5) لا إصدار كود ولا تفعيل قبل تأكيد الدفع', async () => {
  assert.ok((await admin.c.rpc('issue_activation_code', {p_order_id: order})).error);
  assert.equal((await stud.c.from('subscriptions').select('id')).data.length, 0);
});

test('6) المدير يؤكد الدفع ويصدر الكود (يُخزَّن مجزّأ)', async () => {
  assert.ifError((await admin.c.rpc('review_order', {p_order_id: order, p_approve: true})).error);
  const r = await admin.c.rpc('issue_activation_code', {p_order_id: order});
  assert.ifError(r.error); code = r.data; assert.match(code, CODE_RE);
  const row = (await svc.from('activation_codes').select('*').eq('order_id', order).single()).data;
  assert.ok(!JSON.stringify(row).includes(code), 'النص الصريح يجب ألا يُخزَّن');
  const logs = JSON.stringify((await svc.from('audit_log').select('*')).data);
  assert.ok(!logs.includes(code), 'لا أكواد في سجل التدقيق');
  assert.ok((await admin.c.rpc('issue_activation_code', {p_order_id: order})).error, 'لا كود ثانٍ لنفس الطلب');
});

test('9) رفض الكود على حساب آخر', async () => {
  const r = await other.c.rpc('redeem_activation_code', {p_code: code});
  assert.equal(r.data.ok, false);
});

test('7+10) نجاح التفعيل مرة واحدة فقط تحت التزامن، وللحساب الصحيح', async () => {
  const calls = [...Array(3)].flatMap(() => [stud.c.rpc('redeem_activation_code', {p_code: code}), other.c.rpc('redeem_activation_code', {p_code: code})]);
  const res = await Promise.all(calls);
  assert.equal(res.filter(r => r.data && r.data.ok).length, 1, 'نجاح واحد فقط');
  assert.equal((await svc.from('subscriptions').select('id').eq('user_id', stud.id)).data.length, 1);
  assert.equal((await svc.from('subscriptions').select('id').eq('user_id', other.id)).data.length, 0);
  assert.equal((await svc.from('orders').select('status').eq('id', order).single()).data.status, 'activated');
});

test('8) رفض إعادة استخدام الكود', async () => {
  const r = await stud.c.rpc('redeem_activation_code', {p_code: code});
  assert.equal(r.data.ok, false);
  assert.equal((await svc.from('subscriptions').select('id').eq('user_id', stud.id)).data.length, 1, 'لا تمديد غير مقصود');
});

test('حد المحاولات: بعد 5 فاشلة يُحظر التخمين مؤقتًا برسالة موحدة قبل ذلك', async () => {
  const b = await user('brute'); const msgs = [];
  for (let i = 0; i < 6; i++) msgs.push((await b.c.rpc('redeem_activation_code', {p_code: 'AAAAA-AAAAA-AAAAA-AAAAA'})).data.message);
  assert.equal(new Set(msgs.slice(0, 5)).size, 1); assert.match(msgs[5], /محاولات كثيرة/);
});

test('13+14) انتهاء الاشتراك يوقف المحتوى المدفوع ويبقي التقدم', async () => {
  const f = await svc.from('lessons').insert({title: 'مجاني', program: 'p', is_free: true, published: true}).select().single();
  const p = await svc.from('lessons').insert({title: 'مدفوع', program: 'p', is_free: false, published: true}).select().single();
  freeLesson = f.data; paidLesson = p.data;
  const ids = async () => (await stud.c.from('lessons').select('id')).data.map(x => x.id);
  assert.ok((await ids()).includes(paidLesson.id), 'مع الاشتراك الفعّال يرى المدفوع');
  assert.ifError((await stud.c.from('lesson_progress').insert({user_id: stud.id, lesson_id: freeLesson.id})).error);
  const past = n => new Date(Date.now() - n * 864e5).toISOString();
  assert.ifError((await svc.from('subscriptions').update({starts_at: past(60), ends_at: past(1)}).eq('user_id', stud.id)).error);
  const after = await ids();
  assert.ok(!after.includes(paidLesson.id), 'بعد الانتهاء لا يرى المدفوع'); assert.ok(after.includes(freeLesson.id));
  assert.equal((await stud.c.from('lesson_progress').select('*')).data.length, 1, 'التقدم باقٍ');
  assert.equal((await stud.c.from('profiles').select('id')).data.length, 1, 'الحساب باقٍ');
  assert.ok((await stud.c.from('lesson_progress').insert({user_id: stud.id, lesson_id: paidLesson.id})).error, 'لا تسجيل تقدم على درس مغلق');
  const cat = await mk(A).rpc('lesson_catalog'), pc = (cat.data || []).find(l => l.id === paidLesson.id);
  assert.ok(pc && pc.unlocked === false && !('body' in pc), 'الفهرس لا يكشف المحتوى ويُظهر القفل');
  const anonLessons = await mk(A).from('lessons').select('id');   // الزائر قد يرى المجاني المنشور (مقصود) لكن لا يرى المدفوع
  assert.ok(!(anonLessons.data || []).some(l => l.id === paidLesson.id), 'الزائر لا يرى الدرس المدفوع');
});

test('15) رسائل خطأ الدخول موحّدة ولا تكشف وجود الحساب', async () => {
  const a = await mk(A).auth.signInWithPassword({email: stud.email, password: 'wrong-password-1'});
  const b = await mk(A).auth.signInWithPassword({email: `nobody-${run}@example.com`, password: 'wrong-password-1'});
  assert.equal(a.error.message, b.error.message);
  // إرسال بريد الاستعادة فعليًا يُختبر يدويًا (يحتاج بريدًا حقيقيًا).
});

test('الزائر لا يرى بيانات التحويل ولا ينشئ طلبات', async () => {
  const an = mk(A);
  const s = await an.from('app_settings').select('key');
  assert.ok(!(s.data || []).some(r => r.key.startsWith('instapay')));
  assert.ok((await an.rpc('create_order', {p_plan_id: plan.id})).error);
});

test('تطبيقات الدروس: الرابط مقيّد ومحمي، والنقاط خاصة ولا تُكتب على تطبيق مغلق', async () => {
  assert.ok((await svc.from('lessons').insert({title: 'x', program: 'p', iframe_url: 'javascript:alert(1)'})).error, 'رابط غير https مرفوض');
  const l = (await svc.from('lessons').insert({title: 'APP-TEST', program: 'p', published: true, is_free: false, iframe_url: 'https://example.com/app/'}).select().single()).data;
  try {
    assert.equal(((await stud.c.from('lessons').select('iframe_url').eq('id', l.id)).data || []).length, 0, 'اشتراك منتهي: لا يرى الرابط');
    assert.ok((await stud.c.from('app_progress').upsert({user_id: stud.id, lesson_id: l.id, stars: 5})).error, 'لا نقاط على تطبيق مغلق');
    const now = Date.now();
    assert.ifError((await svc.from('subscriptions').update({starts_at: new Date(now - 864e5).toISOString(), ends_at: new Date(now + 864e5).toISOString()}).eq('user_id', stud.id)).error);
    assert.ifError((await stud.c.from('app_progress').upsert({user_id: stud.id, lesson_id: l.id, stars: 5})).error);
    assert.ifError((await stud.c.rpc('save_app_progress', {p_lesson: l.id, p_stars: 9, p_completed: true})).error);
    assert.ifError((await stud.c.rpc('save_app_progress', {p_lesson: l.id, p_stars: 2, p_completed: false})).error);
    const kept = (await stud.c.from('app_progress').select('stars,completed').eq('lesson_id', l.id).single()).data;
    assert.equal(kept.stars, 9, 'النقاط لا تنقص'); assert.equal(kept.completed, true, 'الإكمال لا يُلغى');
    assert.equal((await other.c.from('app_progress').select('*')).data.length, 0, 'لا يرى نقاط غيره');
    assert.ok((await stud.c.from('app_progress').upsert({user_id: other.id, lesson_id: l.id, stars: 99})).error, 'لا كتابة باسم غيره');
  } finally {
    await svc.from('app_progress').delete().eq('lesson_id', l.id);
    await svc.from('lessons').delete().eq('id', l.id);
  }
});

test('الحصص المباشرة: Meet فقط، والرابط لا يظهر إلا للمشترك داخل نافذة الموعد', async () => {
  const when = ms => new Date(Date.now() + ms).toISOString();
  const add = o => svc.from('live_sessions').insert({title: 'LIVE-TEST', subject: 'x', duration_min: 30, published: true, ...o}).select().single();
  assert.ok((await svc.from('live_sessions').insert({title: 'x', starts_at: when(0), meet_url: 'https://evil.com/x'})).error, 'رابط غير Meet مرفوض');
  assert.ok((await svc.from('live_sessions').insert({title: 'x', starts_at: when(0), meet_url: 'javascript:alert(1)'})).error, 'javascript مرفوض');
  const soon = (await add({starts_at: when(5 * 60e3), meet_url: 'https://meet.google.com/abc-defg-hij'})).data;
  const far = (await add({starts_at: when(3 * 864e5), meet_url: 'https://meet.google.com/zzz-yyyy-xxx'})).data;
  const mine = (await add({starts_at: when(5 * 60e3), meet_url: 'https://meet.google.com/own-only-one', student_id: other.id})).data;
  try {
    assert.equal(((await stud.c.from('live_sessions').select('meet_url')).data || []).length, 0, 'الجدول مغلق أمام غير المدير');
    const r = (await stud.c.rpc('my_live_sessions')).data || [];
    const rs = r.find(z => z.id === soon.id), rf = r.find(z => z.id === far.id);
    assert.ok(rs && rs.joinable && rs.meet_url, 'داخل نافذة الموعد يظهر الرابط للمشترك');
    assert.ok(rf && !rf.joinable && rf.meet_url === null, 'قبل الموعد بكثير لا يظهر الرابط');
    assert.ok(!r.some(z => z.id === mine.id), 'حصة مخصصة لطالب آخر لا تظهر');
    assert.equal(((await other.c.rpc('my_live_sessions')).data || []).length, 0, 'بلا اشتراك لا حصص');
    assert.ok((await mk(A).rpc('my_live_sessions')).error, 'الزائر لا ينفذ الدالة');
    assert.ok((await stud.c.rpc('admin_add_live_session', {p_title: 'x', p_subject: '', p_starts: when(0), p_duration: 30, p_url: 'https://meet.google.com/abc-defg-hij', p_notes: '', p_student_email: '', p_published: true})).error, 'غير المدير لا يضيف');
  } finally {
    await svc.from('live_sessions').delete().in('id', [soon, far, mine].filter(Boolean).map(z => z.id));
  }
});

test('التفعيل المباشر: للمدير فقط، بمدة الباقة، مرة واحدة، دون تعارض مع الأكواد', async () => {
  const s2 = await user('direct');
  const p60 = (await svc.from('plans').insert({name: 'TEST60', price_egp: 50, duration_days: 60}).select().single()).data;
  const o = (await s2.c.rpc('create_order', {p_plan_id: p60.id})).data;
  try {
    assert.ok((await s2.c.rpc('admin_activate_order', {p_order_id: o})).error, 'غير المدير لا يفعّل');
    assert.ifError((await admin.c.rpc('admin_activate_order', {p_order_id: o})).error);
    const sub = (await svc.from('subscriptions').select('*').eq('order_id', o).single()).data;
    assert.equal(Math.round((new Date(sub.ends_at) - new Date(sub.starts_at)) / 864e5), 60, 'مدة الباقة لا 30 ثابتة');
    assert.equal((await svc.from('orders').select('status').eq('id', o).single()).data.status, 'activated');
    assert.ok((await admin.c.rpc('admin_activate_order', {p_order_id: o})).error, 'لا تفعيل مرتين');
    assert.equal((await svc.from('subscriptions').select('id').eq('order_id', o)).data.length, 1, 'اشتراك واحد فقط');
  } finally {
    await svc.from('subscriptions').delete().eq('order_id', o);
    await svc.from('orders').delete().eq('id', o);
    await svc.from('plans').delete().eq('id', p60.id);
  }
});

test('16) لا أسرار في ملفات المشروع العامة', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..'), bad = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      if (['node_modules', '.git', '.env'].includes(n)) continue;
      const p = join(d, n); if (statSync(p).isDirectory()) { walk(p); continue; }
      for (const m of readFileSync(p, 'utf8').matchAll(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/g)) {
        try { if (JSON.parse(Buffer.from(m[1], 'base64url').toString()).role === 'service_role') bad.push(p); } catch {}
      }
    }
  })(root);
  assert.deepEqual(bad, [], 'مفتاح service_role داخل ملفات المشروع');
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^\.env$/m);
});

after(async () => {   // تنظيف قدر الإمكان (سجل التدقيق غير قابل للحذف عمدًا)
  try {
    await svc.from('lesson_progress').delete().in('user_id', users);
    const lids = [freeLesson, paidLesson].filter(Boolean).map(l => l.id);
    if (lids.length) await svc.from('lessons').delete().in('id', lids);   // بالمعرّف فقط، لا بالعنوان
    await svc.from('subscriptions').delete().in('user_id', users);
    await svc.from('activation_codes').delete().in('user_id', users);
    await svc.from('code_attempts').delete().in('user_id', users);
    await svc.from('orders').delete().in('user_id', users);
    if (plan) await svc.from('plans').delete().eq('id', plan.id);
    for (const id of users) await svc.auth.admin.deleteUser(id);
  } catch (e) { console.warn('تعذر التنظيف الكامل:', e.message); }
});
