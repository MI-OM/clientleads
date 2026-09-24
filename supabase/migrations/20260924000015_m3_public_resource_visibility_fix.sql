-- M3 follow-up — private resources must never be downloadable through the public RPC.
create or replace function public.record_resource_download(
  p_resource_id uuid,
  p_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_gated boolean;
  v_published boolean;
  v_visibility text;
  v_title text;
  v_file_path text;
  v_file_name text;
  v_mime_type text;
  v_file_size bigint;
  v_contact_id uuid;
begin
  select organization_id, gated, published, visibility, title,
         file_path, file_name, mime_type, file_size
    into v_org_id, v_gated, v_published, v_visibility, v_title,
         v_file_path, v_file_name, v_mime_type, v_file_size
  from public.resources
  where id = p_resource_id;

  if v_org_id is null or not v_published or v_visibility <> 'public' then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  if v_gated then
    select contact_id into v_contact_id
    from public.resource_gates
    where resource_id = p_resource_id and token = p_token and used_at is null
    limit 1;
    if v_contact_id is null then raise exception 'RESOURCE_GATE_REQUIRED'; end if;
    update public.resource_gates set used_at = now()
    where resource_id = p_resource_id and token = p_token;
  end if;

  update public.resources set download_count = download_count + 1 where id = p_resource_id;
  perform public.log_activity(
    v_org_id, v_contact_id, null, 'resource_downloaded',
    'Resource downloaded', v_title,
    jsonb_build_object('resource_id', p_resource_id, 'title', v_title)
  );

  return jsonb_build_object(
    'ok', true, 'contact_id', v_contact_id, 'file_path', v_file_path,
    'file_name', v_file_name, 'mime_type', v_mime_type, 'file_size', v_file_size
  );
end;
$$;
