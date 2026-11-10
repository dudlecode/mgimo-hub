-- Подготовка базы к записи ролика. Применять после сида, перед записью:
--   docker compose exec -T db psql -U attache -d attache -v shift=<мс> < video/record/prep.sql
-- После записи базу нужно пересоздать: npm run db:reset.

-- 1. Сдвиг времени записей. Сервер и браузер записи живут по сдвинутым часам (см. video/README.md),
--    а строки, которым время ставит база, без этого получили бы настоящее время:
--    пара идёт в 14:35, а заявка «подана в 21:12».
select set_config('video.shift', :'shift', false);
do $$
declare r record;
begin
  for r in
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and column_default ilike '%now()%'
  loop
    execute format('alter table %I alter column %I set default (now() + %L::interval)', r.table_name, r.column_name, current_setting('video.shift') || ' milliseconds');
  end loop;
end $$;

-- 2. У Анны в демо-данных уже есть справка для посольства в работе. В ролике она заказывает такую же
--    через Атташе, и ассистент честно отвечал бы «у вас уже есть одна». Для записи убираем старую заявку.
delete from notifications n
using requests r, students s, users u
where r.student_id = s.id and s.user_id = u.id and u.login = 'student.anna'
  and r.type = 'embassy-certificate' and n.user_id = u.id and n.link = '/requests/' || r.id;
delete from requests r
using students s, users u
where r.student_id = s.id and s.user_id = u.id and u.login = 'student.anna' and r.type = 'embassy-certificate';
