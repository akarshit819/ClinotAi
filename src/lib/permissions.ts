export interface PermissionDef {
  code: string
  name: string
  description: string
  module: string
}

export const ALL_PERMISSIONS: PermissionDef[] = [
  // Conversations
  { code: "conversation.read", name: "Read Conversations", description: "View conversations and messages", module: "conversations" },
  { code: "conversation.reply", name: "Reply to Conversations", description: "Send replies in conversations", module: "conversations" },
  { code: "conversation.manage", name: "Manage Conversations", description: "Archive, delete, change status", module: "conversations" },

  // Patients
  { code: "patient.read", name: "Read Patients", description: "View patient records", module: "patients" },
  { code: "patient.create", name: "Create Patients", description: "Add new patients", module: "patients" },
  { code: "patient.update", name: "Update Patients", description: "Edit patient records", module: "patients" },

  // Appointments
  { code: "appointment.read", name: "Read Appointments", description: "View appointments", module: "appointments" },
  { code: "appointment.create", name: "Create Appointments", description: "Book appointments", module: "appointments" },
  { code: "appointment.update", name: "Update Appointments", description: "Edit appointment details", module: "appointments" },
  { code: "appointment.delete", name: "Delete Appointments", description: "Cancel appointments", module: "appointments" },

  // Leads
  { code: "lead.read", name: "Read Leads", description: "View leads", module: "leads" },
  { code: "lead.update", name: "Update Leads", description: "Change lead status", module: "leads" },

  // Knowledge Base
  { code: "knowledge.read", name: "Read Knowledge Base", description: "View KB articles", module: "knowledge" },
  { code: "knowledge.create", name: "Create Articles", description: "Add new KB articles", module: "knowledge" },
  { code: "knowledge.update", name: "Update Articles", description: "Edit KB articles", module: "knowledge" },
  { code: "knowledge.delete", name: "Delete Articles", description: "Remove KB articles", module: "knowledge" },

  // Settings
  { code: "settings.read", name: "Read Settings", description: "View clinic settings", module: "settings" },
  { code: "settings.update", name: "Update Settings", description: "Edit clinic settings", module: "settings" },

  // Billing
  { code: "billing.read", name: "Read Billing", description: "View billing information", module: "billing" },
  { code: "billing.manage", name: "Manage Billing", description: "Change plans, payment methods", module: "billing" },

  // Integrations
  { code: "integration.read", name: "Read Integrations", description: "View integration status", module: "integrations" },
  { code: "integration.manage", name: "Manage Integrations", description: "Connect/disconnect integrations", module: "integrations" },

  // AI
  { code: "ai.read", name: "Read AI Config", description: "View AI settings", module: "ai" },
  { code: "ai.update", name: "Update AI Config", description: "Change AI provider and settings", module: "ai" },

  // Users
  { code: "user.read", name: "Read Users", description: "View team members", module: "users" },
  { code: "user.create", name: "Invite Users", description: "Add team members", module: "users" },
  { code: "user.update", name: "Update Users", description: "Edit user roles", module: "users" },
  { code: "user.delete", name: "Remove Users", description: "Delete team members", module: "users" },

  // Analytics
  { code: "analytics.read", name: "Read Analytics", description: "View analytics and reports", module: "analytics" },

  // Audit
  { code: "audit.read", name: "Read Audit Log", description: "View audit trail", module: "audit" },
]

export const PERMISSION_CODES = ALL_PERMISSIONS.map((p) => p.code)

export const PERMISSION_MAP = new Map(ALL_PERMISSIONS.map((p) => [p.code, p]))

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: ALL_PERMISSIONS.map((p) => p.code),
  admin: ALL_PERMISSIONS.map((p) => p.code),
  staff: [
    "conversation.read",
    "conversation.reply",
    "patient.read",
    "patient.create",
    "patient.update",
    "appointment.read",
    "appointment.create",
    "appointment.update",
    "lead.read",
    "lead.update",
    "knowledge.read",
    "settings.read",
    "integration.read",
    "ai.read",
    "analytics.read",
  ],
}

export function getDefaultPermissions(roleName: string): string[] {
  return DEFAULT_ROLE_PERMISSIONS[roleName] ?? DEFAULT_ROLE_PERMISSIONS.staff
}
