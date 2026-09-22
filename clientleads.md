ClientLeads

The key instruction for the eventual development agent should be:

> **Build the first deployment for one client, but do not create technical decisions that would make future multi-tenant deployment unnecessarily difficult. Do not build SaaS administration, tenant provisioning, billing, or multi-client management until the first client solution has been validated.**

# Product Requirements Document (PRD)

## Client Engagement & Business Management Platform 

## APP Name - ClientLeads

### Initial Deployment: Real Estate Client

**Prepared by:** D’Micheals Consulting
**Product Type:** Lightweight Business Client Engagement Platform
**Initial Vertical:** Real Estate / Professional Services
**Architecture Direction:** Next.js + Supabase
**Initial Deployment:** Single Client
**Future Direction:** Multi-Tenant SaaS
**Document Status:** Product Definition / Development Reference

---

# 1. Product Overview

The Client Engagement & Business Management Platform (ClientLeads) is a lightweight web application designed to help small and relationship-driven businesses manage their contacts, leads, services, appointments, communications, follow-ups, and public-facing business presence from one system.

The first implementation will be configured specifically for a real-estate professional/business.

The application will provide two connected experiences:

### Internal Business Application

Used by the business owner/team to:

* manage contacts
* manage leads
* manage services
* manage availability
* manage appointments
* manage newsletters
* manage tasks and follow-ups
* manage forms
* manage resources
* view activity
* manage the public business page
* view basic analytics

### Public Business Experience

Used by prospects and clients to:

* view the business
* learn about services
* submit inquiries
* book appointments
* access resources
* subscribe to communications
* receive confirmation and follow-up communications

---

# 2. Product Vision

The product should provide a small business with a simple digital system that connects:

**Discover → Capture → Connect → Book → Communicate → Follow Up → Retain**

The platform should not attempt to compete directly with enterprise CRM systems.

Its value is simplicity and integration.

Instead of requiring separate tools for:

* website/profile
* contact database
* booking
* forms
* newsletters
* follow-up

the business receives one connected system.

---

# 3. Product Goals

## Primary Goals

1. Provide a centralized client/contact database.
2. Capture new leads from public-facing forms.
3. Allow prospective clients to book services/appointments.
4. Allow the business to define services and availability.
5. Provide a branded public business page.
6. Enable newsletters and basic email campaigns.
7. Maintain a history of interactions with contacts.
8. Provide follow-up task management.
9. Provide simple analytics.
10. Create a reusable technical foundation for future clients.
11. Keep the initial application lean and inexpensive to operate.

---

# 4. Non-Goals

The MVP will NOT attempt to become:

* HubSpot
* Salesforce
* Mailchimp replacement
* Calendly replacement
* full website builder
* accounting platform
* property management platform
* MLS platform
* transaction management platform
* social media management platform
* full marketing automation platform
* project management platform

Real-estate-specific functionality such as MLS integration, property matching and transaction management should remain outside the MVP unless specifically requested.

---

# 5. Initial User Types

## 5.1 Business Owner / Administrator

Can:

* manage business settings
* manage contacts
* manage leads
* manage services
* manage appointments
* manage availability
* create campaigns
* manage forms
* manage resources
* manage tasks
* view analytics
* manage public page
* manage users

## 5.2 Staff User

Depending on the client's team structure, staff may:

* view assigned contacts
* manage appointments
* add notes
* complete tasks
* view campaigns
* manage assigned leads

Role permissions should be configurable later.

## 5.3 Public Visitor

Can:

* view public page
* view services
* submit forms
* book appointments
* access public resources
* subscribe to newsletters

No account should be required for basic public interactions.

---

# 6. Core Modules

The MVP consists of:

1. Authentication
2. Business Profile
3. Public Business Page
4. Contacts
5. Leads
6. Tags & Segmentation
7. Custom Fields
8. Services
9. Availability
10. Appointments
11. Forms & Lead Capture
12. Tasks & Follow-ups
13. Activities
14. Email Templates
15. Newsletters/Campaigns
16. Resources
17. Basic Automations
18. Dashboard & Analytics
19. Notifications
20. Settings

---

# 7. Authentication

The application should use Supabase Authentication.

## Requirements

* Email/password authentication
* Password reset
* Session management
* Protected application routes
* Public routes for public business pages
* Public booking/form routes

Future:

* Google login
* Microsoft login
* MFA
* organization invitations

These should not be required for MVP.

---

# 8. Business Profile

Each business has a profile.

## Fields

* Business name
* Logo
* Profile image
* Description
* Business email
* Business phone
* Address
* City
* Province/State
* Country
* Postal/ZIP code
* Website
* Social media links
* Public URL/slug
* Business hours
* Time zone
* Primary contact name

## Branding

The business should be able to configure:

* logo
* primary brand color
* secondary brand color
* button appearance
* basic page styling

The UI should remain controlled by the platform rather than becoming a full website builder.

---

# 9. Public Business Page

Each business receives a public page.

Example:

```text
/platform/business-name
```

Future:

```text
business-name.platform.com
```

Future optional:

```text
www.businessdomain.com
```

## Public Page Sections

### Header

* logo
* business name
* navigation

### Hero

* headline
* description
* primary CTA
* secondary CTA

### About

* business/person description

### Services

Display active services.

Each service should include:

* name
* description
* duration
* price if applicable
* booking CTA

### Booking

Visitors can select a service and book an available time.

### Lead Form

Visitor can submit an inquiry without booking.

### Resources

Display published resources.

### Contact

Display:

* email
* phone
* address
* social links

### Footer

* business name
* copyright
* privacy link
* terms link

---

# 10. Contact Management

Contacts represent people/business relationships.

## Contact Fields

Core fields:

* First name
* Last name
* Email
* Phone
* Company
* Address
* City
* Province/State
* Country
* Postal/ZIP
* Contact type
* Lead status
* Source
* Assigned user
* Notes
* Created date
* Updated date

## Contact Types

Should be configurable.

Initial real-estate examples:

* Lead
* Prospect
* Client
* Past Client
* Referral Partner
* Other

---

# 11. Contact Tags

Contacts can have multiple tags.

Examples:

* Buyer
* Seller
* Investor
* First-Time Buyer
* Halifax
* Dartmouth
* Newsletter
* Past Client

Tags should be organization-specific.

A contact can have:

```text
John Smith

Tags:
Buyer
Halifax
Newsletter
```

---

# 12. Custom Fields

The platform should support configurable custom fields.

Example:

```text
Preferred Area
Property Type
Budget
Buying Timeline
```

Custom fields should support at minimum:

* text
* number
* date
* boolean
* dropdown
* multi-select

The platform should not hard-code real-estate-specific fields into the core contact table.

This is critical for future reuse.

---

# 13. Contact Activity Timeline

Each contact should have a chronological activity timeline.

Possible activities:

* Contact created
* Contact updated
* Form submitted
* Appointment booked
* Appointment cancelled
* Appointment completed
* Email sent
* Email opened
* Link clicked
* Newsletter sent
* Note added
* Task created
* Task completed
* Resource downloaded
* Tag added
* Tag removed
* Lead stage changed

Example:

```text
John Smith

Sept 22
Appointment booked

Sept 21
Seller inquiry submitted

Sept 18
Newsletter opened

Sept 10
Contact created
```

---

# 14. Leads

A lead is a potential customer/business relationship.

## Lead Fields

* Contact
* Lead source
* Lead stage
* Assigned user
* Priority
* Expected value (optional)
* Notes
* Created date
* Last activity
* Next follow-up

## Initial Lead Stages

```text
New
Contacted
Qualified
Appointment
Active
Won
Lost
```

Stages should eventually be configurable.

---

# 15. Lead Sources

The system should identify where a lead originated.

Examples:

* Public website
* Booking
* Lead form
* Newsletter
* Referral
* Manual entry
* Import
* Other

This allows basic source analytics.

---

# 16. Services

Businesses can create services that customers can book.

## Service Fields

* Name
* Description
* Duration
* Price
* Currency
* Location type
* Location details
* Active/inactive
* Booking enabled
* Buffer before
* Buffer after
* Minimum notice
* Maximum booking window

## Location Types

* In-person
* Phone
* Video
* Other

---

# 17. Availability

Businesses define when appointments can be booked.

Example:

```text
Monday
09:00–17:00

Tuesday
09:00–17:00

Wednesday
10:00–16:00
```

Availability should support:

* day of week
* start time
* end time
* time zone
* active/inactive

---

# 18. Blocked Times

Users must be able to prevent booking during unavailable periods.

Examples:

* vacation
* personal appointment
* meeting
* holiday
* blocked business hours

The system should support:

* date
* start time
* end time
* reason

---

# 19. Appointment Management

Appointments are connected to:

* contact
* service
* assigned staff/user
* date
* start time
* end time
* location
* status

## Appointment Statuses

```text
Scheduled
Confirmed
Completed
Cancelled
No-show
Rescheduled
```

## Booking Flow

```text
Public Page
    ↓
Select Service
    ↓
Select Date
    ↓
Select Available Time
    ↓
Enter Contact Information
    ↓
Confirm
    ↓
Appointment Created
    ↓
Contact Created/Updated
    ↓
Confirmation Sent
```

---

# 20. Appointment Reminders

MVP should support basic reminders.

Examples:

* booking confirmation
* appointment reminder
* cancellation notification
* rescheduling notification

Reminder timing should be configurable later.

Example:

```text
24 hours before appointment
2 hours before appointment
```

---

# 21. Appointment Rescheduling

Public users should be able to reschedule where enabled.

The system must:

1. identify appointment
2. verify appointment access
3. show available times
4. update appointment
5. record activity
6. notify the business/client

---

# 22. Forms

Businesses can create lead/inquiry forms.

## Form Fields

Forms should support:

* text
* email
* phone
* textarea
* dropdown
* multi-select
* checkbox
* date
* hidden/source field

Example:

**Seller Inquiry**

```text
Name
Email
Phone
Property Area
Property Type
Message
```

---

# 23. Form Submission Workflow

When a form is submitted:

```text
Form submitted
      ↓
Validate
      ↓
Find existing contact
      ↓
If found → update contact
If not found → create contact
      ↓
Create activity
      ↓
Create/update lead
      ↓
Assign source
      ↓
Notify business
```

Duplicate detection should primarily use email and/or phone.

---

# 24. Tasks & Follow-ups

Users can create tasks.

## Task Fields

* Title
* Description
* Contact
* Lead
* Appointment
* Assigned user
* Due date
* Priority
* Status

## Statuses

```text
Open
In Progress
Completed
Cancelled
```

## Example

```text
Follow up with John Smith
Due: Sept 26
Related contact: John Smith
Priority: High
```

---

# 25. Email Templates

The platform should support reusable templates.

Initial templates:

* Welcome
* Appointment confirmation
* Appointment reminder
* Appointment cancellation
* Appointment reschedule
* Follow-up
* Newsletter
* Thank you
* Lead response

Templates should support variables such as:

```text
{{first_name}}
{{business_name}}
{{service_name}}
{{appointment_date}}
{{appointment_time}}
{{booking_link}}
```

---

# 26. Newsletter & Campaigns

Campaigns are reusable communication objects.

## Campaign Fields

* Campaign name
* Subject
* Preview text
* Content
* Sender name
* Sender email
* Audience/segment
* Status
* Scheduled date
* Sent date

## Campaign Status

```text
Draft
Scheduled
Sending
Sent
Cancelled
```

---

# 27. Audience Selection

Campaigns should support:

### All contacts

### Tags

Example:

```text
Buyer
```

### Multiple tags

Example:

```text
Buyer + Halifax
```

### Contact type

Example:

```text
Past Client
```

### Custom-field filtering

Example:

```text
Preferred Area = Halifax
```

The segmentation engine should be reusable across future industries.

---

# 28. Campaign Analytics

For each campaign, track:

* recipients
* sent
* delivered
* bounced
* opened
* clicked
* unsubscribed

Where supported by the selected email provider.

Example:

```text
September Market Update

Recipients: 428
Delivered: 421
Opened: 267
Clicked: 73
Unsubscribed: 2
```

---

# 29. Email Compliance

The system must support:

* unsubscribe mechanism
* suppression/unsubscribe status
* sender identity
* appropriate consent tracking
* campaign recipient exclusions

The application should not send marketing emails to contacts who have opted out.

---

# 30. Resources

Businesses can publish downloadable or viewable resources.

Examples:

* Market Reports
* Buyer Guides
* Seller Guides
* Checklists
* PDFs
* Articles

## Resource Fields

* Title
* Description
* File
* Thumbnail
* Public/private
* Published/unpublished
* Download count

---

# 31. Gated Resources

A resource may optionally require:

* name
* email
* phone

before download.

Workflow:

```text
Visitor
 ↓
Resource
 ↓
Lead Form
 ↓
Contact created/updated
 ↓
Resource download
 ↓
Activity recorded
```

---

# 32. Basic Automations

MVP automation should remain deliberately limited.

Supported triggers:

### Appointment booked

Actions:

* create/update contact
* create activity
* send confirmation
* create follow-up task if configured

### Form submitted

Actions:

* create/update contact
* create lead
* create activity
* notify user
* create task

### Appointment completed

Actions:

* record activity
* create follow-up task

### Resource downloaded

Actions:

* create/update contact
* record activity

A full visual automation builder is **not required**.

---

# 33. Dashboard

The dashboard should provide actionable information.

## Key metrics

* Total contacts
* New contacts
* Open leads
* Upcoming appointments
* Completed appointments
* Pending tasks
* Campaigns sent
* Campaign engagement

## Sections

### Upcoming Appointments

### Tasks Due

### Recent Leads

### Recent Activity

### Campaign Performance

### Quick Actions

```text
Add Contact
Create Lead
Create Appointment
Create Campaign
Create Form
Add Service
```

---

# 34. Notifications

Internal notifications should support:

* new lead
* new form submission
* new appointment
* appointment cancellation
* appointment rescheduling
* assigned task

Initial notification channel:

**Email**

In-app notifications can be added later.

---

# 35. Search

Global search should eventually allow users to find:

* contacts
* leads
* appointments
* campaigns
* tasks

MVP can initially focus on contact search.

Search fields:

* name
* email
* phone
* company

---

# 36. Import & Export

## CSV Import

Users should be able to:

1. Upload CSV.
2. Map columns.
3. Preview records.
4. Detect duplicates.
5. Import.
6. Display import results.

Example:

```text
Imported: 418
Created: 392
Updated: 21
Skipped: 5
```

## CSV Export

Users should be able to export appropriate records.

---

# 37. Duplicate Prevention

The system should avoid creating duplicate contacts.

Potential matching criteria:

1. Email
2. Phone
3. Combination of name + phone/email

The system should not blindly merge records.

Where confidence is low, flag for manual review.

---

# 38. Audit / Activity Logging

Important administrative actions should be recorded.

Examples:

* contact deleted
* contact updated
* campaign sent
* appointment cancelled
* user added
* service changed

This provides accountability without requiring a sophisticated enterprise audit system.

---

# 39. Multi-Tenant SaaS Architecture

Although the initial implementation is for **one client**, the database should be designed so that the application can later support multiple organizations.

However:

> **Do not build the SaaS management layer in MVP.**

Do not build:

* tenant billing
* subscription management
* tenant provisioning UI
* super-admin SaaS dashboard
* tenant self-service onboarding
* usage billing
* plan management

The database should simply be **tenant-ready**.

---

# 40. Multi-Tenant Data Model

Core structure:

```text
organizations
    │
    ├── organization_members
    │
    ├── contacts
    │      ├── contact_tags
    │      ├── contact_custom_values
    │      ├── notes
    │      └── activities
    │
    ├── leads
    │
    ├── tags
    │
    ├── custom_fields
    │
    ├── services
    │
    ├── availability_rules
    │
    ├── blocked_times
    │
    ├── appointments
    │
    ├── forms
    │      └── form_submissions
    │
    ├── tasks
    │
    ├── campaigns
    │      └── campaign_recipients
    │
    ├── email_templates
    │
    ├── resources
    │
    ├── automations
    │
    └── business_settings
```

---

# 41. Proposed Database Schema

## organizations

```text
id UUID PK
name TEXT
slug TEXT UNIQUE
logo_url TEXT
description TEXT
email TEXT
phone TEXT
address TEXT
city TEXT
province TEXT
country TEXT
postal_code TEXT
timezone TEXT
website_url TEXT
primary_color TEXT
secondary_color TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

## users

Supabase Auth remains the authentication source.

Application profile:

```text
profiles

id UUID PK
full_name TEXT
phone TEXT
avatar_url TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

## organization_members

```text
id UUID PK
organization_id UUID FK
user_id UUID FK
role TEXT
created_at TIMESTAMPTZ
```

Roles:

```text
owner
admin
staff
```

---

# 42. contacts

```text
id UUID PK
organization_id UUID FK
first_name TEXT
last_name TEXT
email TEXT
phone TEXT
company TEXT
address TEXT
city TEXT
province TEXT
country TEXT
postal_code TEXT
contact_type TEXT
lead_status TEXT
source TEXT
assigned_user_id UUID
notes TEXT
marketing_opt_in BOOLEAN
unsubscribed_at TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 43. tags

```text
id UUID PK
organization_id UUID FK
name TEXT
description TEXT
created_at TIMESTAMPTZ
```

## contact_tags

```text
contact_id UUID FK
tag_id UUID FK
created_at TIMESTAMPTZ

PRIMARY KEY(contact_id, tag_id)
```

---

# 44. custom_fields

```text
id UUID PK
organization_id UUID FK
entity_type TEXT
name TEXT
field_key TEXT
field_type TEXT
options JSONB
required BOOLEAN
sort_order INTEGER
created_at TIMESTAMPTZ
```

Initial entity:

```text
contact
```

Future:

```text
lead
appointment
service
```

---

# 45. contact_custom_values

```text
id UUID PK
organization_id UUID FK
contact_id UUID FK
custom_field_id UUID FK
value JSONB
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

JSONB provides flexibility without changing the database schema whenever a new industry requires another field.

---

# 46. leads

```text
id UUID PK
organization_id UUID FK
contact_id UUID FK
stage TEXT
source TEXT
priority TEXT
assigned_user_id UUID
expected_value NUMERIC
next_follow_up_at TIMESTAMPTZ
notes TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 47. services

```text
id UUID PK
organization_id UUID FK
name TEXT
description TEXT
duration_minutes INTEGER
price NUMERIC
currency TEXT
location_type TEXT
location_details TEXT
is_active BOOLEAN
booking_enabled BOOLEAN
buffer_before_minutes INTEGER
buffer_after_minutes INTEGER
minimum_notice_minutes INTEGER
maximum_booking_days INTEGER
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 48. availability_rules

```text
id UUID PK
organization_id UUID FK
user_id UUID FK NULL
day_of_week INTEGER
start_time TIME
end_time TIME
is_active BOOLEAN
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 49. blocked_times

```text
id UUID PK
organization_id UUID FK
user_id UUID FK NULL
start_at TIMESTAMPTZ
end_at TIMESTAMPTZ
reason TEXT
created_at TIMESTAMPTZ
```

---

# 50. appointments

```text
id UUID PK
organization_id UUID FK
contact_id UUID FK
service_id UUID FK
assigned_user_id UUID FK
start_at TIMESTAMPTZ
end_at TIMESTAMPTZ
status TEXT
location_type TEXT
location_details TEXT
notes TEXT
cancellation_reason TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 51. forms

```text
id UUID PK
organization_id UUID FK
name TEXT
slug TEXT
description TEXT
fields JSONB
success_message TEXT
is_active BOOLEAN
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 52. form_submissions

```text
id UUID PK
organization_id UUID FK
form_id UUID FK
contact_id UUID FK NULL
data JSONB
source_url TEXT
submitted_at TIMESTAMPTZ
```

---

# 53. tasks

```text
id UUID PK
organization_id UUID FK
contact_id UUID FK NULL
lead_id UUID FK NULL
appointment_id UUID FK NULL
assigned_user_id UUID FK
title TEXT
description TEXT
priority TEXT
status TEXT
due_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 54. activities

This should be a generic event table.

```text
id UUID PK
organization_id UUID FK
contact_id UUID FK NULL
lead_id UUID FK NULL
user_id UUID FK NULL
activity_type TEXT
subject TEXT
description TEXT
metadata JSONB
created_at TIMESTAMPTZ
```

Examples:

```text
contact_created
form_submitted
appointment_booked
appointment_cancelled
appointment_completed
email_sent
email_opened
email_clicked
campaign_sent
resource_downloaded
note_added
task_completed
lead_stage_changed
```

---

# 55. campaigns

```text
id UUID PK
organization_id UUID FK
name TEXT
subject TEXT
preview_text TEXT
content JSONB
sender_name TEXT
sender_email TEXT
status TEXT
scheduled_at TIMESTAMPTZ
sent_at TIMESTAMPTZ
created_by UUID FK
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 56. campaign_recipients

```text
id UUID PK
organization_id UUID FK
campaign_id UUID FK
contact_id UUID FK
email TEXT
status TEXT
sent_at TIMESTAMPTZ
delivered_at TIMESTAMPTZ
opened_at TIMESTAMPTZ
clicked_at TIMESTAMPTZ
unsubscribed_at TIMESTAMPTZ
metadata JSONB
```

---

# 57. email_templates

```text
id UUID PK
organization_id UUID FK
name TEXT
template_type TEXT
subject TEXT
content JSONB
is_active BOOLEAN
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 58. resources

```text
id UUID PK
organization_id UUID FK
title TEXT
description TEXT
file_url TEXT
thumbnail_url TEXT
is_public BOOLEAN
requires_form BOOLEAN
is_published BOOLEAN
published_at TIMESTAMPTZ
download_count INTEGER
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

# 59. automations

```text
id UUID PK
organization_id UUID FK
name TEXT
trigger_type TEXT
conditions JSONB
actions JSONB
is_active BOOLEAN
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

For MVP, only a controlled set of triggers/actions should be supported.

---

# 60. Recommended Indexes

Important indexes should include:

```text
contacts.organization_id
contacts.email
contacts.phone

leads.organization_id
leads.stage
leads.assigned_user_id

appointments.organization_id
appointments.start_at
appointments.assigned_user_id
appointments.status

activities.organization_id
activities.contact_id
activities.created_at

campaigns.organization_id
campaigns.status

campaign_recipients.campaign_id
campaign_recipients.contact_id
```

Composite indexes should be added where query patterns demonstrate a need.

---

# 61. Row Level Security

Supabase RLS must enforce tenant isolation.

General rule:

> A user can only access records belonging to an organization in which the user is an active member.

Conceptually:

```text
authenticated user
        ↓
organization_members
        ↓
organization_id
        ↓
tenant-owned records
```

Every tenant-owned table should include:

```text
organization_id
```

unless there is a documented reason not to.

---

# 62. System Architecture

## Frontend

```text
Next.js
App Router
TypeScript
Tailwind CSS
Reusable UI components
```

## Backend

```text
Supabase
├── PostgreSQL
├── Authentication
├── Row Level Security
├── Storage
└── Database functions where appropriate
```

## Email

Use an external transactional/marketing email provider rather than building an email server.

The provider should support:

* transactional email
* campaign delivery
* delivery tracking
* unsubscribe handling
* webhook events

The exact provider should be selected based on pricing, deliverability, API simplicity and Canadian/privacy requirements.

---

# 63. Application Structure

Recommended conceptual structure:

```text
app/
├── (auth)/
├── dashboard/
│   ├── contacts/
│   ├── leads/
│   ├── appointments/
│   ├── services/
│   ├── tasks/
│   ├── campaigns/
│   ├── forms/
│   ├── resources/
│   ├── activities/
│   ├── analytics/
│   └── settings/
│
├── public/
│   └── [businessSlug]/
│
└── api/
```

The exact implementation may use Server Actions instead of API routes where appropriate.

---

# 64. Public vs Private Application

The architecture should clearly separate:

### Public

```text
/business-slug
/business-slug/book
/business-slug/services
/business-slug/forms/...
/business-slug/resources/...
```

### Authenticated

```text
/dashboard
/dashboard/contacts
/dashboard/leads
/dashboard/appointments
...
```

Public users must never have direct access to private organization data.

---

# 65. File Storage

Supabase Storage can handle:

* business logos
* profile images
* resource PDFs
* campaign assets
* document attachments

Storage policies must respect organization boundaries.

Public resources should use controlled/public access according to their visibility.

Private files must never be exposed through predictable unrestricted URLs.

---

# 66. Security Requirements

The application must:

* use HTTPS
* use Supabase Auth
* enforce RLS
* validate server-side inputs
* sanitize user-generated content
* protect authenticated routes
* protect public form endpoints from abuse
* rate-limit sensitive public actions
* validate uploaded files
* restrict upload size/type
* avoid exposing service-role keys to the client
* log important administrative events

---

# 67. Public Form Security

Because forms are public, they must be protected from spam.

Possible controls:

* rate limiting
* CAPTCHA/Turnstile
* honeypot field
* server-side validation
* submission throttling

A lightweight solution should be preferred.

---

# 68. Booking Security

Public booking links should use secure identifiers/tokens.

A visitor should not be able to enumerate other appointments.

Public booking endpoints must not expose:

* other customers
* private notes
* internal staff information beyond what is necessary
* private calendar information

---

# 69. Privacy

The platform will contain personal information.

The implementation should therefore support:

* consent tracking
* unsubscribe status
* privacy policy
* data export
* deletion workflows
* access control
* minimum necessary data collection

The final privacy/legal requirements should be reviewed according to the client's jurisdiction and actual operation.

---

# 70. Design Principles

The product should follow these principles:

### 3-click principle

Common actions should require as few steps as reasonably possible.

### Clarity over density

Avoid traditional enterprise CRM interfaces.

### Action-oriented dashboard

Show what the user needs to do.

### Mobile-friendly

Public pages and booking flows must work well on mobile.

### Professional but simple

The product should feel like a professionally designed business system rather than an admin database.

### Reusable foundation

Generic functionality should not be hard-coded to real estate.

---

# 71. MVP Success Criteria

The first client should be able to:

### Contacts

* import existing contacts
* add contacts
* edit contacts
* search contacts
* tag contacts
* view contact history

### Leads

* receive leads
* assign leads
* move leads through stages
* schedule follow-ups

### Services

* create services
* configure duration
* configure availability
* publish services

### Appointments

* receive bookings
* view calendar
* confirm appointments
* cancel appointments
* reschedule appointments
* receive notifications

### Public Experience

* publish branded profile
* display services
* accept inquiries
* accept bookings
* publish resources

### Communications

* create newsletters
* select audience
* send campaigns
* view campaign performance
* manage unsubscribe status

### Management

* create tasks
* track activities
* view dashboard metrics

If the client can accomplish those workflows comfortably, the MVP has achieved its purpose.

---

# 72. Future SaaS Evolution

After the first client validates the product, the next phase can introduce:

### SaaS Administration

```text
Platform Admin
    ↓
Organizations
    ↓
Users
    ↓
Subscriptions
    ↓
Usage
```

### Self-service onboarding

```text
Sign up
 ↓
Create business
 ↓
Choose industry
 ↓
Configure services
 ↓
Import contacts
 ↓
Publish page
```

### Billing

Potential future subscription structure:

```text
Starter
Professional
Business
```

No pricing should be hard-coded into the current application.

---

# 73. Future Industry Configuration

The long-term platform should support:

```text
Industry Configuration
```

Example:

```text
Real Estate
├── Suggested contact types
├── Suggested tags
├── Suggested fields
├── Suggested services
├── Suggested pipeline
├── Suggested templates
└── Suggested resources
```

Another organization could use:

```text
Consulting
├── Client
├── Prospect
├── Referral Partner
└── Former Client
```

The underlying application remains the same.

---

# 74. Recommended Development Phases

## Phase 1 — Foundation

* Next.js
* Supabase
* Authentication
* Database
* RLS
* Organization structure
* User profiles
* Core UI
* Business settings

## Phase 2 — CRM

* Contacts
* Tags
* Custom fields
* Leads
* Activities
* Notes
* Import/export
* Search

## Phase 3 — Public Presence

* Business profile
* Public page
* Services
* Public forms
* Resources

## Phase 4 — Booking

* Availability
* Blocked times
* Appointment engine
* Booking flow
* Confirmation
* Cancellation
* Rescheduling
* Appointment dashboard

## Phase 5 — Communication

* Email provider
* Templates
* Campaigns
* Segmentation
* Delivery
* Unsubscribe
* Analytics

## Phase 6 — Productivity

* Tasks
* Follow-ups
* Basic automations
* Notifications

## Phase 7 — Validation

Deploy to the first client.

Observe actual usage.

Identify:

* unused features
* missing workflows
* confusing screens
* manual workarounds
* requested integrations
* performance issues

Only then evolve the platform.

---

# 75. AI Development Agent Instructions

The following principles should be treated as **non-negotiable development constraints**.

```text
PROJECT TYPE:
Client-first, SaaS-ready business application.

INITIAL DEPLOYMENT:
Single organization.

FUTURE:
Multi-tenant SaaS.

STACK:
Next.js + TypeScript + Supabase + PostgreSQL + Tailwind CSS.

CORE PRINCIPLE:
Build reusable generic modules while configuring the first deployment for a real-estate client.

DO NOT:
- Build a full enterprise CRM.
- Build a full website builder.
- Build a full email platform.
- Build MLS functionality.
- Build accounting.
- Build unnecessary microservices.
- Introduce Docker unless technically required.
- Introduce unnecessary infrastructure.
- Hard-code real-estate concepts into the core data model.
- Build SaaS billing or tenant provisioning in MVP.

MUST:
- Keep organization_id on tenant-owned records.
- Implement RLS correctly.
- Separate public and authenticated application routes.
- Validate all server-side inputs.
- Design reusable components.
- Keep business-specific configuration separate from core functionality.
- Maintain clean database relationships.
- Avoid duplicate contact creation.
- Record meaningful activities.
- Ensure public booking cannot expose private information.
- Make public pages mobile-first.
- Keep common business actions simple.

IMPORTANT:
The first deployment is not a throwaway prototype.

It is the first production implementation of a reusable platform.

However, do not prematurely build functionality that is only required for future SaaS operations.
```

---

# 76. Product Boundary

The most important product boundary is this:

> **The system manages the relationship between a business and its customers/prospects. It does not attempt to manage every operational aspect of the business.**

That keeps the product coherent.

The first client's real-estate workflow gives us the initial use case, while the underlying architecture remains generic enough to later support:

* real estate
* mortgage
* insurance
* consulting
* professional services
* agencies
* contractors
* nonprofits
* churches
* other relationship-driven SMBs

---

# 77. Final Product Definition

### Working Product Category

**Client Engagement & Business Management Platform**

### Core Promise

> **One simple place to manage your contacts, capture leads, accept bookings, communicate with clients, and grow relationships.**

### Initial Client Configuration

**Real Estate**

### Initial Deployment Model

**Single-client production deployment**

### Technical Model

**SaaS-ready multi-tenant database architecture**

### Future Business Model

**Reusable D’Micheals platform configured and deployed for individual businesses.**

The crucial strategic decision is that **we build the reusable engine now, but we don't force the first client to behave like a SaaS customer**. Their experience should feel custom, branded, and owned by their business.
