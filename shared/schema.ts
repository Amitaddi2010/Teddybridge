import { relations } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // Optional for Firebase users
  firebaseUid: text("firebase_uid").unique(), // Firebase user ID
  role: text("role", { enum: ["PATIENT", "DOCTOR"] }).notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Patient Profile
export const patientProfiles = sqliteTable("patient_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  phoneNumber: text("phone_number"),
  demographics: text("demographics", { mode: "json" }).$type<{
    age?: number;
    gender?: string;
    procedure?: string;
  }>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Doctor Profile
export const doctorProfiles = sqliteTable("doctor_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id),
  phoneNumber: text("phone_number").notNull(),
  specialty: text("specialty"),
  city: text("city"),
  education: text("education"),
  experience: text("experience"),
  institution: text("institution"),
  languages: text("languages"),
  shortBio: text("short_bio"),
  linkedinUrl: text("linkedin_url"),
  available: integer("available", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Patient Connection (peer-to-peer)
export const patientConnections = sqliteTable("patient_connections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  requesterPatientId: text("requester_patient_id").notNull().references(() => users.id),
  targetPatientId: text("target_patient_id").references(() => users.id),
  targetEmail: text("target_email"),
  status: text("status", { enum: ["PENDING", "CONFIRMED", "DECLINED"] }).default("PENDING").notNull(),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  inviteToken: text("invite_token").notNull().unique(),
  confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// PROM (Patient-Reported Outcome Measures)
export const proms = sqliteTable("proms", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text("patient_id").notNull().references(() => users.id),
  redcapRecordId: text("redcap_record_id"),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
  submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Survey Request
export const surveyRequests = sqliteTable("survey_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text("patient_id").notNull().references(() => users.id),
  doctorId: text("doctor_id").references(() => users.id),
  formName: text("form_name").notNull(),
  surveyLink: text("survey_link"),
  redcapRecordId: text("redcap_record_id"),
  when: text("when", { enum: ["preop", "postop", "other"] }).default("preop").notNull(),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  status: text("status", { enum: ["PENDING", "SENT", "COMPLETED"] }).default("PENDING").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// Survey Response
export const surveyResponses = sqliteTable("survey_responses", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  surveyRequestId: text("survey_request_id").notNull().references(() => surveyRequests.id),
  redcapRecordId: text("redcap_record_id"),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
  receivedAt: integer("received_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Doctor Call
export const doctorCalls = sqliteTable("doctor_calls", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  callerDoctorId: text("caller_doctor_id").notNull().references(() => users.id),
  calleeDoctorId: text("callee_doctor_id").notNull().references(() => users.id),
  twilioCallSid: text("twilio_call_sid"),
  transcriptText: text("transcript_text"),
  liveSummary: text("live_summary"),
  summaryText: text("summary_text"),
  summaryUpdatedAt: integer("summary_updated_at", { mode: "timestamp" }),
  isLive: integer("is_live", { mode: "boolean" }).default(false),
  startedAt: integer("started_at", { mode: "timestamp" }),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Call Transcript Chunk
export const callTranscriptChunks = sqliteTable("call_transcript_chunks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  doctorCallId: text("doctor_call_id").notNull().references(() => doctorCalls.id),
  seqNumber: integer("seq_number").notNull(),
  textChunk: text("text_chunk").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Link Record (patient linked to doctor via QR)
export const linkRecords = sqliteTable("link_records", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  patientId: text("patient_id").notNull().references(() => users.id),
  doctorId: text("doctor_id").notNull().references(() => users.id),
  qrToken: text("qr_token").notNull().unique(),
  linkedAt: integer("linked_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// Patient Call
export const patientCalls = sqliteTable("patient_calls", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  requesterPatientId: text("requester_patient_id").notNull().references(() => users.id),
  targetPatientId: text("target_patient_id").notNull().references(() => users.id),
  twilioConferenceName: text("twilio_conference_name"),
  twilioCallSids: text("twilio_call_sids", { mode: "json" }).$type<string[]>(),
  startedAt: integer("started_at", { mode: "timestamp" }),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  isLive: integer("is_live", { mode: "boolean" }).default(false),
  mode: text("mode", { enum: ["voice", "video"] }).default("voice"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Audit Log
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  patientProfile: one(patientProfiles, {
    fields: [users.id],
    references: [patientProfiles.userId],
  }),
  doctorProfile: one(doctorProfiles, {
    fields: [users.id],
    references: [doctorProfiles.userId],
  }),
  sentConnections: many(patientConnections, { relationName: "requester" }),
  receivedConnections: many(patientConnections, { relationName: "target" }),
  proms: many(proms),
  surveyRequests: many(surveyRequests, { relationName: "patient" }),
  doctorSurveyRequests: many(surveyRequests, { relationName: "doctor" }),
  callerCalls: many(doctorCalls, { relationName: "caller" }),
  calleeCalls: many(doctorCalls, { relationName: "callee" }),
  patientLinkRecords: many(linkRecords, { relationName: "patient" }),
  doctorLinkRecords: many(linkRecords, { relationName: "doctor" }),
  initiatedPatientCalls: many(patientCalls, { relationName: "requester" }),
  receivedPatientCalls: many(patientCalls, { relationName: "target" }),
  auditLogs: many(auditLogs),
}));

export const patientConnectionsRelations = relations(patientConnections, ({ one }) => ({
  requester: one(users, {
    fields: [patientConnections.requesterPatientId],
    references: [users.id],
    relationName: "requester",
  }),
  target: one(users, {
    fields: [patientConnections.targetPatientId],
    references: [users.id],
    relationName: "target",
  }),
}));

export const surveyRequestsRelations = relations(surveyRequests, ({ one, many }) => ({
  patient: one(users, {
    fields: [surveyRequests.patientId],
    references: [users.id],
    relationName: "patient",
  }),
  doctor: one(users, {
    fields: [surveyRequests.doctorId],
    references: [users.id],
    relationName: "doctor",
  }),
  responses: many(surveyResponses),
}));

export const doctorCallsRelations = relations(doctorCalls, ({ one, many }) => ({
  caller: one(users, {
    fields: [doctorCalls.callerDoctorId],
    references: [users.id],
    relationName: "caller",
  }),
  callee: one(users, {
    fields: [doctorCalls.calleeDoctorId],
    references: [users.id],
    relationName: "callee",
  }),
  transcriptChunks: many(callTranscriptChunks),
}));

export const linkRecordsRelations = relations(linkRecords, ({ one }) => ({
  patient: one(users, {
    fields: [linkRecords.patientId],
    references: [users.id],
    relationName: "patient",
  }),
  doctor: one(users, {
    fields: [linkRecords.doctorId],
    references: [users.id],
    relationName: "doctor",
  }),
}));

export const patientCallsRelations = relations(patientCalls, ({ one }) => ({
  requester: one(users, {
    fields: [patientCalls.requesterPatientId],
    references: [users.id],
    relationName: "requester",
  }),
  target: one(users, {
    fields: [patientCalls.targetPatientId],
    references: [users.id],
    relationName: "target",
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertPatientProfileSchema = createInsertSchema(patientProfiles).omit({ id: true, createdAt: true });
export const insertDoctorProfileSchema = createInsertSchema(doctorProfiles).omit({ id: true, createdAt: true });
export const insertPatientConnectionSchema = createInsertSchema(patientConnections).omit({ id: true, createdAt: true });
export const insertSurveyRequestSchema = createInsertSchema(surveyRequests).omit({ id: true, createdAt: true });
export const insertDoctorCallSchema = createInsertSchema(doctorCalls).omit({ id: true, createdAt: true });
export const insertPatientCallSchema = createInsertSchema(patientCalls).omit({ id: true, createdAt: true });
export const insertLinkRecordSchema = createInsertSchema(linkRecords).omit({ id: true, linkedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type PatientProfile = typeof patientProfiles.$inferSelect;
export type InsertPatientProfile = z.infer<typeof insertPatientProfileSchema>;
export type DoctorProfile = typeof doctorProfiles.$inferSelect;
export type InsertDoctorProfile = z.infer<typeof insertDoctorProfileSchema>;
export type PatientConnection = typeof patientConnections.$inferSelect;
export type InsertPatientConnection = z.infer<typeof insertPatientConnectionSchema>;
export type SurveyRequest = typeof surveyRequests.$inferSelect;
export type InsertSurveyRequest = z.infer<typeof insertSurveyRequestSchema>;
export type DoctorCall = typeof doctorCalls.$inferSelect;
export type InsertDoctorCall = z.infer<typeof insertDoctorCallSchema>;
export type PatientCall = typeof patientCalls.$inferSelect;
export type InsertPatientCall = z.infer<typeof insertPatientCallSchema>;
export type LinkRecord = typeof linkRecords.$inferSelect;
export type InsertLinkRecord = z.infer<typeof insertLinkRecordSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type Prom = typeof proms.$inferSelect;
export type SurveyResponse = typeof surveyResponses.$inferSelect;
export const insertSurveyResponseSchema = createInsertSchema(surveyResponses);
export type InsertSurveyResponse = z.infer<typeof insertSurveyResponseSchema>;

// Frontend validation schemas
export const patientSignupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  phoneNumber: z.string().optional(),
  age: z.number().min(18).max(120).optional(),
  gender: z.string().optional(),
  procedure: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const doctorSignupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  phoneNumber: z.string().min(10, "Valid phone number required"),
  specialty: z.string().optional(),
  city: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type PatientSignupInput = z.infer<typeof patientSignupSchema>;
export type DoctorSignupInput = z.infer<typeof doctorSignupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
