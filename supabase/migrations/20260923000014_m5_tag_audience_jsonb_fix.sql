-- M5 follow-up — cast JSONB tag values to text before trimming.
-- This repairs projects where 000006_m5_campaigns.sql is already applied.
do $$
declare
  function_definition text;
begin
  if to_regprocedure('public.resolve_campaign_recipients(uuid)') is not null then
    select pg_get_functiondef(to_regprocedure('public.resolve_campaign_recipients(uuid)'))
      into function_definition;

    execute replace(function_definition, 'btrim(v_tags -> v_i)', 'btrim(v_tags ->> v_i)');
  end if;
end;
$$;
