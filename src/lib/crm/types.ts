/** CRM row types — plain camelCase mirrors of the M2 tables (PRD §42–46, §54). */

export interface Tag {
  id: string;
  name: string;
  description: string | null;
  /** Number of contacts currently carrying this tag (computed when asked for). */
  contactCount: number;
}

export interface CustomField {
  id: string;
  entityType: string;
  name: string;
  fieldKey: string;
  fieldType: string;
  options: string[];
  required: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface Contact {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  postalCode: string | null;
  contactType: string;
  leadStatus: string;
  source: string;
  assignedUserId: string | null;
  notes: string | null;
  marketingOptIn: boolean;
  unsubscribedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Display name (first + last, trimmed). */
  name: string;
  /** Tag names attached to this contact (filled by queries). */
  tags: string[];
  /** Custom field values keyed by field_key (filled by queries). */
  customValues: Record<string, unknown>;
}

export interface Lead {
  id: string;
  organizationId: string;
  contactId: string | null;
  contactName: string | null;
  stage: string;
  source: string;
  priority: string;
  assignedUserId: string | null;
  expectedValue: number | null;
  nextFollowUpAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  activityType: string;
  subject: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  userId: string | null;
  contactId: string | null;
  leadId: string | null;
  /** Resolved display name of the actor, when known. */
  userName: string | null;
}

export interface OrgMember {
  id: string;
  fullName: string;
  role: string;
}
