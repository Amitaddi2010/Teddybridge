import { eq, and, or, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  patientProfiles,
  doctorProfiles,
  patientConnections,
  surveyRequests,
  surveyResponses,
  doctorCalls,
  callTranscriptChunks,
  linkRecords,
  patientCalls,
  auditLogs,
  proms,
  type User,
  type InsertUser,
  type PatientProfile,
  type InsertPatientProfile,
  type DoctorProfile,
  type InsertDoctorProfile,
  type PatientConnection,
  type InsertPatientConnection,
  type SurveyRequest,
  type InsertSurveyRequest,
  type DoctorCall,
  type InsertDoctorCall,
  type PatientCall,
  type InsertPatientCall,
  type LinkRecord,
  type InsertLinkRecord,
  type AuditLog,
  type InsertAuditLog,
} from "@shared/schema";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUserWithProfile(id: string): Promise<(User & { patientProfile?: PatientProfile | null; doctorProfile?: DoctorProfile | null }) | undefined>;
  
  // Patient Profiles
  createPatientProfile(profile: InsertPatientProfile): Promise<PatientProfile>;
  getPatientProfile(userId: string): Promise<PatientProfile | undefined>;
  
  // Doctor Profiles
  createDoctorProfile(profile: InsertDoctorProfile): Promise<DoctorProfile>;
  getDoctorProfile(userId: string): Promise<DoctorProfile | undefined>;
  
  // Patient Connections
  createPatientConnection(connection: InsertPatientConnection): Promise<PatientConnection>;
  getPatientConnection(id: string): Promise<PatientConnection | undefined>;
  getPatientConnectionByToken(token: string): Promise<PatientConnection | undefined>;
  updatePatientConnection(id: string, updates: Partial<PatientConnection>): Promise<PatientConnection | undefined>;
  getConnectionsForPatient(patientId: string): Promise<PatientConnection[]>;
  getAvailablePatients(excludeUserId: string): Promise<(User & { patientProfile?: PatientProfile | null })[]>;
  
  // Survey Requests
  createSurveyRequest(request: InsertSurveyRequest): Promise<SurveyRequest>;
  getSurveyRequest(id: string): Promise<SurveyRequest | undefined>;
  updateSurveyRequest(id: string, updates: Partial<SurveyRequest>): Promise<SurveyRequest | undefined>;
  getSurveysForDoctor(doctorId: string): Promise<(SurveyRequest & { patient?: User | null })[]>;
  getSurveysForPatient(patientId: string): Promise<SurveyRequest[]>;
  
  // Doctor Calls
  createDoctorCall(call: InsertDoctorCall): Promise<DoctorCall>;
  getDoctorCall(id: string): Promise<DoctorCall | undefined>;
  updateDoctorCall(id: string, updates: Partial<DoctorCall>): Promise<DoctorCall | undefined>;
  getCallsForDoctor(doctorId: string): Promise<DoctorCall[]>;
  
  // Patient Calls
  createPatientCall(call: InsertPatientCall): Promise<PatientCall>;
  getPatientCall(id: string): Promise<PatientCall | undefined>;
  updatePatientCall(id: string, updates: Partial<PatientCall>): Promise<PatientCall | undefined>;
  
  // Link Records
  createLinkRecord(record: InsertLinkRecord): Promise<LinkRecord>;
  getLinkRecordByToken(token: string): Promise<(LinkRecord & { doctor?: (User & { doctorProfile?: DoctorProfile | null }) | null }) | undefined>;
  getLinkRecordsForDoctor(doctorId: string): Promise<LinkRecord[]>;
  getLinkRecordsForPatient(patientId: string): Promise<LinkRecord[]>;
  isPatientLinkedToDoctor(patientId: string, doctorId: string): Promise<boolean>;
  
  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Doctors
  getAvailableDoctors(): Promise<(User & { doctorProfile?: DoctorProfile | null })[]>;
  getDoctorByQrToken(token: string): Promise<(User & { doctorProfile?: DoctorProfile | null }) | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getUserWithProfile(id: string): Promise<(User & { patientProfile?: PatientProfile | null; doctorProfile?: DoctorProfile | null }) | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return undefined;

    if (user.role === "PATIENT") {
      const [profile] = await db.select().from(patientProfiles).where(eq(patientProfiles.userId, id));
      return { ...user, patientProfile: profile || null, doctorProfile: null };
    } else {
      const [profile] = await db.select().from(doctorProfiles).where(eq(doctorProfiles.userId, id));
      return { ...user, doctorProfile: profile || null, patientProfile: null };
    }
  }

  // Patient Profiles
  async createPatientProfile(profile: InsertPatientProfile): Promise<PatientProfile> {
    // Ensure demographics has correct types
    const profileToInsert = {
      ...profile,
      demographics: profile.demographics ? {
        age: typeof profile.demographics.age === 'number' ? profile.demographics.age : undefined,
        gender: typeof profile.demographics.gender === 'string' ? profile.demographics.gender : undefined,
        procedure: typeof profile.demographics.procedure === 'string' ? profile.demographics.procedure : undefined,
      } : null,
    };
    const [created] = await db.insert(patientProfiles).values(profileToInsert).returning();
    return created;
  }

  async getPatientProfile(userId: string): Promise<PatientProfile | undefined> {
    const [profile] = await db.select().from(patientProfiles).where(eq(patientProfiles.userId, userId));
    return profile;
  }

  // Doctor Profiles
  async createDoctorProfile(profile: InsertDoctorProfile): Promise<DoctorProfile> {
    const [created] = await db.insert(doctorProfiles).values(profile).returning();
    return created;
  }

  async getDoctorProfile(userId: string): Promise<DoctorProfile | undefined> {
    const [profile] = await db.select().from(doctorProfiles).where(eq(doctorProfiles.userId, userId));
    return profile;
  }

  // Patient Connections
  async createPatientConnection(connection: InsertPatientConnection): Promise<PatientConnection> {
    const [created] = await db.insert(patientConnections).values(connection).returning();
    return created;
  }

  async getPatientConnection(id: string): Promise<PatientConnection | undefined> {
    const [connection] = await db.select().from(patientConnections).where(eq(patientConnections.id, id));
    return connection;
  }

  async getPatientConnectionByToken(token: string): Promise<PatientConnection | undefined> {
    const [connection] = await db.select().from(patientConnections).where(eq(patientConnections.inviteToken, token));
    return connection;
  }

  async updatePatientConnection(id: string, updates: Partial<PatientConnection>): Promise<PatientConnection | undefined> {
    const [updated] = await db.update(patientConnections).set(updates).where(eq(patientConnections.id, id)).returning();
    return updated;
  }

  async getConnectionsForPatient(patientId: string): Promise<PatientConnection[]> {
    const connections = await db.select().from(patientConnections)
      .where(or(
        eq(patientConnections.requesterPatientId, patientId),
        eq(patientConnections.targetPatientId, patientId)
      ))
      .orderBy(desc(patientConnections.createdAt));
    
    const result = [];
    for (const conn of connections) {
      const [requester] = await db.select().from(users).where(eq(users.id, conn.requesterPatientId));
      const target = conn.targetPatientId 
        ? (await db.select().from(users).where(eq(users.id, conn.targetPatientId)))[0]
        : null;
      result.push({ ...conn, requester, target });
    }
    return result;
  }

  async getAvailablePatients(excludeUserId: string): Promise<(User & { patientProfile?: PatientProfile | null })[]> {
    const patients = await db.select().from(users).where(
      and(eq(users.role, "PATIENT"), sql`${users.id} != ${excludeUserId}`)
    );
    
    const result = [];
    for (const patient of patients) {
      const [profile] = await db.select().from(patientProfiles).where(eq(patientProfiles.userId, patient.id));
      result.push({ ...patient, patientProfile: profile || null });
    }
    return result;
  }

  // Survey Requests
  async createSurveyRequest(request: InsertSurveyRequest): Promise<SurveyRequest> {
    const [created] = await db.insert(surveyRequests).values(request).returning();
    return created;
  }

  async getSurveyRequest(id: string): Promise<SurveyRequest | undefined> {
    const [request] = await db.select().from(surveyRequests).where(eq(surveyRequests.id, id));
    return request;
  }

  async updateSurveyRequest(id: string, updates: Partial<SurveyRequest>): Promise<SurveyRequest | undefined> {
    const [updated] = await db.update(surveyRequests).set(updates).where(eq(surveyRequests.id, id)).returning();
    return updated;
  }

  async getSurveysForDoctor(doctorId: string): Promise<(SurveyRequest & { patient?: User | null })[]> {
    const surveys = await db.select().from(surveyRequests)
      .where(eq(surveyRequests.doctorId, doctorId))
      .orderBy(desc(surveyRequests.createdAt));
    
    const result = [];
    for (const survey of surveys) {
      const [patient] = await db.select().from(users).where(eq(users.id, survey.patientId));
      result.push({ ...survey, patient });
    }
    return result;
  }

  async getSurveysForPatient(patientId: string): Promise<SurveyRequest[]> {
    return db.select().from(surveyRequests)
      .where(eq(surveyRequests.patientId, patientId))
      .orderBy(desc(surveyRequests.createdAt));
  }

  // Doctor Calls
  async createDoctorCall(call: InsertDoctorCall): Promise<DoctorCall> {
    const [created] = await db.insert(doctorCalls).values(call).returning();
    return created;
  }

  async getDoctorCall(id: string): Promise<DoctorCall | undefined> {
    const [call] = await db.select().from(doctorCalls).where(eq(doctorCalls.id, id));
    return call;
  }

  async updateDoctorCall(id: string, updates: Partial<DoctorCall>): Promise<DoctorCall | undefined> {
    const [updated] = await db.update(doctorCalls).set(updates).where(eq(doctorCalls.id, id)).returning();
    return updated;
  }

  async getCallsForDoctor(doctorId: string): Promise<DoctorCall[]> {
    return db.select().from(doctorCalls)
      .where(or(
        eq(doctorCalls.callerDoctorId, doctorId),
        eq(doctorCalls.calleeDoctorId, doctorId)
      ))
      .orderBy(desc(doctorCalls.createdAt));
  }

  // Patient Calls
  async createPatientCall(call: InsertPatientCall): Promise<PatientCall> {
    // Ensure twilioCallSids is properly typed as string[] or null/undefined
    const callToInsert = {
      ...call,
      twilioCallSids: call.twilioCallSids 
        ? (Array.isArray(call.twilioCallSids) ? call.twilioCallSids.filter((s): s is string => typeof s === 'string') : null)
        : undefined,
    };
    const [created] = await db.insert(patientCalls).values(callToInsert).returning();
    return created;
  }

  async getPatientCall(id: string): Promise<PatientCall | undefined> {
    const [call] = await db.select().from(patientCalls).where(eq(patientCalls.id, id));
    return call;
  }

  async updatePatientCall(id: string, updates: Partial<PatientCall>): Promise<PatientCall | undefined> {
    const [updated] = await db.update(patientCalls).set(updates).where(eq(patientCalls.id, id)).returning();
    return updated;
  }

  // Link Records
  async createLinkRecord(record: InsertLinkRecord): Promise<LinkRecord> {
    const [created] = await db.insert(linkRecords).values(record).returning();
    return created;
  }

  async getLinkRecordByToken(token: string): Promise<(LinkRecord & { doctor?: (User & { doctorProfile?: DoctorProfile | null }) | null }) | undefined> {
    const [record] = await db.select().from(linkRecords).where(eq(linkRecords.qrToken, token));
    if (!record) return undefined;
    
    const [doctor] = await db.select().from(users).where(eq(users.id, record.doctorId));
    const [doctorProfile] = await db.select().from(doctorProfiles).where(eq(doctorProfiles.userId, record.doctorId));
    return { ...record, doctor: doctor ? { ...doctor, doctorProfile: doctorProfile || null } : null };
  }

  async getLinkRecordsForDoctor(doctorId: string): Promise<LinkRecord[]> {
    return db.select().from(linkRecords).where(eq(linkRecords.doctorId, doctorId));
  }

  async getLinkRecordsForPatient(patientId: string): Promise<LinkRecord[]> {
    return db.select().from(linkRecords).where(eq(linkRecords.patientId, patientId));
  }

  async isPatientLinkedToDoctor(patientId: string, doctorId: string): Promise<boolean> {
    const [record] = await db.select().from(linkRecords).where(
      and(eq(linkRecords.patientId, patientId), eq(linkRecords.doctorId, doctorId))
    );
    return !!record;
  }

  // Audit Logs
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  // Doctors
  async getAvailableDoctors(): Promise<(User & { doctorProfile?: DoctorProfile | null })[]> {
    const doctors = await db.select().from(users).where(eq(users.role, "DOCTOR"));
    
    const result = [];
    for (const doctor of doctors) {
      const [profile] = await db.select().from(doctorProfiles).where(eq(doctorProfiles.userId, doctor.id));
      result.push({ ...doctor, doctorProfile: profile || null });
    }
    return result;
  }

  async getDoctorByQrToken(token: string): Promise<(User & { doctorProfile?: DoctorProfile | null }) | undefined> {
    const [record] = await db.select().from(linkRecords).where(eq(linkRecords.qrToken, token));
    if (!record) return undefined;
    
    const [doctor] = await db.select().from(users).where(eq(users.id, record.doctorId));
    if (!doctor) return undefined;
    
    const [profile] = await db.select().from(doctorProfiles).where(eq(doctorProfiles.userId, doctor.id));
    return { ...doctor, doctorProfile: profile || null };
  }
}

export const storage = new DatabaseStorage();
