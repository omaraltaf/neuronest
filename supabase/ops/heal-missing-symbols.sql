with refs as (
  -- every concept any material references, with its language
  select lower(trim(c->>'concept')) concept, coalesce(g.language,'en') language, c->>'symbol_description' sd
  from neuronest.generated_content g, jsonb_array_elements(g.content_data->'cells') c
  where jsonb_typeof(g.content_data->'cells') = 'array'
  union
  select lower(trim(w->>'concept')), coalesce(g.language,'en'), w->>'symbol_description'
  from neuronest.generated_content g,
       jsonb_array_elements(g.content_data->'sentences') s,
       jsonb_array_elements(s->'words') w
  where jsonb_typeof(g.content_data->'sentences') = 'array'
  union
  select lower(trim(e->>'concept')), coalesce(g.language,'en'), e->>'symbol_description'
  from neuronest.generated_content g, jsonb_array_elements(g.content_data->'entries') e
  where jsonb_typeof(g.content_data->'entries') = 'array'
  union
  select lower(trim(c->>'concept')), coalesce(g.language,'en'), c->>'symbol_description'
  from neuronest.generated_content g, jsonb_array_elements(g.content_data->'cards') c
  where jsonb_typeof(g.content_data->'cards') = 'array' and c ? 'concept'
  union
  select lower(trim(g.content_data->>'concept')), coalesce(g.language,'en'), g.content_data->>'symbol_description'
  from neuronest.generated_content g where g.content_data ? 'concept'
  union
  select lower(trim(g.content_data->'token'->>'concept')), coalesce(g.language,'en'), g.content_data->'token'->>'symbol_description'
  from neuronest.generated_content g where g.content_data->'token' ? 'concept'
  union
  select lower(trim(g.content_data->'reward'->>'concept')), coalesce(g.language,'en'), g.content_data->'reward'->>'symbol_description'
  from neuronest.generated_content g where g.content_data->'reward' ? 'concept'
  union
  select lower(trim(w->>'concept')), coalesce(g.language,'en'), w->>'symbol_description'
  from neuronest.generated_content g, jsonb_array_elements(g.content_data->'words') w
  where jsonb_typeof(g.content_data->'words') = 'array'
  union
  select lower(trim(p->>'concept')), coalesce(g.language,'en'), p->>'symbol_description'
  from neuronest.generated_content g, jsonb_array_elements(g.content_data->'pairs') p
  where jsonb_typeof(g.content_data->'pairs') = 'array'
  union
  select lower(trim(st->>'concept')), coalesce(g.language,'en'), st->>'symbol_description'
  from neuronest.generated_content g, jsonb_array_elements(g.content_data->'story') st
  where jsonb_typeof(g.content_data->'story') = 'array'
  union
  select lower(trim(ch->>'concept')), coalesce(g.language,'en'), ch->>'symbol_description'
  from neuronest.generated_content g,
       jsonb_array_elements(g.content_data->'questions') q,
       jsonb_array_elements(q->'choices') ch
  where jsonb_typeof(g.content_data->'questions') = 'array'
),
missing as (
  select distinct r.concept, r.language, max(r.sd) sd
  from refs r
  left join neuronest.aac_symbols a on a.concept = r.concept and a.language = r.language
  where r.concept is not null and r.concept != '' and a.id is null
  group by r.concept, r.language
)
select
  (select count(*) from missing) as missing_count,
  case when (select count(*) from missing) > 0 then
    net.http_post(
      url := 'https://kutseusvdlkhflskezde.supabase.co/functions/v1/resolve-symbols',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', neuronest.get_secret('WEEKLY_FOCUS_CRON_SECRET')),
      body := jsonb_build_object('concepts', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('concept',concept,'language',language,'symbol_description',sd))) from missing)),
      timeout_milliseconds := 300000
    )
  end as request_id;
