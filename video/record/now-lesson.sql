-- Для записи ролика: сегодняшняя 3-я пара группы Анны становится идущей прямо сейчас
-- (началась 20 минут назад, длится 90 минут), чтобы на «Сегодня» была пара с таймером.
-- После записи база пересоздаётся: npm run db:reset.
with t as (
  select to_timestamp(floor((extract(epoch from now()) - 1200) / 300) * 300) as s
)
update lessons l set
  pair_no = 6,
  starts_at = t.s,
  ends_at = t.s + interval '90 minutes'
from t, courses c, enrollments e, students st, users u
where c.id = l.course_id and e.course_id = c.id and st.id = e.student_id and u.id = st.user_id
  and u.login = 'student.anna'
  and (l.starts_at at time zone 'Europe/Moscow')::date = (now() at time zone 'Europe/Moscow')::date
  and l.pair_no = 3 and l.status = 'scheduled'
returning l.id, to_char(l.starts_at at time zone 'Europe/Moscow', 'DD.MM HH24:MI'), to_char(l.ends_at at time zone 'Europe/Moscow', 'HH24:MI');
