update public.locations
set name = case code
  when 'ruko_1' then 'ruko1 cici'
  when 'ruko_2' then 'ruko2 nana'
  when 'ruko_3' then 'ruko3 fany'
  when 'ruko_4' then 'ruko4 enis'
end
where code in ('ruko_1', 'ruko_2', 'ruko_3', 'ruko_4');