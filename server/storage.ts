import { eq, and, or, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
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
  updatePatientProfile(userId: string, updates: Partial<InsertPatientProfile>): Promise<PatientProfile | undefined>;
  
  // Doctor Profiles
  createDoctorProfile(profile: InsertDoctorProfile): Promise<DoctorProfile>;
  getDoctorProfile(userId: string): Promise<DoctorProfile | undefined>;
  updateDoctorProfile(userId: string, updates: Partial<InsertDoctorProfile>): Promise<DoctorProfile | undefined>;
  
  // Users
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  
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
  // Helper to get db (awaits if it's a promise)
  private async db() {
    return await getDb();
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const database = await this.db();
    const [user] = await database.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const database = await this.db();
    const [user] = await database.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const database = await this.db();
    const [created] = await database.insert(users).values(user).returning();
    return created;
  }

  async getUserWithProfile(id: string): Promise<(User & { patientProfile?: PatientProfile | null; doctorProfile?: DoctorProfile | null }) | undefined> {
    const database = await this.db();
    const [user] = await database.select().from(users).where(eq(users.id, id));
    if (!user) return undefined;

    if (user.role === "PATIENT") {
      const [profile] = await database.select().from(patientProfiles).where(eq(patientProfiles.userId, id));
      return { ...user, patientProfile: profile || null, doctorProfile: null };
    } else {
      const [profile] = await database.select().from(doctorProfiles).where(eq(doctorProfiles.userId, id));
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
    const database = await this.db();
    const [created] = await database.insert(patientProfiles).values(profileToInsert).returning();
    return created;
  }

  async getPatientProfile(userId: string): Promise<PatientProfile | undefined> {
    const database = await this.db();
    const [profile] = await database.select().from(patientProfiles).where(eq(patientProfiles.userId, userId));
    return profile;
  }

  async updatePatientProfile(userId: string, updates: Partial<InsertPatientProfile>): Promise<PatientProfile | undefined> {
    const existingProfile = await this.getPatientProfile(userId);
    if (!existingProfile) {
      // Create profile if it doesn't exist
      const profileToInsert = {
        userId,
        phoneNumber: updates.phoneNumber || null,
        demographics: updates.demographics || null,
      };
      return await this.createPatientProfile(profileToInsert);
    }
    
    // Build update object, preserving existing values when new ones are not provided
    const profileToUpdate: Partial<InsertPatientProfile> = {};
    
    // Handle phoneNumber
    if (updates.phoneNumber !== undefined) {
      profileToUpdate.phoneNumber = updates.phoneNumber || null;
    }
    
    // Handle demographics - merge with existing if provided
    if (updates.demographics !== undefined) {
      if (updates.demographics === null) {
        // Clear demographics
        profileToUpdate.demographics = null;
      } else {
        const existingDemographics = existingProfile.demographics || {};
        profileToUpdate.demographics = {
          age: updates.demographics.age !== undefined && updates.demographics.age !== null 
            ? (typeof updates.demographics.age === 'number' ? updates.demographics.age : existingDemographics.age)
            : (updates.demographics.age === null ? null : existingDemographics.age),
          gender: updates.demographics.gender !== undefined 
            ? (updates.demographics.gender || null) 
            : existingDemographics.gender,
          procedure: updates.demographics.procedure !== undefined 
            ? (updates.demographics.procedure || null) 
            : existingDemographics.procedure,
        };
      }
    }
    
    // Only update if there are changes
    if (Object.keys(profileToUpdate).length === 0) {
      return existingProfile;
    }
    
    const database = await this.db();
    const [updated] = await database
      .update(patientProfiles)
      .set(profileToUpdate)
      .where(eq(patientProfiles.userId, userId))
      .returning();
    return updated;
  }

  // Doctor Profiles
  async createDoctorProfile(profile: InsertDoctorProfile): Promise<DoctorProfile> {
    const database = await this.db();
    const [created] = await database.insert(doctorProfiles).values(profile).returning();
    return created;
  }

  async getDoctorProfile(userId: string): Promise<DoctorProfile | undefined> {
    const database = await this.db();
    const [profile] = await database.select().from(doctorProfiles).where(eq(doctorProfiles.userId, userId));
    return profile;
  }

  async updateDoctorProfile(userId: string, updates: Partial<InsertDoctorProfile>): Promise<DoctorProfile | undefined> {
    const existingProfile = await this.getDoctorProfile(userId);
    if (!existingProfile) {
      // Create profile if it doesn't exist
      return await this.createDoctorProfile({
        userId,
        phoneNumber: updates.phoneNumber || "",
        specialty: updates.specialty || null,
        city: updates.city || null,
        available: updates.available !== undefined ? updates.available : true,
      });
    }
    
    // Build update object, only including fields that are provided
    const profileToUpdate: Partial<InsertDoctorProfile> = {};
    
    if (updates.phoneNumber !== undefined) {
      profileToUpdate.phoneNumber = updates.phoneNumber || "";
    }
    if (updates.specialty !== undefined) {
      profileToUpdate.specialty = updates.specialty || null;
    }
    if (updates.city !== undefined) {
      profileToUpdate.city = updates.city || null;
    }
    if (updates.available !== undefined) {
      profileToUpdate.available = updates.available;
    }
    
    // Only update if there are changes
    if (Object.keys(profileToUpdate).length === 0) {
      return existingProfile;
    }
    
    const database = await this.db();
    const [updated] = await database
      .update(doctorProfiles)
      .set(profileToUpdate)
      .where(eq(doctorProfiles.userId, userId))
      .returning();
    return updated;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const database = await this.db();
    const [updated] = await database
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  // Patient Connections
  async createPatientConnection(connection: InsertPatientConnection): Promise<PatientConnection> {
    const database = await this.db();
    const [created] = await database.insert(patientConnections).values(connection).returning();
    return created;
  }

  async getPatientConnection(id: string): Promise<PatientConnection | undefined> {
    const database = await this.db();
    const [connection] = await database.select().from(patientConnections).where(eq(patientConnections.id, id));
    return connection;
  }

  async getPatientConnectionByToken(token: string): Promise<PatientConnection | undefined> {
    const database = await this.db();
    const [connection] = await database.select().from(patientConnections).where(eq(patientConnections.inviteToken, token));
    return connection;
  }

  async updatePatientConnection(id: string, updates: Partial<PatientConnection>): Promise<PatientConnection | undefined> {
    const database = await this.db();
    const [updated] = await database.update(patientConnections).set(updates).where(eq(patientConnections.id, id)).returning();
    return updated;
  }

  async getConnectionsForPatient(patientId: string): Promise<PatientConnection[]> {
    const database = await this.db();
    const connections = await database.select().from(patientConnections)
      .where(or(
        eq(patientConnections.requesterPatientId, patientId),
        eq(patientConnections.targetPatientId, patientId)
      ))
      .orderBy(desc(patientConnections.createdAt));
    
    const result = [];
    for (const conn of connections) {
      const [requester] = await database.select().from(users).where(eq(users.id, conn.requesterPatientId));
      const target = conn.targetPatientId 
        ? (await database.select().from(users).where(eq(users.id, conn.targetPatientId)))[0]
        : null;
      result.push({ ...conn, requester, target });
    }
    return result;
  }

  async getAvailablePatients(excludeUserId: string): Promise<(User & { patientProfile?: PatientProfile | null })[]> {
    const database = await this.db();
    const patients = await database.select().from(users).where(
      and(eq(users.role, "PATIENT"), sql`${users.id} != ${excludeUserId}`)
    );
    
    const result = [];
    for (const patient of patients) {
      const [profile] = await database.select().from(patientProfiles).where(eq(patientProfiles.userId, patient.id));
      result.push({ ...patient, patientProfile: profile || null });
    }
    return result;
  }

  // Survey Requests
  async createSurveyRequest(request: InsertSurveyRequest): Promise<SurveyRequest> {
    const database = await this.db();
    const [created] = await database.insert(surveyRequests).values(request).returning();
    return created;
  }

  async getSurveyRequest(id: string): Promise<SurveyRequest | undefined> {
    const database = await this.db();
    const [request] = await database.select().from(surveyRequests).where(eq(surveyRequests.id, id));
    return request;
  }

  async updateSurveyRequest(id: string, updates: Partial<SurveyRequest>): Promise<SurveyRequest | undefined> {
    const database = await this.db();
    const [updated] = await database.update(surveyRequests).set(updates).where(eq(surveyRequests.id, id)).returning();
    return updated;
  }

  async getSurveysForDoctor(doctorId: string): Promise<(SurveyRequest & { patient?: User | null })[]> {
    const database = await this.db();
    const surveys = await database.select().from(surveyRequests)
      .where(eq(surveyRequests.doctorId, doctorId))
      .orderBy(desc(surveyRequests.createdAt));
    
    const result = [];
    for (const survey of surveys) {
      const [patient] = await database.select().from(users).where(eq(users.id, survey.patientId));
      result.push({ ...survey, patient });
    }
    return result;
  }

  async getSurveysForPatient(patientId: string): Promise<SurveyRequest[]> {
    const database = await this.db();
    return database.select().from(surveyRequests)
      .where(eq(surveyRequests.patientId, patientId))
      .orderBy(desc(surveyRequests.createdAt));
  }

  // Doctor Calls
  async createDoctorCall(call: InsertDoctorCall): Promise<DoctorCall> {
    const database = await this.db();
    const [created] = await database.insert(doctorCalls).values(call).returning();
    return created;
  }

  async getDoctorCall(id: string): Promise<DoctorCall | undefined> {
    const database = await this.db();
    const [call] = await database.select().from(doctorCalls).where(eq(doctorCalls.id, id));
    return call;
  }

  async updateDoctorCall(id: string, updates: Partial<DoctorCall>): Promise<DoctorCall | undefined> {
    const database = await this.db();
    const [updated] = await database.update(doctorCalls).set(updates).where(eq(doctorCalls.id, id)).returning();
    return updated;
  }

  async getCallsForDoctor(doctorId: string): Promise<DoctorCall[]> {
    const database = await this.db();
    return database.select().from(doctorCalls)
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
    const database = await this.db();
    const [created] = await database.insert(patientCalls).values(callToInsert).returning();
    return created;
  }

  async getPatientCall(id: string): Promise<PatientCall | undefined> {
    const database = await this.db();
    const [call] = await database.select().from(patientCalls).where(eq(patientCalls.id, id));
    return call;
  }

  async updatePatientCall(id: string, updates: Partial<PatientCall>): Promise<PatientCall | undefined> {
    const database = await this.db();
    const [updated] = await database.update(patientCalls).set(updates).where(eq(patientCalls.id, id)).returning();
    return updated;
  }

  // Link Records
  async createLinkRecord(record: InsertLinkRecord): Promise<LinkRecord> {
    const database = await this.db();
    const [created] = await database.insert(linkRecords).values(record).returning();
    return created;
  }

  async getLinkRecordByToken(token: string): Promise<(LinkRecord & { doctor?: (User & { doctorProfile?: DoctorProfile | null }) | null }) | undefined> {
    const database = await this.db();
    const [record] = await database.select().from(linkRecords).where(eq(linkRecords.qrToken, token));
    if (!record) return undefined;
    
    const [doctor] = await database.select().from(users).where(eq(users.id, record.doctorId));
    const [doctorProfile] = await database.select().from(doctorProfiles).where(eq(doctorProfiles.userId, record.doctorId));
    return { ...record, doctor: doctor ? { ...doctor, doctorProfile: doctorProfile || null } : null };
  }

  async getLinkRecordsForDoctor(doctorId: string): Promise<LinkRecord[]> {
    const database = await this.db();
    return database.select().from(linkRecords).where(eq(linkRecords.doctorId, doctorId));
  }

  async getLinkRecordsForPatient(patientId: string): Promise<LinkRecord[]> {
    const database = await this.db();
    return database.select().from(linkRecords).where(eq(linkRecords.patientId, patientId));
  }

  async isPatientLinkedToDoctor(patientId: string, doctorId: string): Promise<boolean> {
    const database = await this.db();
    const [record] = await database.select().from(linkRecords).where(
      and(eq(linkRecords.patientId, patientId), eq(linkRecords.doctorId, doctorId))
    );
    return !!record;
  }

  // Audit Logs
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const database = await this.db();
    const [created] = await database.insert(auditLogs).values(log).returning();
    return created;
  }

  // Doctors
  async getAvailableDoctors(): Promise<(User & { doctorProfile?: DoctorProfile | null })[]> {
    const database = await this.db();
    const doctors = await database.select().from(users).where(eq(users.role, "DOCTOR"));
    
    const result = [];
    for (const doctor of doctors) {
      const [profile] = await database.select().from(doctorProfiles).where(eq(doctorProfiles.userId, doctor.id));
      result.push({ ...doctor, doctorProfile: profile || null });
    }
    return result;
  }

  async getDoctorByQrToken(token: string): Promise<(User & { doctorProfile?: DoctorProfile | null }) | undefined> {
    const database = await this.db();
    const [record] = await database.select().from(linkRecords).where(eq(linkRecords.qrToken, token));
    if (!record) return undefined;
    
    const [doctor] = await database.select().from(users).where(eq(users.id, record.doctorId));
    if (!doctor) return undefined;
    
    const [profile] = await database.select().from(doctorProfiles).where(eq(doctorProfiles.userId, doctor.id));
    return { ...doctor, doctorProfile: profile || null };
  }
}

export const storage = new DatabaseStorage();
