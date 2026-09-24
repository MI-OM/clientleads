-- =====================================================================
-- M8 — Visual email templates: reusable sections + header imagery.
-- Existing plain-text templates remain valid; sections are an additive layer.
-- =====================================================================

alter table public.email_templates
  add column if not exists image_url text,
  add column if not exists sections jsonb not null default '[]'::jsonb;

-- Ten starter templates for the demo organization. Users can replace every
-- section and image from the dashboard template editor.
do $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations where slug = 'first-client';
  if v_org is null then return; end if;

  insert into public.email_templates (organization_id, name, subject, body, image_url, sections)
  values
    (v_org, 'Real Estate Sales', 'Find your next home with {{business_name}}',
     'Hi {{first_name}},\n\nDiscover homes that fit your next chapter with {{business_name}}.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(
       jsonb_build_object('id','re-hero','type','hero','eyebrow','A better place to begin','title','Find a home that feels like yours','body','Thoughtful guidance, local expertise, and homes worth coming home to.'),
       jsonb_build_object('id','re-text','type','text','title','Your next move starts here','body','Tell us what you are looking for and our team will help you take the next confident step.'),
       jsonb_build_object('id','re-button','type','button','buttonLabel','Explore homes','buttonUrl','{{booking_link}}')
     )),
    (v_org, 'Food Services', 'A fresh invitation from {{business_name}}',
     'Hi {{first_name}},\n\nBring something memorable to the table with {{business_name}}.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(
       jsonb_build_object('id','food-hero','type','hero','eyebrow','Made for gathering','title','Good food. Great company.','body','Seasonal menus and warm service for the moments that matter.'),
       jsonb_build_object('id','food-text','type','text','title','Made around your table','body','From intimate dinners to full-service celebrations, we make every detail feel effortless.'),
       jsonb_build_object('id','food-button','type','button','buttonLabel','Plan your event','buttonUrl','{{booking_link}}')
     )),
    (v_org, 'Consulting Services', 'A clearer path forward with {{business_name}}',
     'Hi {{first_name}},\n\nTurn complex decisions into practical progress with {{business_name}}.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(
       jsonb_build_object('id','consult-hero','type','hero','eyebrow','Clarity into action','title','Make your next decision with confidence','body','Focused advice for teams ready to move from ideas to measurable progress.'),
       jsonb_build_object('id','consult-text','type','text','title','Practical strategy, human partnership','body','We listen closely, find the signal, and build a plan your team can actually use.'),
       jsonb_build_object('id','consult-button','type','button','buttonLabel','Start a conversation','buttonUrl','{{booking_link}}')
     )),
    (v_org, 'Books and Publications', 'A story worth opening from {{business_name}}',
     'Hi {{first_name}},\n\nDiscover thoughtful books and ideas from {{business_name}}.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(
       jsonb_build_object('id','books-hero','type','hero','eyebrow','New perspectives','title','Stories that stay with you','body','Beautifully made books for curious minds and generous conversations.'),
       jsonb_build_object('id','books-text','type','text','title','A little more wonder','body','Explore new releases, author notes, and ideas selected for your reading life.'),
       jsonb_build_object('id','books-button','type','button','buttonLabel','Browse the collection','buttonUrl','{{booking_link}}')
     )),
    (v_org, 'Sales', 'A smarter way to reach your goals',
     'Hi {{first_name}},\n\nMove your sales forward with {{business_name}}.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(
       jsonb_build_object('id','sales-hero','type','hero','eyebrow','Momentum that compounds','title','Turn opportunity into action','body','A focused sales partner for teams that want better conversations and stronger results.'),
       jsonb_build_object('id','sales-text','type','text','title','Build a pipeline people believe in','body','Sharpen your message, improve your process, and create a customer experience that earns trust.'),
       jsonb_build_object('id','sales-button','type','button','buttonLabel','Talk with sales','buttonUrl','{{booking_link}}')
     )),
    (v_org, 'Career', 'Your next chapter starts with {{business_name}}',
     'Hi {{first_name}},\n\nFind meaningful work and build what comes next with {{business_name}}.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(
       jsonb_build_object('id','career-hero','type','hero','eyebrow','Work with purpose','title','Build a career that feels like yours','body','Find opportunities, guidance, and people who want to see you thrive.'),
       jsonb_build_object('id','career-text','type','text','title','Room to grow','body','Whether you are making a change or taking your first step, we are here to help you move forward.'),
       jsonb_build_object('id','career-button','type','button','buttonLabel','See opportunities','buttonUrl','{{booking_link}}')
     )),
    (v_org, 'Newsletter — Monthly Notes', 'This month at {{business_name}}',
     'Hi {{first_name}},\n\nHere are a few thoughtful updates from {{business_name}}.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(jsonb_build_object('id','monthly-hero','type','hero','eyebrow','Monthly notes','title','A few good things to share','body','Ideas, updates, and inspiration from our corner of the world.'), jsonb_build_object('id','monthly-text','type','text','title','Inside this issue','body','Add your latest news, an event, a helpful idea, or a customer story here.'), jsonb_build_object('id','monthly-button','type','button','buttonLabel','Read more','buttonUrl','{{booking_link}}'))),
    (v_org, 'Newsletter — Product Update', 'What is new at {{business_name}}',
     'Hi {{first_name}},\n\nHere is what is new this week.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(jsonb_build_object('id','product-hero','type','hero','eyebrow','Product update','title','Better tools for the work ahead','body','A clear, friendly way to share what changed and why it matters.'), jsonb_build_object('id','product-text','type','text','title','The highlights','body','Explain your release, feature, or improvement in a few easy-to-scan lines.'), jsonb_build_object('id','product-button','type','button','buttonLabel','See the update','buttonUrl','{{booking_link}}'))),
    (v_org, 'Newsletter — Community Letter', 'A note from {{business_name}}',
     'Hi {{first_name}},\n\nA warm note from our community.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(jsonb_build_object('id','community-hero','type','hero','eyebrow','Community letter','title','Made better together','body','Celebrate the people, stories, and small wins that make your community special.'), jsonb_build_object('id','community-text','type','text','title','From the community','body','Share a member spotlight, upcoming gathering, or a note of thanks.'), jsonb_build_object('id','community-button','type','button','buttonLabel','Join the conversation','buttonUrl','{{booking_link}}'))),
    (v_org, 'Newsletter — Tips and Insights', 'A useful idea from {{business_name}}',
     'Hi {{first_name}},\n\nOne useful idea for your week.\n\n{{unsubscribe_url}}',
     'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=1200&q=80',
     jsonb_build_array(jsonb_build_object('id','tips-hero','type','hero','eyebrow','Tips and insights','title','A little help for the week ahead','body','Practical ideas, clearly explained and ready to put to work.'), jsonb_build_object('id','tips-text','type','text','title','This week''s takeaway','body','Add a useful lesson, checklist, or short point of view your audience can use today.'), jsonb_build_object('id','tips-button','type','button','buttonLabel','Keep learning','buttonUrl','{{booking_link}}')))
  on conflict (organization_id, lower(name)) do nothing;
end $$;
