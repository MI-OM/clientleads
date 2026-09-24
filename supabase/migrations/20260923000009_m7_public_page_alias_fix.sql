-- =====================================================================
-- M7 follow-up — repair the public page RPC alias.
--
-- M7 originally deployed a get_public_page definition that can fail with
-- `schema "o" does not exist` on the public route. Re-declare the function
-- with an explicit organization alias. This is safe to re-run.
-- =====================================================================

create or replace function public.get_public_page(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_org_id uuid;
  v_result jsonb;
begin
  select id into v_org_id
  from public.organizations
  where slug = p_slug
  limit 1;

  if v_org_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'org', jsonb_build_object(
      'id', org.id, 'name', org.name, 'slug', org.slug,
      'logo_url', org.logo_url, 'description', org.description, 'about', org.about,
      'email', org.email, 'phone', org.phone,
      'address', org.address, 'city', org.city, 'province', org.province,
      'country', org.country, 'postal_code', org.postal_code,
      'website_url', org.website_url, 'social_links', org.social_links,
      'primary_color', org.primary_color, 'secondary_color', org.secondary_color,
      'timezone', org.timezone
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description,
        'duration_min', s.duration_min, 'price', s.price, 'currency', s.currency,
        'location_type', s.location_type, 'location_details', s.location_details,
        'booking_enabled', s.booking_enabled
      ) order by s.sort_order, s.name)
      from public.services s
      where s.organization_id = v_org_id and s.active = true
    ), '[]'::jsonb),
    'forms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'slug', f.slug, 'description', f.description,
        'fields', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ff.id, 'label', ff.label, 'field_key', ff.field_key,
            'field_type', ff.field_type, 'required', ff.required,
            'options', ff.options, 'placeholder', ff.placeholder
          ) order by ff.sort_order)
          from public.form_fields ff
          where ff.form_id = f.id
        ), '[]'::jsonb)
      ) order by f.created_at)
      from public.public_forms f
      where f.organization_id = v_org_id and f.active = true
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'description', r.description,
        'gated', r.gated, 'download_count', r.download_count,
        'file_name', r.file_name
      ) order by r.created_at desc)
      from public.resources r
      where r.organization_id = v_org_id
        and r.published = true
        and r.visibility = 'public'
    ), '[]'::jsonb)
  ) into v_result
  from public.organizations as org
  where org.id = v_org_id;

  return v_result;
end;
$$;

revoke execute on function public.get_public_page(text) from public;
grant execute on function public.get_public_page(text) to anon, authenticated;
