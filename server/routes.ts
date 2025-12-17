import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { 
  patientSignupSchema, 
  doctorSignupSchema, 
  loginSchema,
  users,
  type User 
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import { redcapService } from "./services/redcap";
import { assemblyAIService } from "./services/assemblyai";
import { groqService } from "./services/groq";
import { pdfGenerator } from "./services/pdf-generator";
import { googleCalendarService } from "./services/google-calendar";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(key, "hex"), derivedKey);
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      role: "PATIENT" | "DOCTOR";
      passwordHash: string;
      createdAt: Date;
    }
  }
}

// Extend express-session to include Google OAuth tokens
declare module "express-session" {
  interface SessionData {
    googleAccessToken?: string;
    googleRefreshToken?: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function requireRole(role: "PATIENT" | "DOCTOR") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (req.user?.role !== role) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Trust proxy (required for Render and other hosting platforms)
  // This allows Express to trust the X-Forwarded-* headers from the reverse proxy
  app.set("trust proxy", 1);
  
  // Session setup
  const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
  
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production", // Requires HTTPS in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax", // Use 'lax' for same-site requests
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Passport configuration
  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) {
            return done(null, false, { message: "Invalid credentials" });
          }
          // Check if user is a Firebase user (no password hash)
          if (!user.passwordHash) {
            return done(null, false, { message: "Please sign in with Google" });
          }
          const isValid = await verifyPassword(password, user.passwordHash);
          if (!isValid) {
            return done(null, false, { message: "Invalid credentials" });
          }
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || false);
    } catch (err) {
      done(err);
    }
  });

  // Initialize SendGrid
  if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  }

  // Initialize REDCap (triggers lazy initialization to verify config)
  console.log("\n=== REDCap Configuration Check ===");
  const isRedcapConfigured = redcapService.isConfigured();
  console.log(`  REDCap Status: ${isRedcapConfigured ? '✓ CONFIGURED' : '✗ NOT CONFIGURED'}`);
  if (!isRedcapConfigured) {
    console.log(`  REDCAP_API_URL: ${process.env.REDCAP_API_URL ? 'SET' : 'NOT SET'}`);
    console.log(`  REDCAP_API_KEY: ${process.env.REDCAP_API_KEY ? 'SET' : 'NOT SET'}`);
  }
  console.log("===================================\n");

  // Initialize Twilio
  let twilioClient = null;
  
  // Debug: Check environment variables at routes registration time
  console.log("\n=== Twilio Initialization (routes.ts) ===");
  console.log(`  process.env.TWILIO_ACCOUNT_SID: ${process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.substring(0, 4)}...` : 'NOT SET'}`);
  console.log(`  process.env.TWILIO_AUTH_TOKEN: ${process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'NOT SET'}`);
  console.log(`  All env vars starting with TWILIO:`, Object.keys(process.env).filter(k => k.startsWith('TWILIO')));
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  // Only initialize if credentials are valid (not placeholders)
  if (accountSid && authToken && 
      accountSid.startsWith('AC') && 
      accountSid !== 'your-twilio-account-sid' &&
      authToken !== 'your-twilio-auth-token') {
    try {
      twilioClient = twilio(accountSid, authToken);
      console.log("✓ Twilio client initialized successfully");
      console.log(`  TWILIO_PHONE_NUMBER: ${process.env.TWILIO_PHONE_NUMBER || "NOT SET"}`);
    } catch (error: any) {
      console.log("✗ Failed to initialize Twilio client:");
      console.log(`  Error: ${error.message}`);
      twilioClient = null;
    }
  } else {
    // Twilio initialization skipped - feature is optional
    twilioClient = null;
  }

  // =====================
  // AUTH ROUTES
  // =====================

  app.post("/api/auth/signup/patient", async (req, res) => {
    try {
      const data = patientSignupSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const passwordHash = await hashPassword(data.password);
      const user = await storage.createUser({
        email: data.email,
        passwordHash,
        name: data.name,
        role: "PATIENT",
      });

      await storage.createPatientProfile({
        userId: user.id,
        phoneNumber: data.phoneNumber || null,
        demographics: {
          age: data.age,
          gender: data.gender,
          procedure: data.procedure,
        },
      });

      await storage.createAuditLog({
        userId: user.id,
        action: "USER_SIGNUP",
        resourceType: "user",
        resourceId: user.id,
        metadata: { role: "PATIENT" },
      });

      res.status(201).json({ message: "Account created successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Signup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/signup/doctor", async (req, res) => {
    try {
      const data = doctorSignupSchema.parse(req.body);
      
      const existingUser = await storage.getUserByEmail(data.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const passwordHash = await hashPassword(data.password);
      const user = await storage.createUser({
        email: data.email,
        passwordHash,
        name: data.name,
        role: "DOCTOR",
      });

      await storage.createDoctorProfile({
        userId: user.id,
        phoneNumber: data.phoneNumber,
        specialty: data.specialty || null,
        city: data.city || null,
        available: true,
      });

      await storage.createAuditLog({
        userId: user.id,
        action: "USER_SIGNUP",
        resourceType: "user",
        resourceId: user.id,
        metadata: { role: "DOCTOR" },
      });

      res.status(201).json({ message: "Account created successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Signup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    try {
      loginSchema.parse(req.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
    }

    passport.authenticate("local", (err: Error, user: User, info: { message: string }) => {
      if (err) {
        console.error("Login error in passport.authenticate:", err);
        return res.status(500).json({ message: "Internal server error" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.logIn(user, (err) => {
        if (err) {
          console.error("Login error in req.logIn:", err);
          return res.status(500).json({ message: "Internal server error" });
        }
        storage.createAuditLog({
          userId: user.id,
          action: "USER_LOGIN",
          resourceType: "user",
          resourceId: user.id,
        }).catch((auditError) => {
          console.error("Error creating audit log:", auditError);
          // Don't fail login if audit log fails
        });
        return res.json({ message: "Logged in successfully" });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    if (req.user) {
      storage.createAuditLog({
        userId: req.user.id,
        action: "USER_LOGOUT",
        resourceType: "user",
        resourceId: req.user.id,
      });
    }
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // Firebase authentication endpoints
  app.post("/api/auth/firebase/login", async (req, res) => {
    try {
      const { firebaseUid, email, name, photoURL, role } = req.body;
      
      if (!firebaseUid || !email) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Check if user exists by email first
      let existingUser = await storage.getUserByEmail(email);
      
      // If not found by email, check by Firebase UID
      if (!existingUser) {
        existingUser = await storage.getUserByFirebaseUid(firebaseUid);
      }

      if (existingUser) {
        // Update Firebase UID if not set
        if (!existingUser.firebaseUid) {
          await storage.updateUser(existingUser.id, { firebaseUid });
          // Refresh user data
          existingUser = await storage.getUser(existingUser.id);
          if (!existingUser) {
            return res.status(500).json({ message: "Failed to update user" });
          }
        }
        
        // Log in the user using Promise wrapper
        await new Promise<void>((resolve, reject) => {
          req.logIn(existingUser, (err) => {
            if (err) {
              console.error("Login error:", err);
              reject(err);
              return;
            }
            resolve();
          });
        });
        
        // Save session explicitly
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error("Session save error:", err);
              reject(err);
              return;
            }
            resolve();
          });
        });
        
        storage.createAuditLog({
          userId: existingUser.id,
          action: "USER_LOGIN",
          resourceType: "user",
          resourceId: existingUser.id,
          metadata: { method: "firebase" },
        }).catch(console.error);
        
        return res.json({ message: "Logged in successfully", user: existingUser });
      } else {
        return res.status(404).json({ message: "User not found. Please sign up first." });
      }
    } catch (error) {
      console.error("Firebase login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/firebase/signup", async (req, res) => {
    try {
      const { firebaseUid, email, name, photoURL, role } = req.body;
      
      if (!firebaseUid || !email || !name || !role) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      if (role !== "PATIENT" && role !== "DOCTOR") {
        return res.status(400).json({ message: "Invalid role" });
      }

      // Check if user already exists by email
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Check if Firebase UID already exists
      const existingFirebaseUser = await storage.getUserByFirebaseUid(firebaseUid);
      if (existingFirebaseUser) {
        return res.status(400).json({ message: "Firebase account already registered" });
      }

      // Create user without password hash
      const user = await storage.createUser({
        email,
        name,
        role: role as "PATIENT" | "DOCTOR",
        firebaseUid,
        passwordHash: null, // Firebase users don't have password hash
      });

      // Create profile based on role
      if (role === "PATIENT") {
        await storage.createPatientProfile({
          userId: user.id,
          phoneNumber: null,
          demographics: null,
        });
      } else {
        await storage.createDoctorProfile({
          userId: user.id,
          phoneNumber: "",
          specialty: null,
          city: null,
          available: true,
        });
      }

      await storage.createAuditLog({
        userId: user.id,
        action: "USER_SIGNUP",
        resourceType: "user",
        resourceId: user.id,
        metadata: { role, method: "firebase" },
      });

      // Log in the user using Promise wrapper
      await new Promise<void>((resolve, reject) => {
        req.logIn(user, (err) => {
          if (err) {
            console.error("Login error:", err);
            reject(err);
            return;
          }
          resolve();
        });
      });
      
      // Save session explicitly
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            reject(err);
            return;
          }
          resolve();
        });
      });
      
      return res.status(201).json({ message: "Account created successfully", user });
    } catch (error) {
      console.error("Firebase signup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserWithProfile(req.user.id);
    res.json({ user });
  });

  app.put("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const { name, phoneNumber, demographics, specialty, city, education, experience, institution, languages, shortBio, linkedinUrl, showMatchPercentage } = req.body;
      
      // Update user name if provided
      if (name !== undefined && name !== null) {
        await storage.updateUser(req.user!.id, { name: name.trim() });
      }

      // Update profile based on role
      if (req.user!.role === "PATIENT") {
        const profileUpdates: any = {};
        if (phoneNumber !== undefined) {
          profileUpdates.phoneNumber = phoneNumber === null || phoneNumber === "" ? null : phoneNumber;
        }
        if (demographics !== undefined) {
          // Handle demographics - if it's an object with all null values, set to null
          if (demographics && typeof demographics === 'object') {
            const hasValues = (demographics.age !== null && demographics.age !== undefined) ||
                            (demographics.gender !== null && demographics.gender !== undefined) ||
                            (demographics.procedure !== null && demographics.procedure !== undefined);
            profileUpdates.demographics = hasValues ? demographics : null;
          } else {
            profileUpdates.demographics = demographics;
          }
        }
        if (showMatchPercentage !== undefined) {
          profileUpdates.showMatchPercentage = showMatchPercentage === true || showMatchPercentage === 1;
        }
        if (Object.keys(profileUpdates).length > 0) {
          await storage.updatePatientProfile(req.user!.id, profileUpdates);
        }
      } else if (req.user!.role === "DOCTOR") {
        const profileUpdates: any = {};
        if (phoneNumber !== undefined) {
          profileUpdates.phoneNumber = phoneNumber || "";
        }
        if (specialty !== undefined) {
          profileUpdates.specialty = specialty === null || specialty === "" ? null : specialty;
        }
        if (city !== undefined) {
          profileUpdates.city = city === null || city === "" ? null : city;
        }
        if (education !== undefined) {
          profileUpdates.education = education === null || education === "" ? null : education;
        }
        if (experience !== undefined) {
          profileUpdates.experience = experience === null || experience === "" ? null : experience;
        }
        if (institution !== undefined) {
          profileUpdates.institution = institution === null || institution === "" ? null : institution;
        }
        if (languages !== undefined) {
          profileUpdates.languages = languages === null || languages === "" ? null : languages;
        }
        if (shortBio !== undefined) {
          profileUpdates.shortBio = shortBio === null || shortBio === "" ? null : shortBio;
        }
        if (linkedinUrl !== undefined) {
          profileUpdates.linkedinUrl = linkedinUrl === null || linkedinUrl === "" ? null : linkedinUrl;
        }
        if (Object.keys(profileUpdates).length > 0) {
          await storage.updateDoctorProfile(req.user!.id, profileUpdates);
        }
      }

      // Return updated user
      const updatedUser = await storage.getUserWithProfile(req.user!.id);
      res.json({ user: updatedUser });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =====================
  // PATIENT ROUTES
  // =====================

  app.get("/api/patient/available", requireRole("PATIENT"), async (req, res) => {
    try {
      const patients = await storage.getAvailablePatients(req.user!.id);
      res.json(patients);
    } catch (error) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/patient/matches", requireRole("PATIENT"), async (req, res) => {
    try {
      const currentUser = await storage.getUserWithProfile(req.user!.id);
      if (!currentUser || !currentUser.patientProfile) {
        return res.status(404).json({ message: "Patient profile not found" });
      }

      // Check if current user has consented to show match percentages
      if (!currentUser.patientProfile.showMatchPercentage) {
        return res.status(403).json({ 
          message: "You must enable match percentages in your settings to view matches" 
        });
      }

      // Get all available patients
      const allPatients = await storage.getAvailablePatients(req.user!.id);
      
      // Calculate matches for each patient
      const matches = [];
      for (const patient of allPatients) {
        if (!patient.patientProfile) continue;
        
        // Only show match if the other patient has also consented
        if (!patient.patientProfile.showMatchPercentage) continue;
        
        // Only match patients with the same procedure type
        const currentProcedure = currentUser.patientProfile.demographics?.procedure;
        const patientProcedure = patient.patientProfile.demographics?.procedure;
        
        if (!currentProcedure || !patientProcedure || currentProcedure !== patientProcedure) {
          continue; // Skip if different procedures
        }
        
        // Calculate match percentage
        const { calculateMatchPercentage } = await import("./utils/patient-matching");
        const matchPercentage = calculateMatchPercentage(
          currentUser.patientProfile,
          patient.patientProfile
        );
        
        matches.push({
          ...patient,
          matchPercentage,
        });
      }
      
      // Sort by match percentage (highest first)
      matches.sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
      
      res.json(matches);
    } catch (error) {
      console.error("Error fetching matches:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/patient/connections", requireRole("PATIENT"), async (req, res) => {
    try {
      const connections = await storage.getConnectionsForPatient(req.user!.id);
      res.json(connections);
    } catch (error) {
      console.error("Error fetching connections:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Google OAuth2 endpoints
  app.get("/api/google/oauth/authorize", requireRole("PATIENT"), async (req, res) => {
    try {
      if (!googleCalendarService.isConfigured()) {
        return res.status(503).json({ message: "Google Calendar integration not configured" });
      }

      // Store connection ID in state for callback
      const connectionId = req.query.connectionId as string;
      const state = connectionId || req.user!.id;

      const authUrl = googleCalendarService.getAuthUrl(state);
      res.json({ authUrl });
    } catch (error) {
      console.error("Error generating OAuth URL:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/google/oauth/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code) {
        return res.redirect('/?error=oauth_denied');
      }

      // Exchange code for tokens
      const tokens = await googleCalendarService.getTokens(code as string);
      
      // Store tokens in session (could also store in database)
      req.session.googleAccessToken = tokens.access_token;
      if (tokens.refresh_token) {
        req.session.googleRefreshToken = tokens.refresh_token;
      }
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Redirect back to frontend with success
      const redirectUrl = state 
        ? `/dashboard?googleAuth=success&connectionId=${state}`
        : '/dashboard?googleAuth=success';
      res.redirect(redirectUrl);
    } catch (error) {
      console.error("OAuth callback error:", error);
      res.redirect('/?error=oauth_failed');
    }
  });

  // Generate Google Meet link for patient connection
  app.post("/api/patient/connection/:connectionId/google-meet", requireRole("PATIENT"), async (req, res) => {
    try {
      const { connectionId } = req.params;
      const connection = await storage.getPatientConnection(connectionId);
      
      if (!connection) {
        return res.status(404).json({ message: "Connection not found" });
      }

      // Verify the user is part of this connection
      if (connection.requesterPatientId !== req.user!.id && connection.targetPatientId !== req.user!.id) {
        return res.status(403).json({ message: "You don't have access to this connection" });
      }

      // Get the other user's information for the meeting
      const requester = await storage.getUser(connection.requesterPatientId);
      const target = connection.targetPatientId ? await storage.getUser(connection.targetPatientId) : null;
      const otherUser = connection.requesterPatientId === req.user!.id ? target : requester;
      const currentUser = connection.requesterPatientId === req.user!.id ? requester : target;
      
      const meetingTitle = `Peer Support Meeting: ${currentUser?.name} & ${otherUser?.name || 'Peer'}`;

      // Always generate a new instant meeting link
      // meet.google.com/new creates a new instant meeting
      const meetLink = googleCalendarService.generateInstantMeetingLink();
      
      // Store that we've created an instant meeting (don't store the actual URL since it's always /new)
      if (connection.googleMeetLink !== 'instant') {
        await storage.updatePatientConnection(connectionId, { 
          googleMeetLink: 'instant'
        });
      }

      res.json({ 
        googleMeetLink: meetLink
      });
    } catch (error) {
      console.error("Error generating Google Meet link:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/patient/surveys", requireRole("PATIENT"), async (req, res) => {
    try {
      const surveys = await storage.getSurveysForPatient(req.user!.id);
      
      // Fetch doctor information for each survey
      const surveysWithDoctor = await Promise.all(
        surveys.map(async (survey) => {
          if (survey.doctorId) {
            try {
              const doctor = await storage.getUser(survey.doctorId);
              return {
                ...survey,
                doctor: doctor ? {
                  id: doctor.id,
                  name: doctor.name,
                  email: doctor.email,
                } : null,
              };
            } catch (error) {
              return { ...survey, doctor: null };
            }
          }
          return { ...survey, doctor: null };
        })
      );
      
      res.json(surveysWithDoctor);
    } catch (error) {
      console.error("Error fetching surveys:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/patient/linked-doctors", requireRole("PATIENT"), async (req, res) => {
    try {
      const records = await storage.getLinkRecordsForPatient(req.user!.id);
      
      // Fetch doctor information for each link record
      const linkedDoctors = [];
      for (const record of records) {
        const doctor = await storage.getUserWithProfile(record.doctorId);
        if (doctor && doctor.doctorProfile) {
          linkedDoctors.push({
            ...record,
            doctor: {
              id: doctor.id,
              name: doctor.name,
              email: doctor.email,
              doctorProfile: doctor.doctorProfile,
            },
          });
        }
      }
      
      res.json(linkedDoctors);
    } catch (error) {
      console.error("Error fetching linked doctors:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/patient/invite", requireRole("PATIENT"), async (req, res) => {
    try {
      const { toEmail } = req.body;
      if (!toEmail || typeof toEmail !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const inviteToken = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const targetUser = await storage.getUserByEmail(toEmail);

      const connection = await storage.createPatientConnection({
        requesterPatientId: req.user!.id,
        targetPatientId: targetUser?.id || null,
        targetEmail: toEmail,
        status: "PENDING",
        inviteToken,
        expiresAt,
      });

      // Send email invitation
      if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
        const inviteUrl = `${process.env.APP_URL || 'http://localhost:5000'}/invite/${inviteToken}`;
        try {
          await sgMail.send({
            to: toEmail,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: `${req.user!.name} wants to connect with you on TeddyBridge`,
            html: `
              <h2>You've received a connection request!</h2>
              <p>${req.user!.name} would like to connect with you on TeddyBridge for peer support during your healthcare journey.</p>
              <p><a href="${inviteUrl}">Click here to accept</a></p>
              <p>This invitation expires in 7 days.</p>
            `,
          });
        } catch (emailError) {
          console.error("Email sending failed:", emailError);
        }
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "CONNECTION_INVITE_SENT",
        resourceType: "patient_connection",
        resourceId: connection.id,
        metadata: { toEmail },
      });

      res.status(201).json(connection);
    } catch (error) {
      console.error("Error creating invite:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/patient/invite/accept", requireRole("PATIENT"), async (req, res) => {
    try {
      const { inviteToken } = req.body;
      if (!inviteToken) {
        return res.status(400).json({ message: "Invite token is required" });
      }

      const connection = await storage.getPatientConnectionByToken(inviteToken);
      if (!connection) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      if (connection.expiresAt < new Date()) {
        return res.status(400).json({ message: "Invitation has expired" });
      }

      if (connection.status !== "PENDING") {
        return res.status(400).json({ message: "Invitation already processed" });
      }

      const updated = await storage.updatePatientConnection(connection.id, {
        status: "CONFIRMED",
        targetPatientId: req.user!.id,
        confirmedAt: new Date(),
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "CONNECTION_ACCEPTED",
        resourceType: "patient_connection",
        resourceId: connection.id,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error accepting invite:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/patient/invite/decline", requireRole("PATIENT"), async (req, res) => {
    try {
      const { inviteToken } = req.body;
      if (!inviteToken) {
        return res.status(400).json({ message: "Invite token is required" });
      }

      const connection = await storage.getPatientConnectionByToken(inviteToken);
      if (!connection) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      const updated = await storage.updatePatientConnection(connection.id, {
        status: "DECLINED",
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "CONNECTION_DECLINED",
        resourceType: "patient_connection",
        resourceId: connection.id,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error declining invite:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/patient/call/schedule", requireRole("PATIENT"), async (req, res) => {
    try {
      const { targetPatientId, scheduledAt, durationMinutes } = req.body;
      if (!targetPatientId || !scheduledAt) {
        return res.status(400).json({ message: "Target patient and scheduled time are required" });
      }

      const connections = await storage.getConnectionsForPatient(req.user!.id);
      const connection = connections.find(
        c => c.status === "CONFIRMED" && 
        (c.requesterPatientId === targetPatientId || c.targetPatientId === targetPatientId)
      );

      if (!connection) {
        return res.status(400).json({ message: "You must be connected to schedule a call" });
      }

      const updated = await storage.updatePatientConnection(connection.id, {
        scheduledAt: new Date(scheduledAt),
      });

      // Send email notification
      const targetUser = await storage.getUser(targetPatientId);
      if (targetUser && process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
        try {
          await sgMail.send({
            to: targetUser.email,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: `${req.user!.name} scheduled a call with you on TeddyBridge`,
            html: `
              <h2>Call Scheduled!</h2>
              <p>${req.user!.name} has scheduled a call with you.</p>
              <p><strong>Date/Time:</strong> ${new Date(scheduledAt).toLocaleString()}</p>
              <p><strong>Duration:</strong> ${durationMinutes || 30} minutes</p>
              <p>You will receive a phone call at your registered number at the scheduled time.</p>
            `,
          });
        } catch (emailError) {
          console.error("Email sending failed:", emailError);
        }
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "CALL_SCHEDULED",
        resourceType: "patient_connection",
        resourceId: connection.id,
        metadata: { targetPatientId, scheduledAt },
      });

      res.json(updated);
    } catch (error) {
      console.error("Error scheduling call:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/patient/call/initiate", requireRole("PATIENT"), async (req, res) => {
    try {
      const { targetPatientId, mode } = req.body;
      if (!targetPatientId) {
        return res.status(400).json({ message: "Target patient is required" });
      }

      // Check if patients are connected
      const connections = await storage.getConnectionsForPatient(req.user!.id);
      const isConnected = connections.some(
        conn => (conn.requesterPatientId === req.user!.id && conn.targetPatientId === targetPatientId && conn.status === "CONFIRMED") ||
                (conn.requesterPatientId === targetPatientId && conn.targetPatientId === req.user!.id && conn.status === "CONFIRMED")
      );

      if (!isConnected) {
        return res.status(400).json({ message: "You must be connected to this patient before calling" });
      }

      const patientProfile = await storage.getPatientProfile(req.user!.id);
      const targetProfile = await storage.getPatientProfile(targetPatientId);

      if (!patientProfile?.phoneNumber || !targetProfile?.phoneNumber) {
        return res.status(400).json({ message: "Both participants must have verified phone numbers" });
      }

      const conferenceName = `patient-call-${generateToken().slice(0, 16)}`;
      
      const call = await storage.createPatientCall({
        requesterPatientId: req.user!.id,
        targetPatientId,
        twilioConferenceName: conferenceName,
        mode: mode || "voice",
        isLive: false, // Will be set to true when calls connect
        startedAt: new Date(),
      });

      // Initiate Twilio conference call
      if (!twilioClient) {
        console.log("Twilio client not initialized. Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
        return res.status(400).json({ 
          ...call, 
          mock: true,
          message: "Twilio not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables." 
        });
      }

      if (!process.env.TWILIO_PHONE_NUMBER) {
        console.log("TWILIO_PHONE_NUMBER not set");
        return res.status(400).json({ 
          ...call, 
          mock: true,
          message: "Twilio phone number not configured. Please set TWILIO_PHONE_NUMBER environment variable." 
        });
      }

      try {
        let baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
        
        // Check if URL is localhost - use inline TwiML for local development
        const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
        
        if (isLocalhost) {
          console.warn("⚠️  WARNING: Using localhost. For production, use a publicly accessible URL.");
          console.warn("   For local development with Twilio, use ngrok:");
          console.warn("   1. Run in separate terminal: ngrok http 5000");
          console.warn("   2. Set APP_URL in .env to the ngrok HTTPS URL");
          console.warn("   Using inline TwiML as fallback (may not work for all Twilio features)...");
        }

        console.log(`Initiating Twilio calls: Requester ${patientProfile.phoneNumber}, Target ${targetProfile.phoneNumber}`);
        
        // Use inline TwiML for localhost, URL for public URLs
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference>${conferenceName}</Conference></Dial></Response>`;
        
        let callOptions: any = {
            to: patientProfile.phoneNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
        };
        
        if (isLocalhost) {
          // Use inline TwiML for localhost
          callOptions.twiml = twiml;
          console.log(`Using inline TwiML (localhost mode)`);
        } else {
          // Use URL for public servers
          const twimlUrl = `${baseUrl}/api/twilio/twiml/conference?conference=${encodeURIComponent(conferenceName)}`;
          callOptions.url = twimlUrl;
          callOptions.statusCallback = `${baseUrl}/api/twilio/webhook/status`;
          callOptions.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
          console.log(`TwiML URL: ${twimlUrl}`);
        }

        // Call requester
        const requesterCall = await twilioClient.calls.create(callOptions);

        console.log(`Requester call SID: ${requesterCall.sid}`);

        // Call target (same options, different number)
        const targetCallOptions = { ...callOptions, to: targetProfile.phoneNumber };
        const targetCall = await twilioClient.calls.create(targetCallOptions);

        console.log(`Target call SID: ${targetCall.sid}`);

        // Store call SIDs
        await storage.updatePatientCall(call.id, {
          twilioCallSids: [requesterCall.sid, targetCall.sid],
        });

        // Update call to live when both participants join
        setTimeout(async () => {
          await storage.updatePatientCall(call.id, { isLive: true });
        }, 5000);
      } catch (twilioError: any) {
          console.error("Twilio call failed:", twilioError);
        console.error("Error details:", {
          message: twilioError.message,
          code: twilioError.code,
          status: twilioError.status,
          moreInfo: twilioError.moreInfo,
        });
        // Update call status
        await storage.updatePatientCall(call.id, { isLive: false, endedAt: new Date() });
        return res.status(500).json({ 
          message: "Failed to initiate call", 
          error: twilioError.message || "Twilio service error",
          code: twilioError.code,
        });
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "PATIENT_CALL_INITIATED",
        resourceType: "patient_call",
        resourceId: call.id,
        metadata: { targetPatientId, mode },
      });

      res.json(call);
    } catch (error) {
      console.error("Error initiating call:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =====================
  // DOCTOR ROUTES
  // =====================

  app.get("/api/doctor/available", requireRole("DOCTOR"), async (req, res) => {
    try {
      const doctors = await storage.getAvailableDoctors();
      res.json(doctors);
    } catch (error) {
      console.error("Error fetching doctors:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/doctor/surveys", requireRole("DOCTOR"), async (req, res) => {
    try {
      const surveys = await storage.getSurveysForDoctor(req.user!.id);
      res.json(surveys);
    } catch (error) {
      console.error("Error fetching surveys:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/doctor/linked-patients", requireRole("DOCTOR"), async (req, res) => {
    try {
      const records = await storage.getLinkRecordsForDoctor(req.user!.id);
      // Filter out placeholder records (where patientId === doctorId, created when QR code is generated)
      const actualLinks = records.filter(record => record.patientId !== record.doctorId);
      
      // Fetch patient information for each link record
      const linkedPatientsWithDetails = [];
      for (const record of actualLinks) {
        const patient = await storage.getUserWithProfile(record.patientId);
        if (patient) {
          linkedPatientsWithDetails.push({
            ...record,
            patient: {
              id: patient.id,
              name: patient.name,
              email: patient.email,
              patientProfile: patient.patientProfile,
            },
          });
        }
      }
      
      res.json(linkedPatientsWithDetails);
    } catch (error) {
      console.error("Error fetching linked patients:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =====================
  // QR ROUTES
  // =====================

  app.post("/api/qr/create", requireRole("DOCTOR"), async (req, res) => {
    try {
      const qrToken = generateToken();
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

      // Store the QR token - we'll create a placeholder link record
      // The actual patient link will be created when they scan
      const linkUrl = `${process.env.APP_URL || 'http://localhost:5000'}/link/${qrToken}`;
      
      // Generate QR code URL using a free QR code API
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(linkUrl)}`;

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "QR_CODE_GENERATED",
        resourceType: "qr_code",
        metadata: { qrToken, expiresAt },
      });

      // Store the QR token in doctor profile or separate table
      // For now, we'll use a simple approach with link records
      await storage.createLinkRecord({
        patientId: req.user!.id, // Placeholder - will be updated when patient scans
        doctorId: req.user!.id,
        qrToken,
        expiresAt,
      });

      res.json({ qrCodeUrl, linkUrl, token: qrToken });
    } catch (error) {
      console.error("Error creating QR:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/qr/my-code", requireRole("DOCTOR"), async (req, res) => {
    try {
      const records = await storage.getLinkRecordsForDoctor(req.user!.id);
      const latestRecord = records.find(r => r.patientId === r.doctorId); // Placeholder record
      
      if (!latestRecord) {
        return res.status(404).json({ message: "No QR code found" });
      }

      const linkUrl = `${process.env.APP_URL || 'http://localhost:5000'}/link/${latestRecord.qrToken}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(linkUrl)}`;

      res.json({ qrCodeUrl, linkUrl, token: latestRecord.qrToken });
    } catch (error) {
      console.error("Error fetching QR:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/qr/verify", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Token is required" });
      }

      const records = await storage.getLinkRecordsForDoctor(token);
      // Find by token
      const record = (await storage.getLinkRecordByToken(token));
      
      if (!record) {
        // Try to find doctor by this QR token
        const allRecords = await storage.getAvailableDoctors();
        // Search in link records
        return res.status(404).json({ message: "Invalid or expired QR code" });
      }

      const doctor = await storage.getUserWithProfile(record.doctorId);
      if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
      }

      let isLinked = false;
      if (req.isAuthenticated() && req.user?.role === "PATIENT") {
        isLinked = await storage.isPatientLinkedToDoctor(req.user.id, doctor.id);
      }

      res.json({ doctor, isLinked });
    } catch (error) {
      console.error("Error verifying QR:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/qr/link", requireRole("PATIENT"), async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: "Token is required" });
      }

      const record = await storage.getLinkRecordByToken(token);
      if (!record) {
        return res.status(404).json({ message: "Invalid or expired QR code" });
      }

      // Check if already linked
      const isLinked = await storage.isPatientLinkedToDoctor(req.user!.id, record.doctorId);
      if (isLinked) {
        return res.status(400).json({ message: "Already linked to this doctor" });
      }

      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const linkRecord = await storage.createLinkRecord({
        patientId: req.user!.id,
        doctorId: record.doctorId,
        qrToken: generateToken(),
        expiresAt,
      });

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "PATIENT_LINKED_TO_DOCTOR",
        resourceType: "link_record",
        resourceId: linkRecord.id,
        metadata: { doctorId: record.doctorId },
      });

      res.json(linkRecord);
    } catch (error) {
      console.error("Error linking patient:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =====================
  // REDCAP / PROMS ROUTES
  // =====================

  app.post("/api/redcap/survey/send", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { patientId, when, formName } = req.body;
      if (!patientId || !when) {
        return res.status(400).json({ message: "Patient ID and survey type are required" });
      }

      const patient = await storage.getUser(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Generate or get REDCap survey link
      let redcapSurveyLink = process.env.REDCAP_SURVEY_LINK || "https://redcap.link/CarebridgeAI";
      let redcapRecordId: string | null = null;
      let redcapEvent: string | undefined = undefined;

      // If REDCap API is configured, try to create a record and get survey link
      if (redcapService.isConfigured()) {
        try {
          // Create a unique record ID using patient ID and timestamp
          const recordId = `${patientId.substring(0, 8)}-${Date.now()}`;
          
          // Create record in REDCap
          const recordData: any = {
            record_id: recordId,
          };
          
          // Add patient identifier if available
          if (patient.email) {
            recordData.patient_email = patient.email;
          }
          recordData.patient_id = patientId;
          recordData.survey_type = when;
          recordData.survey_status = "SENT";
          
          const importResponse = await redcapService.importRecords([recordData]);
          
          if (importResponse.success) {
            redcapRecordId = recordId;
            console.log(`[Survey Send] Successfully created REDCap record ${recordId} for patient ${patient.email}`);
            
            // Get survey link for this record
            const surveyLinkResponse = await redcapService.exportSurveyLink(
              recordId,
              formName || `${when}_survey`,
              redcapEvent,
              "survey"
            );
            
            if (surveyLinkResponse.success && surveyLinkResponse.data) {
              redcapSurveyLink = surveyLinkResponse.data;
              console.log(`[Survey Send] Got survey link for record ${recordId}`);
            } else {
              console.warn(`[Survey Send] Failed to get survey link for record ${recordId}:`, surveyLinkResponse.error);
            }
          } else {
            console.error(`[Survey Send] Failed to create REDCap record for patient ${patient.email}:`, importResponse.error);
            console.error(`[Survey Send] Will use fallback static link`);
          }
        } catch (error) {
          console.error("[Survey Send] Error creating REDCap record:", error);
          // Continue with static link if REDCap fails
        }
      }

      // Create survey request
      const surveyRequest = await storage.createSurveyRequest({
        patientId,
        doctorId: req.user!.id,
        formName: formName || `${when}_survey`,
        when,
        status: "SENT",
        surveyLink: redcapSurveyLink,
        redcapRecordId: redcapRecordId || null,
        redcapEvent: redcapEvent || null,
      });

      // Send email with survey link
      if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) {
        try {
          await sgMail.send({
            to: patient.email,
            from: process.env.SENDGRID_FROM_EMAIL,
            subject: `PROMS Survey from ${req.user!.name} - TeddyBridge`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">Please Complete Your ${when === 'preop' ? 'Pre-Operative' : 'Post-Operative'} Survey</h2>
              <p>Dr. ${req.user!.name} has requested that you complete a health outcomes survey.</p>
                <p>This survey helps your care team track your progress and provide better care.</p>
                <div style="margin: 30px 0; text-align: center;">
                  <a href="${redcapSurveyLink}" 
                     style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                    Complete Survey
                  </a>
                </div>
                <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
                <p style="color: #2563eb; word-break: break-all; font-size: 12px;">${redcapSurveyLink}</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #666; font-size: 12px;">This is an automated message from TeddyBridge. Please do not reply to this email.</p>
              </div>
            `,
          });
        } catch (emailError) {
          console.error("Email sending failed:", emailError);
        }
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "SURVEY_SENT",
        resourceType: "survey_request",
        resourceId: surveyRequest.id,
        metadata: { patientId, when, surveyLink: redcapSurveyLink },
      });

      res.json(surveyRequest);
    } catch (error) {
      console.error("Error sending survey:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =====================
  // PROFESSIONAL REDCAP API ROUTES
  // =====================

  /**
   * Get real-time survey completion status from REDCap
   */
  app.get("/api/redcap/survey/status/:id", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSurveyRequest(req.params.id);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      // If REDCap API is configured, check real-time completion status
      if (redcapService.isConfigured()) {
        let recordId = survey.redcapRecordId;
        
        // If no record ID, try to find matching record
        if (!recordId) {
          const patient = await storage.getUser(survey.patientId);
          if (patient) {
            const allRecordsResponse = await redcapService.exportRecords();
            if (allRecordsResponse.success && allRecordsResponse.data) {
              const records = Array.isArray(allRecordsResponse.data) ? allRecordsResponse.data : [allRecordsResponse.data];
              const matchingRecord = records.find((record: any) => {
                if (patient.email && (record.patient_email === patient.email || record.email === patient.email)) {
                  return true;
                }
                if (record.patient_id === survey.patientId) {
                  return true;
                }
                return false;
              });
              
              if (matchingRecord) {
                recordId = matchingRecord.record_id || matchingRecord.recordId;
                // Update survey with found record ID
                await storage.updateSurveyRequest(survey.id, {
                  redcapRecordId: recordId,
                });
              }
            }
          }
        }

        if (recordId) {
          const completionStatus = await redcapService.checkSurveyCompletion(
            recordId,
            survey.formName || "survey",
            survey.redcapEvent || undefined
          );

          // Update survey status in database if completed
          if (completionStatus.completed && survey.status !== "COMPLETED") {
            // Fetch response data
            const response = await redcapService.getSurveyResponse(
              recordId,
              survey.formName || "survey",
              survey.redcapEvent || undefined
            );

            if (response.success && response.data) {
              const responseData = Array.isArray(response.data) ? response.data[0] : response.data;
              const existingResponse = await storage.getSurveyResponse(survey.id);
              if (!existingResponse) {
                await storage.createSurveyResponse({
                  surveyRequestId: survey.id,
                  redcapRecordId: recordId,
                  data: responseData,
                });
              }
            }

            await storage.updateSurveyRequest(survey.id, {
              status: "COMPLETED",
              completedAt: completionStatus.completionTime ? new Date(completionStatus.completionTime) : new Date(),
            });
          }

          return res.json({
            ...survey,
            redcapStatus: completionStatus,
          });
        }
      }

      res.json(survey);
    } catch (error) {
      console.error("Error fetching survey status:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Export survey responses from REDCap
   */
  app.get("/api/redcap/survey/responses/:surveyId", requireRole("DOCTOR"), async (req, res) => {
    try {
      const survey = await storage.getSurveyRequest(req.params.surveyId);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }

      if (!redcapService.isConfigured()) {
        return res.status(503).json({ message: "REDCap API not configured" });
      }

      if (!survey.redcapRecordId) {
        return res.status(400).json({ message: "Survey not linked to REDCap record" });
      }

      const response = await redcapService.getSurveyResponse(
        survey.redcapRecordId,
        survey.formName || "survey",
        survey.redcapEvent
      );

      if (!response.success) {
        return res.status(500).json({ message: response.error || "Failed to fetch survey responses" });
      }

      res.json({
        survey,
        responses: response.data,
      });
    } catch (error) {
      console.error("Error exporting survey responses:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Get all survey responses for a patient
   */
  app.get("/api/redcap/patient/:patientId/responses", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { patientId } = req.params;
      const surveys = await storage.getSurveysForPatient(patientId);

      if (!redcapService.isConfigured()) {
        return res.json({ surveys, responses: [] });
      }

      const responses = [];
      for (const survey of surveys) {
        if (survey.redcapRecordId) {
          const response = await redcapService.getSurveyResponse(
            survey.redcapRecordId,
            survey.formName || "survey",
            survey.redcapEvent
          );
          if (response.success) {
            responses.push({
              surveyId: survey.id,
              data: response.data,
            });
          }
        }
      }

      res.json({ surveys, responses });
    } catch (error) {
      console.error("Error fetching patient responses:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Sync survey statuses from REDCap (batch update)
   */
  app.post("/api/redcap/sync-statuses", requireRole("DOCTOR"), async (req, res) => {
    try {
      if (!redcapService.isConfigured()) {
        return res.status(503).json({ message: "REDCap API not configured" });
      }

      const surveys = await storage.getSurveysForDoctor(req.user!.id);
      const synced = [];
      const errors = [];

      for (const survey of surveys) {
        if (survey.redcapRecordId && (survey.status === "SENT" || survey.status === "PENDING")) {
          try {
            const completionStatus = await redcapService.checkSurveyCompletion(
              survey.redcapRecordId,
              survey.formName || "survey",
              survey.redcapEvent
            );

            if (completionStatus.completed) {
              await storage.updateSurveyRequest(survey.id, {
                status: "COMPLETED",
                completedAt: completionStatus.completionTime ? new Date(completionStatus.completionTime) : new Date(),
              });
              synced.push(survey.id);
            }
          } catch (error: any) {
            errors.push({ surveyId: survey.id, error: error.message });
          }
        }
      }

      res.json({
        synced: synced.length,
        errors: errors.length,
        details: { synced, errors },
      });
    } catch (error) {
      console.error("Error syncing survey statuses:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Get REDCap project information
   */
  app.get("/api/redcap/project/info", requireRole("DOCTOR"), async (req, res) => {
    try {
      if (!redcapService.isConfigured()) {
        return res.status(503).json({ message: "REDCap API not configured" });
      }

      const response = await redcapService.exportProjectInfo();
      if (!response.success) {
        return res.status(500).json({ message: response.error || "Failed to fetch project info" });
      }

      res.json(response.data);
    } catch (error) {
      console.error("Error fetching project info:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Get available REDCap instruments (surveys/forms)
   */
  app.get("/api/redcap/instruments", requireRole("DOCTOR"), async (req, res) => {
    try {
      if (!redcapService.isConfigured()) {
        return res.status(503).json({ message: "REDCap API not configured" });
      }

      const response = await redcapService.exportInstruments();
      if (!response.success) {
        return res.status(500).json({ message: response.error || "Failed to fetch instruments" });
      }

      res.json(response.data);
    } catch (error) {
      console.error("Error fetching instruments:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Get REDCap metadata (data dictionary)
   */
  app.get("/api/redcap/metadata", requireRole("DOCTOR"), async (req, res) => {
    try {
      if (!redcapService.isConfigured()) {
        return res.status(503).json({ message: "REDCap API not configured" });
      }

      const { form } = req.query;
      const forms = form ? [form as string] : undefined;

      const response = await redcapService.exportMetadata(forms);
      if (!response.success) {
        return res.status(500).json({ message: response.error || "Failed to fetch metadata" });
      }

      res.json(response.data);
    } catch (error) {
      console.error("Error fetching metadata:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Webhook endpoint for REDCap survey completion (can be called by REDCap or polling)
   */
  app.post("/api/redcap/webhook/survey-completed", async (req, res) => {
    try {
      const { record_id, instrument, completion_status } = req.body;
      
      if (!record_id || !instrument) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Find survey by REDCap record ID - need to search all surveys
      // We'll query directly from the database since we need to search across all doctors
      const { getDb } = await import("./db");
      const database = await getDb();
      const { surveyRequests } = await import("@shared/schema");
      const allSurveys = await database.select().from(surveyRequests);
      const survey = allSurveys.find(s => s.redcapRecordId === record_id);

      if (survey && completion_status === "2") { // 2 = Complete in REDCap
        // Fetch the actual response data
        if (redcapService.isConfigured()) {
          const response = await redcapService.getSurveyResponse(
            record_id,
            instrument,
            survey.redcapEvent || undefined
          );

          if (response.success && response.data) {
            const responseData = Array.isArray(response.data) ? response.data[0] : response.data;
            
            // Check if response already exists
            const existingResponse = await storage.getSurveyResponse(survey.id);
            if (!existingResponse) {
              // Store survey response
              await storage.createSurveyResponse({
                surveyRequestId: survey.id,
                redcapRecordId: record_id,
                data: responseData,
              });
            }
          }
        }

        // Update survey status if not already completed
        if (survey.status !== "COMPLETED") {
          await storage.updateSurveyRequest(survey.id, {
            status: "COMPLETED",
            completedAt: new Date(),
          });

          // Create audit log
          await storage.createAuditLog({
            userId: survey.doctorId || "",
            action: "SURVEY_COMPLETED",
            resourceType: "survey_request",
            resourceId: survey.id,
            metadata: { record_id, instrument },
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error processing survey completion webhook:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Polling endpoint to check and update survey completion statuses
   */
  app.post("/api/redcap/poll-surveys", requireRole("DOCTOR"), async (req, res) => {
    try {
      if (!redcapService.isConfigured()) {
        // Return 200 with empty result instead of 503 to avoid error logs
        return res.json({ updated: [], errors: [], message: "REDCap API not configured" });
      }

      const surveys = await storage.getSurveysForDoctor(req.user!.id);
      const pendingSurveys = surveys.filter(s => 
        s.status === "SENT" || s.status === "PENDING"
      );

      console.log(`[Poll] Starting survey polling for ${pendingSurveys.length} pending surveys`);

      const updated = [];
      const errors = [];

      for (const survey of pendingSurveys) {
        try {
          // If survey has redcapRecordId, check directly
          if (survey.redcapRecordId) {
            console.log(`[Poll] Checking survey ${survey.id} with recordId: ${survey.redcapRecordId}, formName: ${survey.formName}`);
            const completionStatus = await redcapService.checkSurveyCompletion(
              survey.redcapRecordId,
              survey.formName || "survey",
              survey.redcapEvent || undefined
            );

            console.log(`[Poll] Survey ${survey.id} completion status:`, completionStatus);

            if (completionStatus.completed) {
              console.log(`[Poll] Survey ${survey.id} is completed, updating status...`);
              // Fetch response data
              const response = await redcapService.getSurveyResponse(
                survey.redcapRecordId,
                survey.formName || "survey",
                survey.redcapEvent || undefined
              );

              if (response.success && response.data) {
                const responseData = Array.isArray(response.data) ? response.data[0] : response.data;
                
                // Check if response already exists
                const existingResponse = await storage.getSurveyResponse(survey.id);
                if (!existingResponse) {
                  await storage.createSurveyResponse({
                    surveyRequestId: survey.id,
                    redcapRecordId: survey.redcapRecordId,
                    data: responseData,
                  });
                }
              }

              // Update survey status
              await storage.updateSurveyRequest(survey.id, {
                status: "COMPLETED",
                completedAt: completionStatus.completionTime ? new Date(completionStatus.completionTime) : new Date(),
              });

              updated.push(survey.id);
            }
          } else {
            // If no redcapRecordId, try to find matching record by patient email or ID
            const patient = await storage.getUser(survey.patientId);
            if (patient) {
              try {
                // Export all records and try to match by patient identifier
                const allRecordsResponse = await redcapService.exportRecords();
                
                if (allRecordsResponse.success && allRecordsResponse.data) {
                  const records = Array.isArray(allRecordsResponse.data) ? allRecordsResponse.data : [allRecordsResponse.data];
                  
                  console.log(`[Poll] Checking ${records.length} REDCap records for survey ${survey.id} (patient: ${patient.email})`);
                  console.log(`[Poll] Looking for formName: ${survey.formName}, when: ${survey.when}`);
                  
                  // Try to find a matching record
                  // Look for records with patient email, patient_id, or created around the same time
                  const matchingRecord = records.find((record: any) => {
                    // Match by patient email if available (case-insensitive)
                    // Check multiple possible email field names
                    if (patient.email) {
                      const recordEmail = record.patient_email || 
                                        record.email || 
                                        record.patient_email_address || 
                                        record.email_address ||
                                        record.patientemail ||
                                        record.emailaddress;
                      if (recordEmail && typeof recordEmail === 'string' && recordEmail.toLowerCase().trim() === patient.email.toLowerCase().trim()) {
                        console.log(`[Poll] Found match by email: ${recordEmail} for survey ${survey.id}`);
                        return true;
                      }
                    }
                    
                    // Match by patient ID if available (check multiple field names)
                    const recordPatientId = record.patient_id || 
                                          record.patient_identifier || 
                                          record.patientid ||
                                          record.patientIdentifier;
                    if (recordPatientId && (recordPatientId === survey.patientId || recordPatientId === patient.id)) {
                      console.log(`[Poll] Found match by patient ID: ${recordPatientId} for survey ${survey.id}`);
                      return true;
                    }
                    
                    // Match by survey type and approximate time
                    const recordSurveyType = record.survey_type || record.when || record.surveytype;
                    if (recordSurveyType === survey.when || recordSurveyType === survey.formName?.replace('_survey', '')) {
                      // Try to extract timestamp from record_id if it's in the format we created
                      if (record.record_id && typeof record.record_id === 'string' && record.record_id.includes('-')) {
                        const parts = record.record_id.split('-');
                        if (parts.length > 1) {
                          const recordTime = parseInt(parts[parts.length - 1]) || 0;
                          const surveyTime = new Date(survey.createdAt).getTime();
                          // Check if record was created within 24 hours of survey creation
                          if (recordTime > 0 && Math.abs(recordTime - surveyTime) < 86400000) {
                            console.log(`[Poll] Found match by timestamp for survey ${survey.id}`);
                            return true;
                          }
                        }
                      }
                    }
                    
                    return false;
                  });

                  console.log(`[Poll] Matching result for survey ${survey.id}:`, matchingRecord ? `Found record ${matchingRecord.record_id || matchingRecord.recordId}` : 'No match found');
                  
                  // If no match found but we have records, log them for debugging
                  if (!matchingRecord && records.length > 0) {
                    console.log(`[Poll] Available REDCap records (first 3):`, records.slice(0, 3).map((r: any) => ({
                      record_id: r.record_id || r.recordId,
                      keys: Object.keys(r).slice(0, 15), // First 15 keys
                      email_fields: {
                        patient_email: r.patient_email || 'N/A',
                        email: r.email || 'N/A',
                        patient_email_address: r.patient_email_address || 'N/A',
                        email_address: r.email_address || 'N/A',
                      },
                      patient_id_fields: {
                        patient_id: r.patient_id || 'N/A',
                        patient_identifier: r.patient_identifier || 'N/A',
                      },
                      survey_type_fields: {
                        survey_type: r.survey_type || 'N/A',
                        when: r.when || 'N/A',
                      },
                      // Show actual email value if it exists in any field
                      actual_email_value: r.email || r.patient_email || r.patient_email_address || r.email_address || 'N/A'
                    })));
                    
                    // Fallback: Try checking all records for completion if formName matches
                    // This helps when records exist but matching failed
                    console.log(`[Poll] Attempting fallback: checking all records for completion status with formName: ${survey.formName}`);
                    for (const record of records.slice(0, 10)) { // Check first 10 records
                      const recordId = record.record_id || record.recordId;
                      if (!recordId) continue;
                      
                      try {
                        const completionStatus = await redcapService.checkSurveyCompletion(
                          recordId,
                          survey.formName || "survey",
                          survey.redcapEvent || undefined
                        );
                        
                        if (completionStatus.completed) {
                          console.log(`[Poll] ⚠️ Found completed record ${recordId} via fallback check! Linking to survey ${survey.id}`);
                          
                          // Update survey with this record ID
                          await storage.updateSurveyRequest(survey.id, {
                            redcapRecordId: recordId,
                          });
                          
                          // Fetch response data and update status
                          const response = await redcapService.getSurveyResponse(
                            recordId,
                            survey.formName || "survey",
                            survey.redcapEvent || undefined
                          );

                          if (response.success && response.data) {
                            const responseData = Array.isArray(response.data) ? response.data[0] : response.data;
                            const existingResponse = await storage.getSurveyResponse(survey.id);
                            if (!existingResponse) {
                              await storage.createSurveyResponse({
                                surveyRequestId: survey.id,
                                redcapRecordId: recordId,
                                data: responseData,
                              });
                            }
                          }

                          await storage.updateSurveyRequest(survey.id, {
                            status: "COMPLETED",
                            completedAt: completionStatus.completionTime ? new Date(completionStatus.completionTime) : new Date(),
                          });

                          updated.push(survey.id);
                          console.log(`[Poll] ✅ Survey ${survey.id} marked as COMPLETED via fallback check`);
                          break; // Found a match, stop checking
                        }
                      } catch (error) {
                        // Skip errors for individual record checks
                        console.debug(`[Poll] Error checking record ${recordId}:`, error);
                      }
                    }
                  }

                if (matchingRecord) {
                  const recordId = matchingRecord.record_id || matchingRecord.recordId;
                  
                  console.log(`[Poll] Found matching record ${recordId} for survey ${survey.id}`);
                  console.log(`[Poll] Matching record data:`, JSON.stringify(matchingRecord, null, 2));
                  
                  // Update survey with record ID
                  await storage.updateSurveyRequest(survey.id, {
                    redcapRecordId: recordId,
                  });
                  console.log(`[Poll] Updated survey ${survey.id} with REDCap record ID: ${recordId}`);

                  // Check completion status
                  console.log(`[Poll] Checking completion for record ${recordId} with formName: ${survey.formName}`);
                  const completionStatus = await redcapService.checkSurveyCompletion(
                    recordId,
                    survey.formName || "survey",
                    survey.redcapEvent || undefined
                  );

                  console.log(`[Poll] Survey ${survey.id} completion status:`, completionStatus);

                  if (completionStatus.completed) {
                    console.log(`[Poll] Survey ${survey.id} is completed, updating status...`);
                    // Fetch response data
                    const response = await redcapService.getSurveyResponse(
                      recordId,
                      survey.formName || "survey",
                      survey.redcapEvent || undefined
                    );

                    if (response.success && response.data) {
                      const responseData = Array.isArray(response.data) ? response.data[0] : response.data;
                      
                      const existingResponse = await storage.getSurveyResponse(survey.id);
                      if (!existingResponse) {
                        await storage.createSurveyResponse({
                          surveyRequestId: survey.id,
                          redcapRecordId: recordId,
                          data: responseData,
                        });
                      }
                    }

                    // Update survey status
                    await storage.updateSurveyRequest(survey.id, {
                      status: "COMPLETED",
                      completedAt: completionStatus.completionTime ? new Date(completionStatus.completionTime) : new Date(),
                    });

                    updated.push(survey.id);
                    console.log(`[Poll] ✅ Successfully updated survey ${survey.id} to COMPLETED status`);
                  } else {
                    console.log(`[Poll] ⚠️ Survey ${survey.id} record found but NOT completed yet`);
                  }
                } else {
                  console.log(`[Poll] ⚠️ No matching REDCap record found for survey ${survey.id}`);
                }
              }
            } catch (error: any) {
              console.error(`Error checking survey ${survey.id}:`, error);
              errors.push({ surveyId: survey.id, error: error.message });
            }
          }
          }
        } catch (error: any) {
          console.error(`Error checking survey ${survey.id}:`, error);
          errors.push({ surveyId: survey.id, error: error.message });
        }
      }

      const response = {
        checked: pendingSurveys.length,
        updated: updated.length,
        errors: errors.length,
        details: { updated, errors },
      };
      
      console.log(`[Poll] Survey polling complete: ${response.checked} checked, ${response.updated} updated, ${response.errors} errors`);
      if (response.updated > 0) {
        console.log(`[Poll] Updated survey IDs:`, updated);
      }
      if (response.errors > 0) {
        console.log(`[Poll] Errors:`, errors);
      }
      
      res.json(response);
    } catch (error) {
      console.error("Error polling surveys:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Get survey data with responses for doctor dashboard
   */
  app.get("/api/doctor/surveys/with-data", requireRole("DOCTOR"), async (req, res) => {
    try {
      const surveys = await storage.getSurveysForDoctor(req.user!.id);
      
      const surveysWithData = await Promise.all(
        surveys.map(async (survey) => {
          let responseData = null;
          
          // First, check if we have a stored response in the database
          const storedResponse = await storage.getSurveyResponse(survey.id);
          if (storedResponse && storedResponse.data) {
            responseData = storedResponse.data;
          } else if (survey.redcapRecordId && redcapService.isConfigured()) {
            // If no stored response, try to fetch from REDCap
            try {
            const response = await redcapService.getSurveyResponse(
              survey.redcapRecordId,
              survey.formName || "survey",
              survey.redcapEvent
            );
            
            if (response.success && response.data) {
              responseData = Array.isArray(response.data) ? response.data[0] : response.data;
                
                // Store the response in the database for future use
                if (!storedResponse) {
                  await storage.createSurveyResponse({
                    surveyRequestId: survey.id,
                    redcapRecordId: survey.redcapRecordId,
                    data: responseData,
                  });
                }
              }
            } catch (error) {
              console.error(`Error fetching REDCap response for survey ${survey.id}:`, error);
              // Continue without response data if REDCap fetch fails
            }
          }

          return {
            ...survey,
            responseData,
          };
        })
      );

      res.json(surveysWithData);
    } catch (error) {
      console.error("Error fetching surveys with data:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Get PROMS analytics for a patient
   */
  app.get("/api/doctor/patient/:patientId/proms-analytics", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { patientId } = req.params;
      const surveys = await storage.getSurveysForPatient(patientId);

      const preopSurveys = surveys.filter(s => s.when === "preop" && s.status === "COMPLETED");
      const postopSurveys = surveys.filter(s => s.when === "postop" && s.status === "COMPLETED");

      const analytics = {
        totalSurveys: surveys.length,
        completedSurveys: surveys.filter(s => s.status === "COMPLETED").length,
        pendingSurveys: surveys.filter(s => s.status === "SENT" || s.status === "PENDING").length,
        preopCount: preopSurveys.length,
        postopCount: postopSurveys.length,
        preopData: [] as any[],
        postopData: [] as any[],
        trends: {
          completionRate: surveys.length > 0 
            ? (surveys.filter(s => s.status === "COMPLETED").length / surveys.length) * 100 
            : 0,
          averageCompletionTime: null as number | null,
        },
      };

      // Fetch response data for completed surveys
      if (redcapService.isConfigured()) {
        for (const survey of [...preopSurveys, ...postopSurveys]) {
          if (survey.redcapRecordId) {
            const response = await redcapService.getSurveyResponse(
              survey.redcapRecordId,
              survey.formName || "survey",
              survey.redcapEvent
            );
            
            if (response.success && response.data) {
              const data = Array.isArray(response.data) ? response.data[0] : response.data;
              const surveyData = {
                surveyId: survey.id,
                formName: survey.formName,
                completedAt: survey.completedAt,
                data,
              };

              if (survey.when === "preop") {
                analytics.preopData.push(surveyData);
              } else {
                analytics.postopData.push(surveyData);
              }
            }
          }
        }
      }

      // Calculate average completion time
      const completedSurveys = surveys.filter(s => s.status === "COMPLETED" && s.completedAt && s.createdAt);
      if (completedSurveys.length > 0) {
        const totalTime = completedSurveys.reduce((sum, s) => {
          const created = new Date(s.createdAt).getTime();
          const completed = new Date(s.completedAt!).getTime();
          return sum + (completed - created);
        }, 0);
        analytics.trends.averageCompletionTime = totalTime / completedSurveys.length; // in milliseconds
      }

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching PROMS analytics:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Download report for pre-op and post-op surveys (CSV format)
   */
  app.get("/api/doctor/patient/:patientId/report", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { patientId } = req.params;
      const { format = "csv", type } = req.query; // type: 'preop', 'postop', or 'all'

      const patient = await storage.getUser(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      let surveys = await storage.getSurveysForPatient(patientId);
      
      if (type === "preop") {
        surveys = surveys.filter(s => s.when === "preop");
      } else if (type === "postop") {
        surveys = surveys.filter(s => s.when === "postop");
      }

      const completedSurveys = surveys.filter(s => s.status === "COMPLETED");

      // If no completed surveys, return empty report with message
      if (completedSurveys.length === 0) {
        if (format === "csv") {
          // Return empty CSV with header
          const csv = "Survey ID,Form Name,Type,Completed At,Status\nNo completed surveys found";
          res.setHeader("Content-Type", "text/csv");
          res.setHeader("Content-Disposition", `attachment; filename="patient-${patientId}-${type || 'all'}-surveys-${new Date().toISOString().split('T')[0]}.csv"`);
          return res.send(csv);
        } else {
          return res.json({
            patient: {
              id: patient.id,
              name: patient.name,
              email: patient.email,
            },
            surveys: [],
            summary: {
              total: surveys.length,
              completed: 0,
              preop: surveys.filter(s => s.when === "preop").length,
              postop: surveys.filter(s => s.when === "postop").length,
            },
            message: "No completed surveys found. Please wait for patients to complete their surveys.",
          });
        }
      }

      // Fetch response data
      const reportData: any[] = [];
      
      if (redcapService.isConfigured()) {
        for (const survey of completedSurveys) {
          let recordId = survey.redcapRecordId;
          
          // If no record ID, try to find it
          if (!recordId) {
            const allRecordsResponse = await redcapService.exportRecords();
            if (allRecordsResponse.success && allRecordsResponse.data) {
              const records = Array.isArray(allRecordsResponse.data) ? allRecordsResponse.data : [allRecordsResponse.data];
              const matchingRecord = records.find((record: any) => {
                if (patient.email && (record.patient_email === patient.email || record.email === patient.email)) {
                  return true;
                }
                if (record.patient_id === patientId) {
                  return true;
                }
                return false;
              });
              
              if (matchingRecord) {
                recordId = matchingRecord.record_id || matchingRecord.recordId;
              }
            }
          }

          if (recordId) {
            const response = await redcapService.getSurveyResponse(
              recordId,
              survey.formName || "survey",
              survey.redcapEvent || undefined
            );
            
            if (response.success && response.data) {
              const data = Array.isArray(response.data) ? response.data[0] : response.data;
              reportData.push({
                surveyId: survey.id,
                formName: survey.formName,
                when: survey.when,
                completedAt: survey.completedAt,
                ...data,
              });
            }
          } else {
            // If no record found, still include survey info
            reportData.push({
              surveyId: survey.id,
              formName: survey.formName,
              when: survey.when,
              completedAt: survey.completedAt,
              status: "Completed (data not available)",
            });
          }
        }
      } else {
        // If REDCap not configured, still return survey info
        for (const survey of completedSurveys) {
          reportData.push({
            surveyId: survey.id,
            formName: survey.formName,
            when: survey.when,
            completedAt: survey.completedAt,
            status: "Completed",
          });
        }
      }

      if (format === "csv") {
        // Generate CSV
        if (reportData.length === 0) {
          const csv = "Survey ID,Form Name,Type,Completed At,Status\nNo data available";
          res.setHeader("Content-Type", "text/csv");
          res.setHeader("Content-Disposition", `attachment; filename="patient-${patientId}-${type || 'all'}-surveys-${new Date().toISOString().split('T')[0]}.csv"`);
          return res.send(csv);
        }

        const headers = ["Survey ID", "Form Name", "Type", "Completed At", ...Object.keys(reportData[0]).filter(k => !["surveyId", "formName", "when", "completedAt"].includes(k))];
        const rows = reportData.map(item => [
          item.surveyId,
          item.formName,
          item.when,
          item.completedAt ? new Date(item.completedAt).toISOString() : "",
          ...Object.keys(item).filter(k => !["surveyId", "formName", "when", "completedAt"].includes(k)).map(k => item[k] || "")
        ]);

        const csv = [
          headers.join(","),
          ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        ].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="patient-${patientId}-${type || 'all'}-surveys-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
      } else {
        // JSON format
        res.json({
          patient: {
            id: patient.id,
            name: patient.name,
            email: patient.email,
          },
          surveys: reportData,
          summary: {
            total: completedSurveys.length,
            preop: completedSurveys.filter(s => s.when === "preop").length,
            postop: completedSurveys.filter(s => s.when === "postop").length,
          },
        });
      }
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // =====================
  // TWILIO ROUTES
  // =====================

  app.post("/api/twilio/call", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { calleeDoctorId } = req.body;
      if (!calleeDoctorId) {
        return res.status(400).json({ message: "Callee doctor ID is required" });
      }

      const callerProfile = await storage.getDoctorProfile(req.user!.id);
      const calleeProfile = await storage.getDoctorProfile(calleeDoctorId);

      if (!callerProfile?.phoneNumber || !calleeProfile?.phoneNumber) {
        return res.status(400).json({ message: "Both doctors must have verified phone numbers" });
      }

      // First, clean up stale calls for both caller and callee BEFORE checking
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
      
      // Clean up stale calls for caller - be more aggressive
      const callerAllCalls = await storage.getCallsForDoctor(req.user!.id);
      for (const call of callerAllCalls) {
        if (!call.endedAt && call.startedAt) {
          const startedAt = new Date(call.startedAt);
          // Clean up: calls older than 2 hours OR 
          // non-live calls older than 2 minutes (if not live, it should have ended quickly) OR
          // non-live calls older than 30 minutes (catch-all) OR
          // live calls older than 30 minutes (likely stale)
          if (startedAt < twoHoursAgo || 
              (!call.isLive && startedAt < twoMinutesAgo) ||
              (!call.isLive && startedAt < thirtyMinutesAgo) || 
              (call.isLive && startedAt < thirtyMinutesAgo)) {
            try {
              await storage.updateDoctorCall(call.id, {
                isLive: false,
                endedAt: now,
              });
              console.log(`Auto-cleared stale call ${call.id} for caller (isLive: ${call.isLive}, age: ${Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60)} min)`);
            } catch (error) {
              console.error(`Error clearing stale call ${call.id}:`, error);
            }
          }
        }
      }
      
      // Clean up stale calls for callee
      const calleeAllCalls = await storage.getCallsForDoctor(calleeDoctorId);
      for (const call of calleeAllCalls) {
        if (!call.endedAt && call.startedAt) {
          const startedAt = new Date(call.startedAt);
          // Clean up: calls older than 2 hours OR 
          // non-live calls older than 2 minutes (if not live, it should have ended quickly) OR
          // non-live calls older than 30 minutes (catch-all) OR
          // live calls older than 30 minutes (likely stale)
          if (startedAt < twoHoursAgo || 
              (!call.isLive && startedAt < twoMinutesAgo) ||
              (!call.isLive && startedAt < thirtyMinutesAgo) || 
              (call.isLive && startedAt < thirtyMinutesAgo)) {
            try {
              await storage.updateDoctorCall(call.id, {
                isLive: false,
                endedAt: now,
              });
              console.log(`Auto-cleared stale call ${call.id} for callee (isLive: ${call.isLive}, age: ${Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60)} min)`);
            } catch (error) {
              console.error(`Error clearing stale call ${call.id}:`, error);
            }
          }
        }
      }
      
      // Now check for active calls AFTER cleanup
      const callerActiveCalls = await storage.getCallsForDoctor(req.user!.id);
      const calleeActiveCalls = await storage.getCallsForDoctor(calleeDoctorId);
      
      // Consider a call active if:
      // 1. It's marked as live AND started within last 2 hours AND not ended, OR
      // 2. It was started very recently (within last 5 minutes) and not ended (to catch calls in progress)
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      // More strict: only consider calls active if they're live AND started within 5 minutes, or live calls started within 2 minutes (connecting)
      // Note: twoMinutesAgo is already declared above in the cleanup section
      // Use 4 minutes 30 seconds to be more aggressive (calls older than 4.5 min are considered stale)
      const fourAndHalfMinutesAgo = new Date(now.getTime() - 4.5 * 60 * 1000);
      // For non-live calls, only consider them active if started within 30 seconds (very recent, might be connecting)
      const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
      
      const callerInCall = await (async () => {
        for (const c of callerActiveCalls) {
          if (c.endedAt) continue;
          if (!c.startedAt) continue;
          const startedAt = new Date(c.startedAt);
          // Only consider truly active: 
          // - Live calls started within 4.5 min, OR
          // - Non-live calls started within 30 seconds (very recent, might be connecting)
          // Non-live calls older than 30 seconds are considered stale
          const isActive = (c.isLive && startedAt > fourAndHalfMinutesAgo) || (!c.isLive && startedAt > thirtySecondsAgo);
          
          if (isActive) {
            // For calls that are marked as live, verify with Twilio if they're actually still active
            if (c.isLive && c.twilioCallSid && twilioClient && c.twilioCallSid.startsWith('doctor-call-')) {
              try {
                const conferenceName = c.twilioCallSid;
                
                // Add timeout to Twilio check (2 seconds max)
                let verificationCompleted = false;
                const verificationPromise = (async () => {
                  try {
                    const conference = await twilioClient.conferences(conferenceName).fetch();
                    
                    // Check if conference is still active
                    if (conference.status === 'completed' || conference.status === 'finished') {
                      // Conference has ended, mark call as ended
                      console.log(`Conference ${conferenceName} has ended (status: ${conference.status}), marking call ${c.id} as ended`);
                      await storage.updateDoctorCall(c.id, {
                        isLive: false,
                        endedAt: now,
                      });
                      verificationCompleted = true;
                      return false; // Not active
                    }
                    
                    // Check participants
                    const participants = await twilioClient.conferences(conferenceName).participants.list();
                    if (participants.length === 0) {
                      // No participants, mark as ended
                      console.log(`Conference ${conferenceName} has no participants, marking call ${c.id} as ended`);
                      await storage.updateDoctorCall(c.id, {
                        isLive: false,
                        endedAt: now,
                      });
                      verificationCompleted = true;
                      return false; // Not active
                    }
                    
                    console.log(`Caller has active call: ${c.id}, isLive: ${c.isLive}, startedAt: ${startedAt}, age: ${Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60)} minutes, participants: ${participants.length}`);
                    verificationCompleted = true;
                    return true; // Call is actually active
                  } catch (err) {
                    verificationCompleted = true;
                    throw err;
                  }
                })();
                
                const timeoutPromise = new Promise<boolean>((resolve) => {
                  setTimeout(() => {
                    if (!verificationCompleted) {
                      resolve(false); // Timeout occurred
                    }
                  }, 2000); // 2 second timeout
                });
                
                const isActuallyActive = await Promise.race([verificationPromise, timeoutPromise]);
                
                if (isActuallyActive === true) {
                  return true; // Call is actually active
                } else if (isActuallyActive === false && !verificationCompleted) {
                  // Timeout occurred - if call is older than 2 minutes, be lenient and allow new call
                  const ageMinutes = Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60);
                  if (ageMinutes >= 2) {
                    console.log(`Twilio verification timeout for call ${c.id} (age: ${ageMinutes} min). Marking as ended to allow new call.`);
                    await storage.updateDoctorCall(c.id, {
                      isLive: false,
                      endedAt: now,
                    });
                    continue; // Skip this call
                  }
                }
              } catch (error: any) {
                // If we can't check Twilio, be more aggressive for older calls
                const ageMinutes = Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60);
                console.log(`Could not verify call ${c.id} with Twilio: ${error.message}, age: ${ageMinutes} min`);
                
                // If call is 2+ minutes old and we can't verify, mark as ended to be safe
                if (ageMinutes >= 2) {
                  console.log(`Marking call ${c.id} as ended due to verification failure (age: ${ageMinutes} min)`);
                  await storage.updateDoctorCall(c.id, {
                    isLive: false,
                    endedAt: now,
                  });
                  continue; // Skip this call
                }
                
                // For very recent calls (< 2 min), use database status
                if (isActive && ageMinutes < 2) {
                  console.log(`Caller has active call: ${c.id}, isLive: ${c.isLive}, startedAt: ${startedAt}, age: ${ageMinutes} minutes (using database status)`);
                  return true;
                }
              }
            } else {
              // Not a live call or can't verify, use database status
              if (isActive) {
                console.log(`Caller has active call: ${c.id}, isLive: ${c.isLive}, startedAt: ${startedAt}, age: ${Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60)} minutes`);
                return true;
              }
            }
          }
        }
        return false;
      })();
      
      const calleeInCall = await (async () => {
        for (const c of calleeActiveCalls) {
          if (c.endedAt) continue;
          if (!c.startedAt) continue;
          const startedAt = new Date(c.startedAt);
          // Only consider truly active: 
          // - Live calls started within 4.5 min, OR
          // - Non-live calls started within 30 seconds (very recent, might be connecting)
          // Non-live calls older than 30 seconds are considered stale
          const isActive = (c.isLive && startedAt > fourAndHalfMinutesAgo) || (!c.isLive && startedAt > thirtySecondsAgo);
          
          if (isActive) {
            // For calls that are marked as live, verify with Twilio if they're actually still active
            if (c.isLive && c.twilioCallSid && twilioClient && c.twilioCallSid.startsWith('doctor-call-')) {
              try {
                const conferenceName = c.twilioCallSid;
                
                // Add timeout to Twilio check (2 seconds max)
                let verificationCompleted = false;
                const verificationPromise = (async () => {
                  try {
                    const conference = await twilioClient.conferences(conferenceName).fetch();
                    
                    // Check if conference is still active
                    if (conference.status === 'completed' || conference.status === 'finished') {
                      // Conference has ended, mark call as ended
                      console.log(`Conference ${conferenceName} has ended (status: ${conference.status}), marking call ${c.id} as ended`);
                      await storage.updateDoctorCall(c.id, {
                        isLive: false,
                        endedAt: now,
                      });
                      verificationCompleted = true;
                      return false; // Not active
                    }
                    
                    // Check participants
                    const participants = await twilioClient.conferences(conferenceName).participants.list();
                    if (participants.length === 0) {
                      // No participants, mark as ended
                      console.log(`Conference ${conferenceName} has no participants, marking call ${c.id} as ended`);
                      await storage.updateDoctorCall(c.id, {
                        isLive: false,
                        endedAt: now,
                      });
                      verificationCompleted = true;
                      return false; // Not active
                    }
                    
                    console.log(`Callee has active call: ${c.id}, isLive: ${c.isLive}, startedAt: ${startedAt}, age: ${Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60)} minutes, participants: ${participants.length}`);
                    verificationCompleted = true;
                    return true; // Call is actually active
                  } catch (err) {
                    verificationCompleted = true;
                    throw err;
                  }
                })();
                
                const timeoutPromise = new Promise<boolean>((resolve) => {
                  setTimeout(() => {
                    if (!verificationCompleted) {
                      resolve(false); // Timeout occurred
                    }
                  }, 2000); // 2 second timeout
                });
                
                const isActuallyActive = await Promise.race([verificationPromise, timeoutPromise]);
                
                if (isActuallyActive === true) {
                  return true; // Call is actually active
                } else if (isActuallyActive === false && !verificationCompleted) {
                  // Timeout occurred - if call is older than 2 minutes, be lenient and allow new call
                  const ageMinutes = Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60);
                  if (ageMinutes >= 2) {
                    console.log(`Twilio verification timeout for call ${c.id} (age: ${ageMinutes} min). Marking as ended to allow new call.`);
                    await storage.updateDoctorCall(c.id, {
                      isLive: false,
                      endedAt: now,
                    });
                    continue; // Skip this call
                  }
                }
              } catch (error: any) {
                // If we can't check Twilio, be more aggressive for older calls
                const ageMinutes = Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60);
                console.log(`Could not verify call ${c.id} with Twilio: ${error.message}, age: ${ageMinutes} min`);
                
                // If call is 2+ minutes old and we can't verify, mark as ended to be safe
                if (ageMinutes >= 2) {
                  console.log(`Marking call ${c.id} as ended due to verification failure (age: ${ageMinutes} min)`);
                  await storage.updateDoctorCall(c.id, {
                    isLive: false,
                    endedAt: now,
                  });
                  continue; // Skip this call
                }
                
                // For very recent calls (< 2 min), use database status
                if (isActive && ageMinutes < 2) {
                  console.log(`Callee has active call: ${c.id}, isLive: ${c.isLive}, startedAt: ${startedAt}, age: ${ageMinutes} minutes (using database status)`);
                  return true;
                }
              }
            } else {
              // Not a live call or can't verify, use database status
              if (isActive) {
                console.log(`Callee has active call: ${c.id}, isLive: ${c.isLive}, startedAt: ${startedAt}, age: ${Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60)} minutes`);
                return true;
              }
            }
          }
        }
        return false;
      })();
      
      if (callerInCall) {
        // Before returning error, try aggressive cleanup - clear any calls 5 minutes or older (live or not)
        const recentCalls = callerActiveCalls.filter(c => !c.endedAt && c.startedAt);
        for (const call of recentCalls) {
          const startedAt = new Date(call.startedAt);
          // Use <= to catch calls that are exactly 5 minutes old
          if (startedAt <= fiveMinutesAgo) {
            try {
              await storage.updateDoctorCall(call.id, {
                isLive: false,
                endedAt: now,
              });
              console.log(`Aggressively cleared call ${call.id} (isLive: ${call.isLive}) that was ${Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60)} minutes old`);
            } catch (error) {
              console.error(`Error clearing call ${call.id}:`, error);
            }
          }
        }
        
        // Re-check after aggressive cleanup
        const callerActiveCallsAfterAggressiveCleanup = await storage.getCallsForDoctor(req.user!.id);
        const stillInCall = callerActiveCallsAfterAggressiveCleanup.some(c => {
          if (c.endedAt) return false;
          if (!c.startedAt) return false;
          const startedAt = new Date(c.startedAt);
          // Only consider truly active: live calls started within 4.5 min, or any call started within 2 min
          return (c.isLive && startedAt > fourAndHalfMinutesAgo) || (startedAt > twoMinutesAgo);
        });
        
        if (stillInCall) {
          return res.status(400).json({ 
            message: "You are already in an active call. Please end the current call before initiating a new one." 
          });
        }
        // If aggressive cleanup fixed it, continue with call initiation
      }
      
      if (calleeInCall) {
        // Before returning error, try aggressive cleanup - clear any calls 5 minutes or older (live or not)
        const recentCalls = calleeActiveCalls.filter(c => !c.endedAt && c.startedAt);
        for (const call of recentCalls) {
          const startedAt = new Date(call.startedAt);
          // Use <= to catch calls that are exactly 5 minutes old
          if (startedAt <= fiveMinutesAgo) {
            try {
              await storage.updateDoctorCall(call.id, {
                isLive: false,
                endedAt: now,
              });
              console.log(`Aggressively cleared non-live call ${call.id} for callee`);
            } catch (error) {
              console.error(`Error clearing call ${call.id}:`, error);
            }
          }
        }
        
        // Re-check after aggressive cleanup
        const calleeActiveCallsAfterAggressiveCleanup = await storage.getCallsForDoctor(calleeDoctorId);
        const stillInCall = calleeActiveCallsAfterAggressiveCleanup.some(c => {
          if (c.endedAt) return false;
          if (!c.startedAt) return false;
          const startedAt = new Date(c.startedAt);
          // Only consider truly active: live calls started within 4.5 min, or any call started within 2 min
          return (c.isLive && startedAt > fourAndHalfMinutesAgo) || (startedAt > twoMinutesAgo);
        });
        
        if (stillInCall) {
          return res.status(400).json({ 
            message: "The doctor you are trying to call is currently in another call. Please try again later." 
          });
        }
        // If aggressive cleanup fixed it, continue with call initiation
      }

      const call = await storage.createDoctorCall({
        callerDoctorId: req.user!.id,
        calleeDoctorId,
        isLive: false, // Will be set to true when calls actually connect
        startedAt: new Date(),
      });

      // Initiate Twilio call
      if (!twilioClient) {
        // Debug: Check if env vars are actually set
        const hasAccountSid = !!process.env.TWILIO_ACCOUNT_SID;
        const hasAuthToken = !!process.env.TWILIO_AUTH_TOKEN;
        const accountSidValue = process.env.TWILIO_ACCOUNT_SID ? `${process.env.TWILIO_ACCOUNT_SID.substring(0, 4)}...` : 'NOT SET';
        
        console.log("Twilio client not initialized.");
        console.log(`  TWILIO_ACCOUNT_SID: ${hasAccountSid ? accountSidValue : 'NOT SET'}`);
        console.log(`  TWILIO_AUTH_TOKEN: ${hasAuthToken ? 'SET' : 'NOT SET'}`);
        console.log(`  AccountSid starts with AC: ${process.env.TWILIO_ACCOUNT_SID?.startsWith('AC')}`);
        
        return res.status(503).json({ 
          error: "Service Unavailable",
          message: "Call service is not configured. Please contact your administrator to set up Twilio integration.",
          details: "Twilio not configured. Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN environment variables."
        });
      }

      if (!process.env.TWILIO_PHONE_NUMBER) {
        console.log("TWILIO_PHONE_NUMBER not set");
        return res.status(503).json({ 
          error: "Service Unavailable",
          message: "Call service is not configured. Please contact your administrator to set up Twilio phone number.",
          details: "TWILIO_PHONE_NUMBER environment variable is not set."
        });
      }

        try {
          const conferenceName = `doctor-call-${call.id}`;
        let baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
        
        // Check if URL is localhost - use inline TwiML for local development
        const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
        
        if (isLocalhost) {
          console.warn("⚠️  WARNING: Using localhost. For production, use a publicly accessible URL.");
          console.warn("   For local development with Twilio, use ngrok:");
          console.warn("   1. Run in separate terminal: ngrok http 5000");
          console.warn("   2. Set APP_URL in .env to the ngrok HTTPS URL");
          console.warn("   Using inline TwiML as fallback (may not work for all Twilio features)...");
        }
        
        console.log(`Initiating Twilio doctor call: Caller ${callerProfile.phoneNumber}, Callee ${calleeProfile.phoneNumber}`);
        
        // Enable recording for doctor calls
        const recordingStatusCallback = `${baseUrl}/api/twilio/webhook/recording`;
        
        // Use inline TwiML for localhost, URL for public URLs
        // Both calls use the same conference name so they can talk to each other
        // startConferenceOnEnter="true" - starts conference when first participant joins
        // endConferenceOnExit="false" - keeps conference alive when one participant leaves
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference record="record-from-start" recordingStatusCallback="${recordingStatusCallback}" startConferenceOnEnter="true" endConferenceOnExit="false">${conferenceName}</Conference></Dial></Response>`;
        
        let callOptions: any = {
            to: callerProfile.phoneNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
        };
        
        if (isLocalhost) {
          // Use inline TwiML for localhost
          callOptions.twiml = twiml;
          console.log(`Using inline TwiML (localhost mode)`);
        } else {
          // Use URL for public servers
          const twimlUrl = `${baseUrl}/api/twilio/twiml/conference?conference=${encodeURIComponent(conferenceName)}`;
          callOptions.url = twimlUrl;
          callOptions.statusCallback = `${baseUrl}/api/twilio/webhook/status`;
          callOptions.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed'];
          console.log(`TwiML URL: ${twimlUrl}`);
        }

        // Call caller
        const callerTwilioCall = await twilioClient.calls.create(callOptions);

        console.log(`Caller call SID: ${callerTwilioCall.sid}`);

        // Call callee (same options)
        const calleeCallOptions = { ...callOptions, to: calleeProfile.phoneNumber };
        const calleeTwilioCall = await twilioClient.calls.create(calleeCallOptions);

        console.log(`Callee call SID: ${calleeTwilioCall.sid}`);

        // Store both call SIDs and conference name
        // Store conference name in twilioCallSid, and also store individual CallSids in a JSON format
        // This allows us to match webhook events to the correct call
        await storage.updateDoctorCall(call.id, {
          twilioCallSid: conferenceName,
          // Store CallSids as JSON string in transcriptText temporarily, or we could add a new field
          // For now, we'll use the conference name pattern to find calls
        });
        
        // Set call as live after a short delay to allow calls to connect
        setTimeout(async () => {
          try {
            await storage.updateDoctorCall(call.id, { isLive: true });
          } catch (error) {
            console.error("Error updating call status to live:", error);
          }
        }, 3000);
      } catch (twilioError: any) {
          console.error("Twilio call failed:", twilioError);
        console.error("Error details:", {
          message: twilioError.message,
          code: twilioError.code,
          status: twilioError.status,
          moreInfo: twilioError.moreInfo,
        });
        // Update call status
        await storage.updateDoctorCall(call.id, { isLive: false, endedAt: new Date() });
        return res.status(500).json({ 
          message: "Failed to initiate call", 
          error: twilioError.message || "Twilio service error",
          code: twilioError.code,
        });
      }

      await storage.createAuditLog({
        userId: req.user!.id,
        action: "DOCTOR_CALL_INITIATED",
        resourceType: "doctor_call",
        resourceId: call.id,
        metadata: { calleeDoctorId },
      });

      res.json(call);
    } catch (error) {
      console.error("Error initiating doctor call:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // TwiML endpoint for conference calls
  app.get("/api/twilio/twiml/conference", async (req, res) => {
    const conferenceName = req.query.conference as string;
    if (!conferenceName) {
      return res.status(400).send("Conference name required");
    }
    
    // Enable recording for doctor calls
    const recordingStatusCallback = `${process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`}/api/twilio/webhook/recording`;
    
    // Enable two-way communication with proper conference settings
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference record="record-from-start" recordingStatusCallback="${recordingStatusCallback}" startConferenceOnEnter="true" endConferenceOnExit="false">
      ${conferenceName}
    </Conference>
  </Dial>
</Response>`;
    
    res.type('text/xml');
    res.send(twiml);
  });

  // End a doctor call
  app.put("/api/doctor/call/:callId/end", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getDoctorCall(callId);
      
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      // Verify the user is part of this call
      if (call.callerDoctorId !== req.user!.id && call.calleeDoctorId !== req.user!.id) {
        return res.status(403).json({ message: "You are not authorized to end this call" });
      }
      
      const now = new Date();
      
      // Calculate call duration if started
      let callDuration = null;
      if (call.startedAt) {
        callDuration = Math.round((now.getTime() - new Date(call.startedAt).getTime()) / 1000);
      }
      
      // Generate a simple summary if we have transcript or live summary
      let summaryText = call.liveSummary || call.summaryText;
      if (!summaryText && call.transcriptText) {
        // Generate a basic summary from transcript
        const transcript = call.transcriptText;
        const wordCount = transcript.split(/\s+/).length;
        summaryText = `Call completed. Duration: ${callDuration ? `${Math.floor(callDuration / 60)} minutes` : 'N/A'}. Transcript contains ${wordCount} words.`;
      } else if (!summaryText) {
        // Generate a basic summary without transcript
        summaryText = `Call completed. Duration: ${callDuration ? `${Math.floor(callDuration / 60)} minutes` : 'N/A'}.`;
      }
      
      // Hangup Twilio calls if call is still active
      if (twilioClient && call.twilioCallSid && call.isLive) {
        try {
          const conferenceName = call.twilioCallSid;
          
          // If it's a conference call, get all participants and hangup each one
          if (conferenceName.startsWith('doctor-call-')) {
            try {
              const participants = await twilioClient.conferences(conferenceName).participants.list();
              
              // Hangup all participants - update each call to completed status
              for (const participant of participants) {
                try {
                  // End the call by updating its status to 'completed'
                  // This will remove the participant from the conference
                  await twilioClient.calls(participant.callSid).update({ status: 'completed' });
                  console.log(`Hung up call ${participant.callSid} from conference ${conferenceName}`);
                } catch (err: any) {
                  // If call is already completed or doesn't exist, that's okay
                  if (err.code === 20404) {
                    console.log(`Call ${participant.callSid} already ended`);
                  } else {
                    console.error(`Error hanging up call ${participant.callSid}:`, err.message);
                  }
                }
              }
              
              // Also try to update the conference to end it
              try {
                await twilioClient.conferences(conferenceName).update({ status: 'completed' });
                console.log(`Ended conference ${conferenceName}`);
              } catch (confErr: any) {
                // Conference might not support status update, that's okay
                console.log(`Note: Could not update conference status (this is often normal):`, confErr.message);
              }
            } catch (confListErr: any) {
              // Conference might not exist or already ended, that's okay
              console.log(`Conference ${conferenceName} may already be ended:`, confListErr.message);
              
              // Try to find and hangup calls by SID if we can find them
              // This is a fallback if conference lookup fails
              try {
                const recentCalls = await twilioClient.calls.list({ limit: 50 });
                const relevantCalls = recentCalls.filter(c => {
                  // Filter calls that might belong to this conference based on timing
                  if (!c.dateCreated || !call.startedAt) return false;
                  const callTime = new Date(c.dateCreated).getTime();
                  const startTime = new Date(call.startedAt).getTime();
                  return Math.abs(callTime - startTime) < 60000; // Within 1 minute
                });
                
                // Hangup active calls
                for (const twilioCall of relevantCalls) {
                  if (twilioCall.status === 'in-progress' || twilioCall.status === 'ringing') {
                    try {
                      await twilioClient.calls(twilioCall.sid).update({ status: 'completed' });
                      console.log(`Hung up call ${twilioCall.sid} (fallback method)`);
                    } catch (err: any) {
                      console.error(`Error hanging up call ${twilioCall.sid}:`, err.message);
                    }
                  }
                }
              } catch (fallbackErr: any) {
                console.error(`Fallback call hangup failed:`, fallbackErr.message);
              }
            }
          } else {
            // If it's a direct call SID, hang it up directly
            try {
              await twilioClient.calls(call.twilioCallSid).update({ status: 'completed' });
              console.log(`Hung up call ${call.twilioCallSid}`);
            } catch (err: any) {
              console.error(`Error hanging up call ${call.twilioCallSid}:`, err.message);
            }
          }
        } catch (twilioErr: any) {
          // Log error but don't fail the request - we'll still mark call as ended in DB
          console.error(`Error hanging up Twilio call for ${callId}:`, twilioErr.message);
        }
      }
      
      // Update call to mark it as ended
      const updated = await storage.updateDoctorCall(callId, {
        isLive: false,
        endedAt: now,
        summaryText: summaryText || `Call ended at ${now.toISOString()}.`,
        summaryUpdatedAt: now,
      });
      
      // Try to process recording if available (wait a bit for recording to be ready)
      if (twilioClient && call.twilioCallSid) {
        setTimeout(async () => {
          try {
            const recordings = await twilioClient.recordings.list({ limit: 20 });
            
            // Find recordings that match this call's time frame
            const callRecordings = recordings.filter(r => {
              if (r.status !== 'completed') return false;
              if (!r.dateCreated || !call.startedAt) return false;
              const recordingTime = new Date(r.dateCreated).getTime();
              const callStartTime = new Date(call.startedAt).getTime();
              // Recording should be within 10 minutes of call start
              return Math.abs(recordingTime - callStartTime) < 10 * 60 * 1000;
            });
            
            if (callRecordings.length > 0) {
              const latestRecording = callRecordings.sort((a, b) => 
                new Date(b.dateCreated!).getTime() - new Date(a.dateCreated!).getTime()
              )[0];
              
              const recordingUrl = `https://api.twilio.com${latestRecording.uri.replace('.json', '.mp3')}`;
              console.log(`Processing recording for call ${callId}: ${recordingUrl}`);
              
              // Process recording in background
              processRecordingForCall(callId, recordingUrl).catch(err => {
                console.error(`Error processing recording for call ${callId}:`, err);
              });
            } else {
              console.log(`No recording found for call ${callId}`);
            }
          } catch (error: any) {
            console.error(`Error fetching recordings for call ${callId}:`, error.message);
          }
        }, 5000); // Wait 5 seconds for recording to be available
      }
      
      await storage.createAuditLog({
        userId: req.user!.id,
        action: "DOCTOR_CALL_ENDED",
        resourceType: "doctor_call",
        resourceId: callId,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error ending call:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get doctor call history with pagination
  app.get("/api/doctor/calls", requireRole("DOCTOR"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 5;
      const offset = (page - 1) * limit;

      const allCalls = await storage.getCallsForDoctor(req.user!.id);
      const totalCalls = allCalls.length;
      const totalPages = Math.ceil(totalCalls / limit);
      
      // Get paginated calls
      const paginatedCalls = allCalls.slice(offset, offset + limit);
      
      // Fetch doctor information and verify Twilio status for each call
      const callsWithDoctors = await Promise.all(
        paginatedCalls.map(async (call) => {
          const caller = await storage.getUser(call.callerDoctorId);
          const callee = await storage.getUser(call.calleeDoctorId);
          
          // Verify with Twilio if call is marked as live and has a Twilio SID
          let actualIsLive = call.isLive;
          if (call.isLive && !call.endedAt && call.twilioCallSid && twilioClient) {
            try {
              if (call.twilioCallSid.startsWith('doctor-call-')) {
                // Conference call - check conference status
                try {
                  const conference = await twilioClient.conferences(call.twilioCallSid).fetch();
                  
                  if (conference.status === 'completed' || conference.status === 'finished') {
                    // Conference has ended in Twilio, update database
                    actualIsLive = false;
                    await storage.updateDoctorCall(call.id, {
                      isLive: false,
                      endedAt: call.endedAt || new Date(),
                    });
                  } else {
                    // Check participants
                    const participants = await twilioClient.conferences(call.twilioCallSid).participants.list();
                    if (participants.length === 0) {
                      // No participants, mark as ended
                      actualIsLive = false;
                      await storage.updateDoctorCall(call.id, {
                        isLive: false,
                        endedAt: call.endedAt || new Date(),
                      });
                    }
                  }
                } catch (confErr: any) {
                  // Conference doesn't exist or error fetching - likely ended
                  if (confErr.code === 20404) {
                    // Conference not found - it's ended
                    actualIsLive = false;
                    await storage.updateDoctorCall(call.id, {
                      isLive: false,
                      endedAt: call.endedAt || new Date(),
                    });
                  }
                }
              } else {
                // Direct call - check call status
                try {
                  const twilioCall = await twilioClient.calls(call.twilioCallSid).fetch();
                  if (twilioCall.status === 'completed' || twilioCall.status === 'canceled' || twilioCall.status === 'failed' || twilioCall.status === 'busy' || twilioCall.status === 'no-answer') {
                    // Call has ended in Twilio, update database
                    actualIsLive = false;
                    await storage.updateDoctorCall(call.id, {
                      isLive: false,
                      endedAt: call.endedAt || new Date(),
                    });
                  }
                } catch (callErr: any) {
                  // Call doesn't exist or error - likely ended
                  if (callErr.code === 20404) {
                    actualIsLive = false;
                    await storage.updateDoctorCall(call.id, {
                      isLive: false,
                      endedAt: call.endedAt || new Date(),
                    });
                  }
                }
              }
            } catch (error: any) {
              // Error verifying with Twilio - log but don't fail the request
              console.error(`Error verifying Twilio status for call ${call.id}:`, error.message);
            }
          }
          
          return {
            ...call,
            isLive: actualIsLive, // Return the verified status
            caller: caller ? { id: caller.id, name: caller.name, email: caller.email } : null,
            callee: callee ? { id: callee.id, name: callee.name, email: callee.email } : null,
          };
        })
      );
      
      res.json({
        calls: callsWithDoctors,
        pagination: {
          page,
          limit,
          totalCalls,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });
    } catch (error) {
      console.error("Error fetching call history:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Clear all stale/active calls for a doctor (admin/self cleanup)
  app.post("/api/doctor/calls/clear-stale", requireRole("DOCTOR"), async (req, res) => {
    try {
      const calls = await storage.getCallsForDoctor(req.user!.id);
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes for live calls
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes for non-live calls
      
      let clearedCount = 0;
      for (const call of calls) {
        if (!call.endedAt && call.startedAt) {
          const startedAt = new Date(call.startedAt);
          const ageMinutes = Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60);
          
          // Clear calls that are:
          // 1. Older than 2 hours (any status)
          // 2. Not live and older than 2 minutes (non-live calls should end quickly)
          // 3. Not live and older than 30 minutes (catch-all)
          // 4. Live and 5 minutes or older (likely disconnected but not properly ended)
          // Use <= to catch calls that are exactly at the threshold
          const shouldClear = 
            startedAt <= twoHoursAgo || 
            (!call.isLive && startedAt <= twoMinutesAgo) ||
            (!call.isLive && startedAt <= thirtyMinutesAgo) ||
            (call.isLive && startedAt <= fiveMinutesAgo);
          
          if (shouldClear) {
            try {
              await storage.updateDoctorCall(call.id, {
                isLive: false,
                endedAt: now,
              });
              clearedCount++;
              console.log(`Cleared stale call ${call.id} (isLive: ${call.isLive}, age: ${ageMinutes} min)`);
            } catch (error) {
              console.error(`Error clearing stale call ${call.id}:`, error);
            }
          }
        }
      }
      
      res.json({ 
        message: `Cleared ${clearedCount} stale call(s)`,
        clearedCount 
      });
    } catch (error) {
      console.error("Error clearing stale calls:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/twilio/webhook/status", async (req, res) => {
    // Handle Twilio call status webhook
    try {
      const { CallSid, CallStatus, CallDuration, From, To, ConferenceName, ConferenceSid } = req.body;
      console.log("Twilio status webhook received:", { CallSid, CallStatus, CallDuration, From, To, ConferenceName, ConferenceSid });
      
      // Handle call completion/disconnection
      if (CallStatus === "completed" || CallStatus === "busy" || CallStatus === "no-answer" || CallStatus === "failed" || CallStatus === "canceled") {
        console.log(`Call ${CallSid} ended with status: ${CallStatus}`);
        
        // Try to find the call by conference name
        const conference = ConferenceName || ConferenceSid;
        if (conference && conference.startsWith('doctor-call-')) {
          const callId = conference.replace('doctor-call-', '');
          const call = await storage.getDoctorCall(callId);
          
          if (call) {
            // Check if conference is still active by querying Twilio
            let conferenceEnded = false;
            if (twilioClient && conference) {
              try {
                // Get conference details from Twilio
                const conf = await twilioClient.conferences(conference).fetch();
                // Check if conference has ended (no participants or status is completed)
                if (conf.status === 'completed' || conf.status === 'finished') {
                  conferenceEnded = true;
                  console.log(`Conference ${conference} has ended (status: ${conf.status})`);
                } else {
                  // Check participants count
                  const participants = await twilioClient.conferences(conference).participants.list();
                  if (participants.length === 0) {
                    conferenceEnded = true;
                    console.log(`Conference ${conference} has no participants`);
                  } else {
                    console.log(`Conference ${conference} still has ${participants.length} participant(s)`);
                  }
                }
              } catch (error: any) {
                // If conference doesn't exist or error, assume it's ended
                console.log(`Error checking conference status: ${error.message}. Assuming conference ended.`);
                conferenceEnded = true;
              }
            } else {
              // If we can't check, assume conference ended when first call disconnects
              // This is a safe assumption - when one person disconnects, the call should end
              conferenceEnded = true;
              console.log(`Cannot check conference status (Twilio client not available), assuming call ended`);
            }
            
            // For doctor-to-doctor calls (2-person), when one person disconnects, mark call as ended
            // This ensures both participants see the call as ended immediately
            if (!call.endedAt) {
              // Check conference status, but also mark as ended if this is a completed call
              // In a 2-person call, when one disconnects, the call is effectively over
              const shouldEndCall = conferenceEnded || CallStatus === "completed";
              
              if (shouldEndCall) {
                const now = new Date();
                await storage.updateDoctorCall(callId, {
                  isLive: false,
                  endedAt: now,
                });
                
                console.log(`Automatically marked call ${callId} as ended via Twilio webhook (status: ${CallStatus}, conference ended: ${conferenceEnded})`);
                
                // Try to process recording if available
                // First, try to get recording from Twilio
                if (twilioClient && call.twilioCallSid) {
                  try {
                    const recordings = await twilioClient.recordings.list({ 
                      limit: 10,
                      // Try to find recordings for this conference
                    });
                    
                    // Find the most recent recording for this call
                    const callRecordings = recordings.filter(r => 
                      r.status === 'completed' && 
                      r.dateCreated && 
                      call.startedAt &&
                      new Date(r.dateCreated).getTime() >= new Date(call.startedAt).getTime() - 60000 // Within 1 minute of call start
                    );
                    
                    if (callRecordings.length > 0) {
                      const latestRecording = callRecordings.sort((a, b) => 
                        new Date(b.dateCreated!).getTime() - new Date(a.dateCreated!).getTime()
                      )[0];
                      
                      const recordingUrl = `https://api.twilio.com${latestRecording.uri.replace('.json', '.mp3')}`;
                      console.log(`Found recording for call ${callId}, processing: ${recordingUrl}`);
                      
                      // Process recording in background
                      processRecordingForCall(callId, recordingUrl).catch(err => {
                        console.error(`Error processing recording for call ${callId}:`, err);
                        // Fallback to basic summary
                        if (!call.summaryText && !call.liveSummary) {
                          const callDuration = call.startedAt 
                            ? Math.round((now.getTime() - new Date(call.startedAt).getTime()) / 1000)
                            : 0;
                          const basicSummary = `Call completed. Duration: ${callDuration ? `${Math.floor(callDuration / 60)} minutes ${callDuration % 60} seconds` : 'N/A'}.`;
                          
                          storage.updateDoctorCall(callId, {
                            summaryText: basicSummary,
                            summaryUpdatedAt: now,
                          }).catch(e => console.error(`Error setting basic summary:`, e));
                        }
                      });
                    } else {
                      // No recording found, set basic summary
                      if (!call.summaryText && !call.liveSummary) {
                        const callDuration = call.startedAt 
                          ? Math.round((now.getTime() - new Date(call.startedAt).getTime()) / 1000)
                          : 0;
                        const basicSummary = `Call completed. Duration: ${callDuration ? `${Math.floor(callDuration / 60)} minutes ${callDuration % 60} seconds` : 'N/A'}.`;
                        
                        await storage.updateDoctorCall(callId, {
                          summaryText: basicSummary,
                          summaryUpdatedAt: now,
                        });
                      }
                    }
                  } catch (error: any) {
                    console.error(`Error fetching recordings for call ${callId}:`, error.message);
                    // Fallback to basic summary
                    if (!call.summaryText && !call.liveSummary) {
                      const callDuration = call.startedAt 
                        ? Math.round((now.getTime() - new Date(call.startedAt).getTime()) / 1000)
                        : 0;
                      const basicSummary = `Call completed. Duration: ${callDuration ? `${Math.floor(callDuration / 60)} minutes ${callDuration % 60} seconds` : 'N/A'}.`;
                      
                      await storage.updateDoctorCall(callId, {
                        summaryText: basicSummary,
                        summaryUpdatedAt: now,
                      });
                    }
                  }
                } else {
                  // No Twilio client or call SID, set basic summary
                  if (!call.summaryText && !call.liveSummary) {
                    const callDuration = call.startedAt 
                      ? Math.round((now.getTime() - new Date(call.startedAt).getTime()) / 1000)
                      : 0;
                    const basicSummary = `Call completed. Duration: ${callDuration ? `${Math.floor(callDuration / 60)} minutes ${callDuration % 60} seconds` : 'N/A'}.`;
                    
                    await storage.updateDoctorCall(callId, {
                      summaryText: basicSummary,
                      summaryUpdatedAt: now,
                    });
                  }
                }
              } else {
                console.log(`Conference still active with participants, not ending call ${callId} yet`);
              }
            } else {
              console.log(`Call ${callId} already marked as ended`);
            }
          } else {
            console.log(`Call ${callId} not found in database`);
          }
        } else {
          console.log(`Could not extract call ID from conference name: ${conference}`);
          // Fallback: Try to find call by searching recent calls and matching phone numbers
          // This is less reliable but can help if conference name is missing
          if (From || To) {
            console.log(`Attempting to find call by phone numbers: From=${From}, To=${To}`);
            // Note: This would require storing phone numbers with calls or searching all recent calls
            // For now, we'll log it for debugging
          }
        }
      } else if (CallStatus === "answered") {
        console.log(`Call ${CallSid} was answered`);
        
        // Try to mark call as live if it was just answered
        const conference = ConferenceName || ConferenceSid;
        if (conference && conference.startsWith('doctor-call-')) {
          const callId = conference.replace('doctor-call-', '');
          const call = await storage.getDoctorCall(callId);
          
          if (call && !call.isLive && !call.endedAt) {
            await storage.updateDoctorCall(callId, {
              isLive: true,
              startedAt: call.startedAt || new Date(),
            });
            console.log(`Marked call ${callId} as live via Twilio webhook`);
          }
        }
      }
      
      res.sendStatus(200);
    } catch (error) {
      console.error("Error handling Twilio webhook:", error);
      res.sendStatus(200); // Always return 200 to Twilio
    }
  });

  app.post("/api/twilio/webhook/transcription", async (req, res) => {
    // Handle Twilio transcription webhook
    console.log("Twilio transcription webhook:", req.body);
    res.sendStatus(200);
  });

  // Webhook for recording completion
  app.post("/api/twilio/webhook/recording", async (req, res) => {
    try {
      const { RecordingSid, RecordingUrl, RecordingStatus, CallSid, ConferenceName, ConferenceSid } = req.body;
      console.log("Twilio recording webhook received:", JSON.stringify(req.body, null, 2));

      if (RecordingStatus === "completed") {
        console.log(`Recording completed: ${RecordingSid}`);
        
        // Get the actual recording URL from Twilio if not provided
        let actualRecordingUrl = RecordingUrl;
        if (!actualRecordingUrl && RecordingSid && twilioClient) {
          try {
            const recording = await twilioClient.recordings(RecordingSid).fetch();
            // Get the WAV or MP3 URL - Assembly AI prefers MP3
            actualRecordingUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
            console.log(`Fetched recording URL from Twilio: ${actualRecordingUrl}`);
          } catch (error: any) {
            console.error(`Error fetching recording from Twilio:`, error);
            // Fallback to the provided URL or construct it
            actualRecordingUrl = RecordingUrl || `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Recordings/${RecordingSid}.mp3`;
          }
        }
        
        if (!actualRecordingUrl) {
          console.error(`No recording URL available for RecordingSid: ${RecordingSid}`);
          res.sendStatus(200);
          return;
        }

        // Try to find call by conference name or CallSid
        let callId: string | null = null;
        
        // Method 1: Try conference name (format: doctor-call-{callId})
        const conference = ConferenceName || ConferenceSid;
        if (conference && conference.startsWith('doctor-call-')) {
          callId = conference.replace('doctor-call-', '');
        } else if (CallSid) {
          // Method 2: Try to find call by matching CallSid in recent calls
          // Since we don't store individual CallSids, we'll need to search by time
          // For now, we'll try to find calls that ended recently
          console.log(`Trying to find call by CallSid: ${CallSid}`);
          // This is a fallback - ideally we'd store CallSids with the call
        }
        
        if (callId) {
          const call = await storage.getDoctorCall(callId);
          
          if (call) {
            console.log(`Found call ${callId} for recording ${RecordingSid}`);
            
            // Process recording (even if call hasn't ended yet, we can process it)
            processRecordingForCall(callId, actualRecordingUrl).catch(err => {
              console.error(`Error processing recording for call ${callId}:`, err);
            });
          } else {
            console.log(`Call ${callId} not found in database`);
          }
        } else {
          console.log(`Could not determine call ID from webhook. ConferenceName: ${ConferenceName}, ConferenceSid: ${ConferenceSid}, CallSid: ${CallSid}`);
          // Store recording info for manual processing
          console.log(`Recording ${RecordingSid} available at ${actualRecordingUrl} but call ID unknown`);
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Error handling recording webhook:", error);
      res.sendStatus(200); // Always return 200 to Twilio
    }
  });

  // Helper function to process recording
  async function processRecordingForCall(callId: string, recordingUrl: string) {
    try {
      const call = await storage.getDoctorCall(callId);
      if (!call) {
        console.error(`Call ${callId} not found`);
        throw new Error(`Call ${callId} not found`);
      }

      console.log(`[${callId}] Starting recording processing for URL: ${recordingUrl}`);

      // Check if API keys are configured
      if (!process.env.ASSEMBLY_AI_API_KEY) {
        console.error(`[${callId}] ASSEMBLY_AI_API_KEY not configured`);
        throw new Error('Assembly AI API key not configured. Please set ASSEMBLY_AI_API_KEY in environment variables.');
      }

      if (!process.env.GROQ_API_KEY) {
        console.error(`[${callId}] GROQ_API_KEY not configured`);
        throw new Error('Groq API key not configured. Please set GROQ_API_KEY in environment variables.');
      }

      // Download recording from Twilio (since Twilio URLs require auth)
      let transcriptId: string;
      if (recordingUrl.includes('api.twilio.com')) {
        console.log(`[${callId}] Downloading recording from Twilio (requires authentication)...`);
        if (!twilioClient) {
          throw new Error('Twilio client not configured. Cannot download recording.');
        }
        
        // Create AbortController for download timeout
        const downloadController = new AbortController();
        const downloadTimeout = setTimeout(() => downloadController.abort(), 60000); // 1 minute for download

        try {
          // Download the recording using Twilio client
          const recordingResponse = await fetch(recordingUrl, {
            headers: {
              'Authorization': `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
            },
            signal: downloadController.signal,
          });

          clearTimeout(downloadTimeout);

          if (!recordingResponse.ok) {
            throw new Error(`Failed to download recording from Twilio: ${recordingResponse.statusText}`);
          }

          const arrayBuffer = await recordingResponse.arrayBuffer();
          const audioBuffer = Buffer.from(arrayBuffer);
          console.log(`[${callId}] Downloaded recording, size: ${audioBuffer.length} bytes`);

          // Upload to Assembly AI and submit for transcription
          console.log(`[${callId}] Uploading recording to Assembly AI...`);
          transcriptId = await assemblyAIService.submitTranscriptionFromBuffer(audioBuffer);
          console.log(`[${callId}] Transcription submitted, ID: ${transcriptId}`);
        } catch (error: any) {
          clearTimeout(downloadTimeout);
          if (error.name === 'AbortError') {
            throw new Error('Timeout downloading recording from Twilio. The recording may be too large or network connection is slow.');
          }
          throw error;
        }
      } else {
        // Public URL, can submit directly
        console.log(`[${callId}] Submitting public recording URL for transcription to Assembly AI...`);
        transcriptId = await assemblyAIService.submitTranscription(recordingUrl);
        console.log(`[${callId}] Transcription submitted, ID: ${transcriptId}`);
      }
      
      // Wait for transcription (with timeout)
      console.log(`[${callId}] Waiting for transcription to complete...`);
      const transcript = await assemblyAIService.waitForTranscription(transcriptId, 300000); // 5 minutes max
      console.log(`[${callId}] Transcription completed, length: ${transcript.length} characters`);

      // Get caller and callee information with profiles
      const caller = await storage.getUser(call.callerDoctorId);
      const callee = await storage.getUser(call.calleeDoctorId);
      const callerProfile = caller ? await storage.getDoctorProfile(caller.id) : null;
      const calleeProfile = callee ? await storage.getDoctorProfile(callee.id) : null;

      // Generate summary using Groq AI
      const callDuration = call.startedAt && call.endedAt
        ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
        : 0;

      console.log(`[${callId}] Generating summary with Groq AI (duration: ${callDuration}s)...`);
      let summaryResult;
      try {
        summaryResult = await groqService.generateSummary({
          transcript,
          callDuration,
          callerName: caller?.name || "Unknown",
          calleeName: callee?.name || "Unknown",
          callerInfo: caller ? {
            name: caller.name,
            specialty: callerProfile?.specialty || null,
            institution: callerProfile?.institution || null,
            shortBio: callerProfile?.shortBio || null,
            education: callerProfile?.education || null,
          } : undefined,
          calleeInfo: callee ? {
            name: callee.name,
            specialty: calleeProfile?.specialty || null,
            institution: calleeProfile?.institution || null,
            shortBio: calleeProfile?.shortBio || null,
            education: calleeProfile?.education || null,
          } : undefined,
        });
        console.log(`[${callId}] Summary generated successfully`);
      } catch (error: any) {
        // If Groq fails, save the transcript anyway so at least that's available
        console.error(`[${callId}] Groq summary generation failed:`, error.message);
        await storage.updateDoctorCall(callId, {
          transcriptText: transcript,
          summaryText: `Transcript available, but summary generation failed: ${error.message}\n\nTranscript:\n${transcript}`,
          summaryUpdatedAt: new Date(),
        });
        throw error; // Re-throw to be caught by outer handler
      }

      // Update call with transcript and summary
      const summaryText = summaryResult.summary + 
        (summaryResult.keyPoints.length > 0 ? `\n\nKey Points:\n${summaryResult.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : '') +
        (summaryResult.actionItems.length > 0 ? `\n\nAction Items:\n${summaryResult.actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}` : '');

      await storage.updateDoctorCall(callId, {
        transcriptText: transcript,
        summaryText: summaryText,
        summaryUpdatedAt: new Date(),
      });

      console.log(`[${callId}] Successfully processed recording and saved summary`);
    } catch (error: any) {
      console.error(`[${callId}] Error processing recording:`, error);
      console.error(`[${callId}] Error details:`, error.message, error.stack);
      throw error;
    }
  }

  // Process recording and generate transcript + summary (manual trigger)
  app.post("/api/doctor/call/:callId/process-recording", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { callId } = req.params;
      const { recordingUrl, recordingSid } = req.body;

      const call = await storage.getDoctorCall(callId);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      // Verify the user is part of this call
      if (call.callerDoctorId !== req.user!.id && call.calleeDoctorId !== req.user!.id) {
        return res.status(403).json({ message: "You are not authorized to process this call" });
      }

      // Get recording URL from Twilio
      let actualRecordingUrl = recordingUrl;
      
      // If recordingSid is provided, fetch the URL
      if (!actualRecordingUrl && recordingSid && twilioClient) {
        try {
          const recording = await twilioClient.recordings(recordingSid).fetch();
          // Get MP3 URL for Assembly AI
          actualRecordingUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
          console.log(`Fetched recording URL from Twilio using recordingSid: ${actualRecordingUrl}`);
        } catch (error: any) {
          return res.status(400).json({ 
            message: "Failed to fetch recording from Twilio", 
            error: error.message 
          });
        }
      }

      // If no recording URL/SID provided, try to find recording automatically from Twilio
      if (!actualRecordingUrl && twilioClient && call.startedAt) {
        try {
          console.log(`[${callId}] Attempting to find recording automatically from Twilio...`);
          
          // Method 1: If we have a conference name, try to find recordings by conference
          if (call.twilioCallSid && call.twilioCallSid.startsWith('doctor-call-')) {
            try {
              // Fetch recordings and look for ones associated with this conference
              const callStartTime = new Date(call.startedAt);
              const oneHourBefore = new Date(callStartTime.getTime() - 60 * 60 * 1000);
              const oneHourAfter = new Date(callStartTime.getTime() + 60 * 60 * 1000);
              
              const recordings = await twilioClient.recordings.list({
                dateCreatedAfter: oneHourBefore,
                dateCreatedBefore: oneHourAfter,
                limit: 50,
              });
              
              // Filter recordings by time proximity to call start (within 10 minutes)
              const matchingRecordings = recordings.filter(r => {
                if (!r.dateCreated || r.status !== 'completed') return false;
                const recordingTime = new Date(r.dateCreated).getTime();
                const callStartTimeMs = callStartTime.getTime();
                return Math.abs(recordingTime - callStartTimeMs) < 10 * 60 * 1000;
              });
              
              if (matchingRecordings.length > 0) {
                // Get the most recent matching recording
                const latestRecording = matchingRecordings.sort((a, b) => 
                  new Date(b.dateCreated!).getTime() - new Date(a.dateCreated!).getTime()
                )[0];
                
                actualRecordingUrl = `https://api.twilio.com${latestRecording.uri.replace('.json', '.mp3')}`;
                console.log(`[${callId}] Found recording automatically by timeframe: ${latestRecording.sid} at ${actualRecordingUrl}`);
              }
            } catch (confError: any) {
              console.error(`[${callId}] Error searching recordings by conference:`, confError.message);
            }
          }
          
          // Method 2: If still not found, search by call start time
      if (!actualRecordingUrl) {
            try {
              const callStartTime = new Date(call.startedAt);
              const oneHourBefore = new Date(callStartTime.getTime() - 60 * 60 * 1000);
              const oneHourAfter = new Date(callStartTime.getTime() + 60 * 60 * 1000);
              
              const recordings = await twilioClient.recordings.list({
                dateCreatedAfter: oneHourBefore,
                dateCreatedBefore: oneHourAfter,
                limit: 20,
              });
              
              // Find recordings that match the call timeframe (within 10 minutes)
              const matchingRecordings = recordings.filter(r => {
                if (!r.dateCreated || r.status !== 'completed') return false;
                const recordingTime = new Date(r.dateCreated).getTime();
                const callStartTimeMs = callStartTime.getTime();
                return Math.abs(recordingTime - callStartTimeMs) < 10 * 60 * 1000;
              });
              
              if (matchingRecordings.length > 0) {
                const latestRecording = matchingRecordings.sort((a, b) => 
                  new Date(b.dateCreated!).getTime() - new Date(a.dateCreated!).getTime()
                )[0];
                
                actualRecordingUrl = `https://api.twilio.com${latestRecording.uri.replace('.json', '.mp3')}`;
                console.log(`[${callId}] Found recording automatically by timeframe: ${latestRecording.sid} at ${actualRecordingUrl}`);
              } else {
                console.log(`[${callId}] No recordings found for this call timeframe`);
              }
            } catch (timeError: any) {
              console.error(`[${callId}] Error finding recording by time:`, timeError.message);
            }
          }
        } catch (error: any) {
          console.error(`[${callId}] Error finding recording automatically:`, error.message);
          // Continue to error response below
        }
      }

      if (!actualRecordingUrl) {
        return res.status(400).json({ 
          message: "No recording found for this call. Please ensure the call was recorded and try again, or provide a RecordingSid.",
          details: "The call may not have been recorded, or the recording may not be available yet. Try again in a few minutes."
        });
      }

      // Process recording in background (don't wait for completion)
      processRecordingForCall(callId, actualRecordingUrl).catch(err => {
        console.error(`Error processing recording for call ${callId}:`, err);
      });

      res.json({
        success: true,
        message: "Recording processing started. Summary will be available shortly.",
      });
    } catch (error: any) {
      console.error("Error processing recording:", error);
      res.status(500).json({ 
        message: "Failed to process recording", 
        error: error.message 
      });
    }
  });

  // Get recording info for a call (to help with manual processing)
  app.get("/api/doctor/call/:callId/recording-info", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getDoctorCall(callId);

      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      // Verify the user is part of this call
      if (call.callerDoctorId !== req.user!.id && call.calleeDoctorId !== req.user!.id) {
        return res.status(403).json({ message: "You are not authorized to view this call" });
      }

      // Try to find recordings for this call via Twilio
      let recordings: any[] = [];
      if (twilioClient) {
        try {
          // List recent recordings and try to match by time
          const allRecordings = await twilioClient.recordings.list({ limit: 50 });
          
          // Filter recordings that might belong to this call
          if (call.startedAt) {
            const callStartTime = new Date(call.startedAt).getTime();
            recordings = allRecordings
              .filter(r => {
                if (r.status !== 'completed') return false;
                if (!r.dateCreated) return false;
                const recordingTime = new Date(r.dateCreated).getTime();
                // Recording should be within 10 minutes of call start
                return Math.abs(recordingTime - callStartTime) < 10 * 60 * 1000;
              })
              .map(r => ({
                sid: r.sid,
                dateCreated: r.dateCreated,
                duration: r.duration,
                uri: r.uri,
                url: `https://api.twilio.com${r.uri.replace('.json', '.mp3')}`,
              }))
              .sort((a, b) => new Date(b.dateCreated!).getTime() - new Date(a.dateCreated!).getTime());
          }
        } catch (error: any) {
          console.error(`Error fetching recordings from Twilio:`, error);
        }
      }

      res.json({
        callId: call.id,
        hasTranscript: !!call.transcriptText,
        hasSummary: !!call.summaryText,
        recordings,
        twilioCallSid: call.twilioCallSid,
      });
    } catch (error: any) {
      console.error("Error getting recording info:", error);
      res.status(500).json({ 
        message: "Failed to get recording info", 
        error: error.message 
      });
    }
  });

  // Download call summary as PDF
  app.get("/api/doctor/call/:callId/download/pdf", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getDoctorCall(callId);

      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      // Verify the user is part of this call
      if (call.callerDoctorId !== req.user!.id && call.calleeDoctorId !== req.user!.id) {
        return res.status(403).json({ message: "You are not authorized to download this call summary" });
      }

      if (!call.summaryText) {
        return res.status(400).json({ message: "Call summary not available" });
      }

      // Get caller and callee names
      const caller = await storage.getUser(call.callerDoctorId);
      const callee = await storage.getUser(call.calleeDoctorId);

      const duration = call.startedAt && call.endedAt
        ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
        : 0;

      // Parse summary to extract key points and action items
      const summaryParts = call.summaryText.split('\n\n');
      const summary = summaryParts[0] || call.summaryText;
      const keyPoints: string[] = [];
      const actionItems: string[] = [];

      let currentSection = '';
      for (const part of summaryParts.slice(1)) {
        if (part.includes('Key Points:')) {
          currentSection = 'keyPoints';
          const points = part.replace('Key Points:', '').trim().split('\n');
          keyPoints.push(...points.map(p => p.replace(/^\d+\.\s*/, '')));
        } else if (part.includes('Action Items:')) {
          currentSection = 'actionItems';
          const items = part.replace('Action Items:', '').trim().split('\n');
          actionItems.push(...items.map(i => i.replace(/^\d+\.\s*/, '')));
        }
      }

      const documentData = {
        callId: call.id,
        callerName: caller?.name || "Unknown",
        calleeName: callee?.name || "Unknown",
        callDate: call.startedAt ? new Date(call.startedAt) : new Date(),
        duration,
        transcript: call.transcriptText || undefined,
        summary,
        keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        actionItems: actionItems.length > 0 ? actionItems : undefined,
      };

      const pdfContent = pdfGenerator.generatePDFContent(documentData);
      const pdfBuffer = await pdfGenerator.textToPDFBuffer(pdfContent);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="call-summary-${callId}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF", error: error.message });
    }
  });

  // Download call summary as DOC
  app.get("/api/doctor/call/:callId/download/doc", requireRole("DOCTOR"), async (req, res) => {
    try {
      const { callId } = req.params;
      const call = await storage.getDoctorCall(callId);

      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      // Verify the user is part of this call
      if (call.callerDoctorId !== req.user!.id && call.calleeDoctorId !== req.user!.id) {
        return res.status(403).json({ message: "You are not authorized to download this call summary" });
      }

      if (!call.summaryText) {
        return res.status(400).json({ message: "Call summary not available" });
      }

      // Get caller and callee names
      const caller = await storage.getUser(call.callerDoctorId);
      const callee = await storage.getUser(call.calleeDoctorId);

      const duration = call.startedAt && call.endedAt
        ? Math.round((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000)
        : 0;

      // Parse summary
      const summaryParts = call.summaryText.split('\n\n');
      const summary = summaryParts[0] || call.summaryText;
      const keyPoints: string[] = [];
      const actionItems: string[] = [];

      for (const part of summaryParts.slice(1)) {
        if (part.includes('Key Points:')) {
          const points = part.replace('Key Points:', '').trim().split('\n');
          keyPoints.push(...points.map(p => p.replace(/^\d+\.\s*/, '')));
        } else if (part.includes('Action Items:')) {
          const items = part.replace('Action Items:', '').trim().split('\n');
          actionItems.push(...items.map(i => i.replace(/^\d+\.\s*/, '')));
        }
      }

      const documentData = {
        callId: call.id,
        callerName: caller?.name || "Unknown",
        calleeName: callee?.name || "Unknown",
        callDate: call.startedAt ? new Date(call.startedAt) : new Date(),
        duration,
        transcript: call.transcriptText || undefined,
        summary,
        keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
        actionItems: actionItems.length > 0 ? actionItems : undefined,
      };

      const docContent = pdfGenerator.generateDOCContent(documentData);

      res.setHeader('Content-Type', 'application/msword');
      res.setHeader('Content-Disposition', `attachment; filename="call-summary-${callId}.doc"`);
      res.send(docContent);
    } catch (error: any) {
      console.error("Error generating DOC:", error);
      res.status(500).json({ message: "Failed to generate DOC", error: error.message });
    }
  });

  // =====================
  // TEDDY AI ASSISTANT
  // =====================

  // Speech-to-Text endpoint for Teddy AI
  app.post("/api/teddy/stt", requireAuth, async (req, res) => {
    try {
      const { speechService } = await import("./services/speech");
      
      if (!speechService.isSTTConfigured()) {
        return res.status(503).json({ 
          message: "Speech-to-text not configured. Please set ASSEMBLY_AI_API_KEY in environment variables.",
          fallback: true // Indicate to use browser API as fallback
        });
      }

      // Get audio data from request (base64 string)
      const audioBase64 = req.body.audio;
      
      if (!audioBase64 || typeof audioBase64 !== 'string') {
        return res.status(400).json({ message: "No audio data provided" });
      }

      // Convert base64 to buffer
      // Remove data URL prefix if present (data:audio/webm;base64,...)
      let base64Data = audioBase64;
      if (audioBase64.includes(',')) {
        base64Data = audioBase64.split(',')[1];
      }
      
      // Validate that it's actually base64 audio data
      if (base64Data.length === 0) {
        return res.status(400).json({ message: "Invalid audio data: empty base64 string" });
      }
      
      let audioBuffer: Buffer;
      try {
        audioBuffer = Buffer.from(base64Data, 'base64');
        
        // Validate buffer is not empty and has reasonable size (at least a few KB for audio)
        if (audioBuffer.length === 0) {
          return res.status(400).json({ message: "Invalid audio data: decoded buffer is empty" });
        }
        
        if (audioBuffer.length < 100) {
          return res.status(400).json({ message: "Invalid audio data: buffer too small to be audio" });
        }
        
        // Check if it looks like text/plain (simple heuristic: if first bytes are printable ASCII)
        const firstBytes = audioBuffer.slice(0, Math.min(100, audioBuffer.length));
        const isText = firstBytes.every(byte => (byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13);
        if (isText && audioBuffer.length < 10000) {
          return res.status(400).json({ message: "Invalid audio data: received text data instead of audio" });
        }
      } catch (error: any) {
        return res.status(400).json({ message: `Invalid audio data: ${error.message}` });
      }

      const transcript = await speechService.speechToText(audioBuffer);
      
      res.json({ transcript });
    } catch (error: any) {
      // Check if it's a connection timeout or network error
      const isTimeoutError = error.code === 'UND_ERR_CONNECT_TIMEOUT' || 
                            error.message?.includes('timeout') ||
                            error.message?.includes('Connect Timeout') ||
                            error.message?.includes('fetch failed');
      
      // Only log unexpected errors (timeouts are network issues, expected to fallback)
      if (!isTimeoutError) {
        console.error("Error in speech-to-text:", error);
      } else {
        console.warn("AssemblyAI connection timeout - returning fallback response");
      }
      
      // Return 503 (Service Unavailable) for network/timeout errors, 500 for other errors
      return res.status(isTimeoutError ? 503 : 500).json({ 
        message: isTimeoutError 
          ? "Speech-to-text service temporarily unavailable. Please use browser STT or try again."
          : "Failed to transcribe speech",
        error: error.message,
        fallback: true // Always indicate fallback is available
      });
    }
  });

  // Text-to-Speech endpoint for Teddy AI using Groq TTS
  app.post("/api/teddy/tts", requireAuth, async (req, res) => {
    try {
      const { speechService } = await import("./services/speech");
      
      if (!speechService.isTTSConfigured()) {
        return res.status(503).json({ 
          message: "Text-to-speech not configured. Please set GROQ_API_KEY in environment variables.",
          fallback: true // Indicate to use browser API as fallback
        });
      }

      const { text, voice } = req.body;
      
      if (!text) {
        return res.status(400).json({ message: "No text provided" });
      }

      const audioBuffer = await speechService.textToSpeech(text, voice || 'Fritz-PlayAI');
      
      // Return audio as base64
      const base64Audio = Buffer.from(audioBuffer).toString('base64');
      
      res.json({ 
        audio: base64Audio,
        format: 'wav'
      });
    } catch (error: any) {
      // Check if it's a terms acceptance error
      const isTermsError = error.code === 'MODEL_TERMS_REQUIRED' ||
                          error.message?.includes('terms acceptance') || 
                          error.message?.includes('model_terms_required');
      
      // Only log unexpected errors (terms acceptance is expected and handled gracefully)
      if (!isTermsError) {
        console.error("Error in text-to-speech:", error);
      }
      
      // Return 400 for terms acceptance (user action needed), 500 for other errors
      return res.status(isTermsError ? 400 : 500).json({ 
        message: isTermsError 
          ? "Groq TTS model requires terms acceptance. Please accept the terms at https://console.groq.com/playground?model=playai-tts"
          : "Failed to generate speech",
        error: error.message,
        fallback: true // Always fallback to browser TTS on error
      });
    }
  });

  app.post("/api/teddy/ask", requireAuth, async (req, res) => {
    try {
      const { question, role } = req.body;

      if (!question || typeof question !== 'string') {
        return res.status(400).json({ message: "Question is required" });
      }

      const userId = req.user!.id;
      const userRole = role || req.user!.role;

      // Build context based on user role
      let context = `You are helping a ${userRole === 'DOCTOR' ? 'doctor' : 'patient'} user on the TeddyBridge platform.\n\n`;

      if (userRole === 'DOCTOR') {
        // Gather doctor's context
        const [linkedPatients, surveys, calls, availableDoctors] = await Promise.all([
          storage.getLinkRecordsForDoctor(userId).catch(() => []),
          storage.getSurveysForDoctor(userId).catch(() => []),
          storage.getCallsForDoctor(userId).catch(() => []),
          storage.getAvailableDoctors().catch(() => []),
        ]);

        // Filter out placeholder records (where patientId === doctorId, created when QR code is generated)
        const actualLinkedPatients = linkedPatients.filter(record => record.patientId !== record.doctorId);
        const patientCount = actualLinkedPatients.length;
        
        // Fetch patient details for linked patients (for survey sending and context)
        const linkedPatientsWithDetails = [];
        for (const record of actualLinkedPatients.slice(0, 20)) { // Limit to first 20 for performance
          try {
            const patient = await storage.getUserWithProfile(record.patientId);
            if (patient) {
              linkedPatientsWithDetails.push({
                id: patient.id,
                name: patient.name || '',
                email: patient.email || '',
              });
            }
          } catch (error) {
            // Skip if patient not found
          }
        }
        const pendingSurveys = surveys.filter(s => !s.responseData).length;
        const completedSurveys = surveys.filter(s => s.responseData).length;
        const totalCalls = calls.filter(c => c.endedAt && !c.isLive).length;
        const otherDoctors = availableDoctors.filter((d: any) => d.id !== userId);

        context += `DOCTOR CONTEXT:\n`;
        context += `- Total linked patients: ${patientCount}\n`;
        context += `- Pending surveys: ${pendingSurveys}\n`;
        context += `- Completed surveys: ${completedSurveys}\n`;
        context += `- Total completed calls: ${totalCalls}\n`;
        context += `- Available doctors to call: ${otherDoctors.length}\n\n`;

        if (patientCount > 0) {
          context += `You have ${patientCount} linked patient${patientCount > 1 ? 's' : ''}:\n`;
          for (const patient of linkedPatientsWithDetails.slice(0, 10)) { // Limit to first 10 for context size
            context += `  - ${patient.name} (ID: ${patient.id})\n`;
          }
          if (linkedPatientsWithDetails.length > 10) {
            context += `  ... and ${linkedPatientsWithDetails.length - 10} more\n`;
          }
        }
        if (pendingSurveys > 0) {
          context += `You have ${pendingSurveys} pending survey${pendingSurveys > 1 ? 's' : ''} awaiting completion.\n`;
        }
        if (completedSurveys > 0) {
          context += `You have ${completedSurveys} completed survey${completedSurveys > 1 ? 's' : ''} ready for review.\n`;
        }

        // Add available doctors with their phone numbers
        if (otherDoctors.length > 0) {
          context += `\n=== AVAILABLE DOCTORS TO CALL ===\n`;
          context += `The following doctors are available for doctor-to-doctor calls. When a user asks to call someone, you MUST search this list first:\n\n`;
          otherDoctors.forEach((doctor: any) => {
            const phoneNumber = doctor.doctorProfile?.phoneNumber || doctor.phoneNumber || 'Not available';
            const specialty = doctor.doctorProfile?.specialty || 'General';
            const email = doctor.email || 'Not available';
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, ''); // Remove formatting for matching
            context += `Doctor: ${doctor.name}\n`;
            context += `  - Phone: ${phoneNumber} (digits only: ${cleanPhone})\n`;
            context += `  - Specialty: ${specialty}\n`;
            context += `  - Email: ${email}\n`;
            context += `  - ID: ${doctor.id}\n\n`;
          });
          context += `=== CALL REQUEST HANDLING ===\n`;
          context += `When a user asks to call someone (e.g., "call amit saraswat" or "call 9622046298"):\n`;
          context += `1. FIRST, search the AVAILABLE DOCTORS list above by:\n`;
          context += `   - Matching names (be flexible: "Amit Saraswat" matches "Dr. Amit Kumar Saraswat", "Amit Saraswat", etc.)\n`;
          context += `   - Matching phone numbers (compare digits only, ignore spaces/dashes/formatting)\n`;
          context += `2. If you find a match, check the phone number:\n`;
          context += `   - If phone number is "Not available" or missing:\n`;
          context += `     * Say: "I found Dr. [name] - Phone: Not available, Specialty: [specialty]. Unfortunately, I cannot initiate a call because Dr. [name]'s phone number is not available in the system."\n`;
          context += `     * DO NOT offer to initiate a call\n`;
          context += `     * DO NOT say "Would you like me to initiate the call?"\n`;
          context += `     * Suggest alternative contact methods (email, dashboard messaging)\n`;
          context += `   - If phone number IS available:\n`;
          context += `     * Say: "I found Dr. [exact name from list] - Phone: [exact phone from list], Specialty: [specialty]. I can help you initiate a call to them."\n`;
          context += `     * Offer to initiate the call\n`;
          context += `   - DO NOT give generic instructions about navigating the UI\n`;
          context += `   - DO NOT tell them to search manually\n`;
          context += `   - Provide the specific information you found\n`;
          context += `3. If NO match is found in the list, then say: "I couldn't find [name/phone] in the available doctors list. They may not be registered on the platform yet, or you might need to add them first."\n`;
          context += `\nCRITICAL: Always check the AVAILABLE DOCTORS list FIRST before responding about calls. NEVER offer to call if phone number is "Not available".\n`;
        } else {
          context += `\nNo other doctors are currently available to call.\n`;
        }

        context += `\nYou can help with questions about:\n`;
        context += `- Patient management and linked patients\n`;
        context += `- PROMS (Patient-Reported Outcome Measures) surveys\n`;
        context += `- Sending pre-operative or post-operative surveys to patients\n`;
        context += `- Survey responses and analytics\n`;
        context += `- Doctor-to-doctor calls and consultations\n`;
        context += `- QR code generation for patient linking\n`;
        context += `\nSURVEY SENDING:\n`;
        context += `- When a user asks to send a survey (e.g., "send pre-op survey to [patient name]" or "send post-op survey to [patient name]"), the system will automatically:\n`;
        context += `  1. Find the patient in the linked patients list\n`;
        context += `  2. Create a survey request\n`;
        context += `  3. Send an email with the survey link to the patient\n`;
        context += `- Just confirm with the user that you'll send the survey, and ask them to confirm if needed.\n`;
      } else {
        // Gather patient's context
        const [connections, surveys, linkedDoctors] = await Promise.all([
          storage.getConnectionsForPatient(userId).catch(() => []),
          storage.getSurveysForPatient(userId).catch(() => []),
          storage.getLinkRecordsForPatient(userId).catch(() => []),
        ]);

        const confirmedConnections = connections.filter(c => c.status === 'CONFIRMED').length;
        const pendingRequests = connections.filter(c => c.status === 'PENDING').length;
        const surveyCount = surveys.length;
        const doctorCount = linkedDoctors.length;

        // Fetch doctor details for linked doctors
        const linkedDoctorsWithDetails = [];
        for (const record of linkedDoctors.slice(0, 20)) { // Limit to first 20 for performance
          try {
            const doctor = await storage.getUserWithProfile(record.doctorId);
            if (doctor && doctor.doctorProfile) {
              linkedDoctorsWithDetails.push({
                id: doctor.id,
                name: doctor.name || '',
                email: doctor.email || '',
                specialty: doctor.doctorProfile.specialty || 'General',
                phoneNumber: doctor.doctorProfile.phoneNumber || 'Not available',
              });
            }
          } catch (error) {
            // Skip if doctor not found
          }
        }

        context += `PATIENT CONTEXT:\n`;
        context += `- Confirmed peer connections: ${confirmedConnections}\n`;
        context += `- Pending connection requests: ${pendingRequests}\n`;
        context += `- Total surveys received: ${surveyCount}\n`;
        context += `- Linked doctors: ${doctorCount}\n\n`;

        if (doctorCount > 0) {
          context += `You have ${doctorCount} linked doctor${doctorCount > 1 ? 's' : ''}:\n`;
          for (const doctor of linkedDoctorsWithDetails.slice(0, 10)) { // Limit to first 10 for context size
            const phoneDisplay = doctor.phoneNumber && doctor.phoneNumber !== 'Not available' ? doctor.phoneNumber : 'N/A';
            context += `  - Dr. ${doctor.name} (Specialty: ${doctor.specialty}, Phone: ${phoneDisplay}, Email: ${doctor.email})\n`;
          }
          if (linkedDoctorsWithDetails.length > 10) {
            context += `  ... and ${linkedDoctorsWithDetails.length - 10} more\n`;
          }
          context += `\n`;
          
          // Add call handling instructions for patients
          context += `=== CRITICAL: PATIENT CALLING RULES ===\n`;
          context += `🚫 PATIENTS CANNOT CALL DOCTORS - This is STRICTLY PROHIBITED.\n`;
          context += `✅ PATIENTS CAN ONLY CALL OTHER PATIENTS (peer-to-peer connections)\n`;
          context += `\nCALLING RULES FOR PATIENTS:\n`;
          context += `1. ✅ ALLOWED: Patient-to-Patient calls (only with confirmed peer connections)\n`;
          context += `2. 🚫 NOT ALLOWED: Patient-to-Doctor calls (completely disabled)\n`;
          context += `3. 🚫 NOT ALLOWED: Any attempt to call a doctor will be rejected\n`;
          context += `\nWhen a patient asks to call a doctor:\n`;
          context += `- IMMEDIATELY and CLEARLY state: "I'm sorry, but patients cannot call doctors through this platform. The calling feature is only available for connecting with other patients (peers)."\n`;
          context += `- Explain alternative contact methods:\n`;
          context += `  * Email (if doctor's email is available)\n`;
          context += `  * Dashboard messaging/communication features\n`;
          context += `  * Regular healthcare communication channels\n`;
          context += `- DO NOT suggest or offer any workaround to call doctors\n`;
          context += `- DO NOT say "I can help you initiate a call" when referring to doctors\n`;
          context += `- You can show doctor information (name, specialty, email) but emphasize they cannot be called\n`;
          context += `\nWhen a patient asks to call another patient:\n`;
          context += `- This IS allowed if they have a confirmed peer connection\n`;
          context += `- You can help them initiate patient-to-patient calls\n`;
          context += `- Check if they have confirmed connections first\n`;
          context += `\nExample responses:\n`;
          context += `- For doctor call request: "I understand you'd like to contact Dr. [Name]. However, patients cannot make voice calls to doctors through this platform. The calling feature is only for connecting with other patients. You can reach Dr. [Name] via email at [email] or through the communication features in your Doctors dashboard."\n`;
          context += `- For patient call request: "I can help you call [Patient Name]. Let me check if you have a confirmed connection with them..."\n\n`;
        }

        if (confirmedConnections > 0) {
          context += `You have ${confirmedConnections} confirmed peer connection${confirmedConnections > 1 ? 's' : ''}.\n`;
        }
        if (surveyCount > 0) {
          context += `You have ${surveyCount} survey${surveyCount > 1 ? 's' : ''} from your doctor${surveyCount > 1 ? 's' : ''}.\n`;
        }

        context += `\nYou can help with questions about:\n`;
        context += `- Peer connections and matching\n`;
        context += `- Patient-to-Patient calls (ONLY - not doctor calls)\n`;
        context += `- Connection requests (pending, accepted, declined)\n`;
        context += `- Surveys from your doctors\n`;
        context += `- Scheduled meetings with peers\n`;
        context += `- Your profile and preferences\n`;
        context += `- Match percentages with other patients (if enabled)\n`;
        context += `\nREMEMBER: As a patient, you can ONLY call other patients, NEVER doctors.\n`;
      }

      // Import groqService dynamically
      const { groqService } = await import("./services/groq");
      
      // Pre-process call requests: try to find doctor in list if user asks to call someone
      // Also handle survey sending requests and confirmations
      let enhancedQuestion = question;
      // More flexible confirmation detection - matches "yes", "yes please", "yes, please", etc.
      // Allow optional punctuation and whitespace
      const trimmedQuestion = question.trim().toLowerCase();
      const isConfirmation = /^(yes|yeah|yep|okay|ok|sure|please|initiate|start|go ahead|do it|proceed)(\s+please)?[,.!]*$/.test(trimmedQuestion) ||
                             /^(yes|yeah|yep|okay|ok|sure),?\s+(please|go ahead|do it|proceed)[,.!]*$/.test(trimmedQuestion);
      const isCallRequest = /call|phone|contact/i.test(question);
      const isSurveyRequest = /send.*survey|survey.*send|pre.?op|post.?op|pre.?operative|post.?operative/i.test(question);
      
      console.log(`[Teddy] Question: "${question}", trimmed: "${trimmedQuestion}", isConfirmation: ${isConfirmation}, isCallRequest: ${isCallRequest}`);
      console.log(`[Teddy] Session lastFoundDoctorForCall:`, (req.session as any).lastFoundDoctorForCall);
      
      // Handle survey sending requests
      if (userRole === 'DOCTOR' && isSurveyRequest) {
        // Fetch linked patients for survey sending
        const [linkedPatients] = await Promise.all([
          storage.getLinkRecordsForDoctor(userId).catch(() => []),
        ]);
        const actualLinkedPatients = linkedPatients.filter(record => record.patientId !== record.doctorId);
        const surveyLinkedPatientsWithDetails: any[] = [];
        for (const record of actualLinkedPatients.slice(0, 20)) {
          try {
            const patient = await storage.getUserWithProfile(record.patientId);
            if (patient) {
              surveyLinkedPatientsWithDetails.push({
                id: patient.id,
                name: patient.name || '',
                email: patient.email || '',
              });
            }
          } catch (error) {
            // Skip if patient not found
          }
        }
        
        // Detect survey type (pre-op or post-op)
        const isPreOp = /pre.?op|pre.?operative/i.test(question);
        const isPostOp = /post.?op|post.?operative/i.test(question);
        const surveyType = isPreOp ? 'preop' : (isPostOp ? 'postop' : null);
        
        // Extract patient name from question (remove survey-related words)
        const cleanedQuestion = question
          .replace(/send|survey|pre.?op|post.?op|pre.?operative|post.?operative|to|the|patient/gi, '')
          .trim();
        
        // Check if user said "this patient" or "this" - use first patient if only one exists
        const isThisPatient = /this/i.test(cleanedQuestion);
        let foundPatient: any = null;
        
        if (isThisPatient && surveyLinkedPatientsWithDetails.length === 1) {
          // User said "this patient" and there's only one patient
          foundPatient = surveyLinkedPatientsWithDetails[0];
        } else if (surveyLinkedPatientsWithDetails.length > 0) {
          // Extract name patterns from the question
          const patientNamePatterns = cleanedQuestion
            .replace(/this/gi, '') // Remove "this" if present
            .trim()
            .split(/\s+/)
            .filter(word => word.length > 2);
          
          if (patientNamePatterns.length > 0) {
            // Try to find patient by name matching
            foundPatient = surveyLinkedPatientsWithDetails.find((patient: any) => {
              const patientName = (patient.name || '').toLowerCase();
              // Check if all patterns match (flexible matching)
              return patientNamePatterns.every(pattern => {
                const patternLower = pattern.toLowerCase();
                // Check if pattern is in the full name
                if (patientName.includes(patternLower)) return true;
                // Check if pattern matches any part of the name
                const nameParts = patientName.split(/\s+/);
                return nameParts.some(part => 
                  part.startsWith(patternLower) || 
                  patternLower.startsWith(part) ||
                  part === patternLower
                );
              });
            });
          } else if (surveyLinkedPatientsWithDetails.length === 1) {
            // No name provided but only one patient - use that one
            foundPatient = surveyLinkedPatientsWithDetails[0];
          }
        }
        
        if (foundPatient && surveyType) {
          // Store in session for confirmation
          (req.session as any).pendingSurveySend = {
            patientId: foundPatient.id,
            patientName: foundPatient.name,
            surveyType: surveyType,
          };
          
          context += `\n\n=== SURVEY SEND REQUEST DETECTED - PATIENT FOUND ===\n`;
          context += `The user wants to send a ${surveyType === 'preop' ? 'pre-operative' : 'post-operative'} survey.\n`;
          context += `PATIENT FOUND: ${foundPatient.name} (ID: ${foundPatient.id})\n`;
          context += `\nCRITICAL INSTRUCTIONS:\n`;
          context += `- You MUST immediately confirm that you will send the survey to ${foundPatient.name}\n`;
          context += `- Say: "I'll send a ${surveyType === 'preop' ? 'pre-operative' : 'post-operative'} survey to ${foundPatient.name}. Would you like me to proceed?"\n`;
          context += `- DO NOT ask which patient - you have already identified them\n`;
          context += `- DO NOT ask which survey type - it's already specified (${surveyType === 'preop' ? 'pre-op' : 'post-op'})\n`;
          context += `- Simply confirm and ask for final approval\n`;
        } else if (!foundPatient && surveyLinkedPatientsWithDetails.length > 0 && surveyType) {
          // If only one patient and survey type is specified, use that patient automatically
          if (surveyLinkedPatientsWithDetails.length === 1) {
            foundPatient = surveyLinkedPatientsWithDetails[0];
            // Store in session for confirmation
            (req.session as any).pendingSurveySend = {
              patientId: foundPatient.id,
              patientName: foundPatient.name,
              surveyType: surveyType,
            };
            context += `\n\n=== SURVEY SEND REQUEST DETECTED - PATIENT FOUND (SINGLE PATIENT) ===\n`;
            context += `The user wants to send a ${surveyType === 'preop' ? 'pre-operative' : 'post-operative'} survey.\n`;
            context += `Since there's only one linked patient, I'm using: ${foundPatient.name} (ID: ${foundPatient.id})\n`;
            context += `\nCRITICAL INSTRUCTIONS:\n`;
            context += `- You MUST immediately confirm: "I'll send a ${surveyType === 'preop' ? 'pre-operative' : 'post-operative'} survey to ${foundPatient.name}. Would you like me to proceed?"\n`;
            context += `- DO NOT ask which patient - there's only one\n`;
            context += `- DO NOT ask which survey type - it's already specified\n`;
          } else {
            context += `\n\n=== SURVEY SEND REQUEST ===\n`;
            context += `The user wants to send a ${surveyType === 'preop' ? 'pre-operative' : 'post-operative'} survey, but I couldn't identify which patient. Available linked patients:\n`;
            surveyLinkedPatientsWithDetails.forEach((patient: any) => {
              context += `- ${patient.name}\n`;
            });
            context += `\nAsk: "Which patient would you like to send the ${surveyType === 'preop' ? 'pre-operative' : 'post-operative'} survey to?"\n`;
          }
        } else if (!surveyType) {
          context += `\n\n=== SURVEY SEND REQUEST ===\n`;
          context += `The user wants to send a survey. Ask them to specify whether it's a pre-operative (pre-op) or post-operative (post-op) survey.\n`;
        } else if (surveyLinkedPatientsWithDetails.length === 0) {
          context += `\n\n=== SURVEY SEND REQUEST ===\n`;
          context += `The user wants to send a survey, but there are no linked patients. They need to link patients first before sending surveys.\n`;
        }
      }
      
      // Handle survey send confirmations
      if (userRole === 'DOCTOR' && isConfirmation && !isCallRequest) {
        const pendingSurvey = (req.session as any).pendingSurveySend;
        if (pendingSurvey) {
          // Clear the session
          delete (req.session as any).pendingSurveySend;
          
          try {
            // Actually send the survey by directly calling the survey sending logic
            const patient = await storage.getUser(pendingSurvey.patientId);
            if (!patient) {
              return res.json({ 
                answer: `I couldn't find the patient. Please try again.`,
              });
            }

            // Import REDCap service
            const { redcapService } = await import("./services/redcap");

            // Generate or get REDCap survey link
            let redcapSurveyLink = process.env.REDCAP_SURVEY_LINK || "https://redcap.link/CarebridgeAI";
            let redcapRecordId: string | null = null;
            let redcapEvent: string | undefined = undefined;

            // If REDCap API is configured, try to create a record and get survey link
            if (redcapService.isConfigured()) {
              try {
                // Create a unique record ID using patient ID and timestamp (matching endpoint format)
                const recordId = `${pendingSurvey.patientId.substring(0, 8)}-${Date.now()}`;
                
                // Create record in REDCap with patient data (matching endpoint format)
                const recordData: any = {
                  record_id: recordId,
                };
                
                // Add patient identifier if available
                if (patient.email) {
                  recordData.patient_email = patient.email;
                }
                recordData.patient_id = pendingSurvey.patientId;
                recordData.survey_type = pendingSurvey.surveyType;
                recordData.survey_status = "SENT";
                
                const createResult = await redcapService.importRecords([recordData]);

                if (createResult.success) {
                  redcapRecordId = recordId;
                  
                  // Try to get survey link - use a default form name if needed
                  const formName = `${pendingSurvey.surveyType}_survey`;
                  const surveyLinkResponse = await redcapService.exportSurveyLink(
                    recordId,
                    formName,
                    redcapEvent,
                    "survey"
                  );
                  
                  if (surveyLinkResponse.success && surveyLinkResponse.data) {
                    redcapSurveyLink = surveyLinkResponse.data;
                  }
                }
              } catch (error) {
                console.error("Error creating REDCap record:", error);
                // Continue with static link if REDCap fails
              }
            }

            // Create survey request in database (matching the endpoint's format)
            const formName = `${pendingSurvey.surveyType}_survey`;
            const surveyRequest = await storage.createSurveyRequest({
              doctorId: userId,
              patientId: pendingSurvey.patientId,
              formName: formName,
              when: pendingSurvey.surveyType,
              status: "SENT",
              surveyLink: redcapSurveyLink,
              redcapRecordId: redcapRecordId,
              redcapEvent: redcapEvent,
            });

            // Send email with survey link (using same approach as the endpoint)
            if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL && patient.email) {
              try {
                
                const surveyTypeLabel = pendingSurvey.surveyType === 'preop' ? 'Pre-Operative' : 'Post-Operative';
                await sgMail.send({
                  to: patient.email,
                  from: process.env.SENDGRID_FROM_EMAIL,
                  subject: `PROMS Survey from ${(req.user as any)?.name || 'Your Doctor'} - TeddyBridge`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2 style="color: #2563eb;">Please Complete Your ${surveyTypeLabel} Survey</h2>
                      <p>Dr. ${(req.user as any)?.name || 'Your doctor'} has requested that you complete a health outcomes survey.</p>
                      <p>This survey helps your care team track your progress and provide better care.</p>
                      <div style="margin: 30px 0; text-align: center;">
                        <a href="${redcapSurveyLink}" 
                           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                          Complete Survey
                        </a>
                      </div>
                      <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
                      <p style="color: #2563eb; word-break: break-all; font-size: 12px;">${redcapSurveyLink}</p>
                      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                      <p style="color: #666; font-size: 12px;">This is an automated message from TeddyBridge. Please do not reply to this email.</p>
                    </div>
                  `,
                });
              } catch (emailError: any) {
                console.error("Email sending failed:", emailError);
                // Continue even if email fails - survey is still created
              }
            }
            
            // Create audit log
            try {
              await storage.createAuditLog({
                userId: userId,
                action: "SURVEY_SENT",
                resourceType: "survey_request",
                resourceId: surveyRequest.id,
                metadata: { patientId: pendingSurvey.patientId, when: pendingSurvey.surveyType, surveyLink: redcapSurveyLink },
              });
            } catch (auditError) {
              console.error("Audit log creation failed:", auditError);
              // Continue even if audit log fails
            }

            // Return success message - survey was created even if email failed
            return res.json({ 
              answer: `Perfect! I've sent the ${pendingSurvey.surveyType === 'preop' ? 'pre-operative' : 'post-operative'} survey to ${pendingSurvey.patientName}. ${process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL && patient.email ? 'They will receive an email with the survey link shortly.' : 'The survey link has been generated and is available in your dashboard.'}`,
              action: 'survey_sent',
            });
          } catch (error: any) {
            console.error("Error sending survey:", error);
            return res.json({ 
              answer: `I encountered an error while sending the survey: ${error.message || 'Please try again.'}`,
            });
          }
        }
      }
      
      // Handle standalone confirmations FIRST - check session for last found doctor
      // This must happen BEFORE the call request block to catch "yes" confirmations
      // Check the question itself for keywords, not the context (context always has patient info)
      const hasPatientKeywords = /patient|link|view|details|information|add|manage|survey|prom|qr|code/i.test(question);
      
      // BLOCK PATIENT-TO-DOCTOR CALLS - This is strictly prohibited
      if (userRole === 'PATIENT' && isCallRequest) {
        // Check if they're trying to call a doctor (not a patient)
        const doctorKeywords = /doctor|dr\.|physician|specialist/i.test(question);
        if (doctorKeywords) {
          console.log(`[Teddy] 🚫 BLOCKED: Patient attempted to call a doctor`);
          return res.json({
            answer: "I'm sorry, but patients cannot call doctors through this platform. The calling feature is only available for connecting with other patients (peers). You can contact your doctor via email or through the communication features in your Doctors dashboard."
          });
        }
        // If they're trying to call a patient, that's allowed - let it proceed
        // The context already has instructions about patient-to-patient calls
      }
      
      // Check for call confirmation (yes after finding a doctor)
      // IMPORTANT: This check must happen BEFORE any AI processing
      // ONLY for doctors - patients cannot confirm doctor calls
      if (userRole === 'DOCTOR' && isConfirmation && !isCallRequest && !hasPatientKeywords) {
        // Check if we have a pending call request in the session
        const lastFoundDoctor = (req.session as any).lastFoundDoctorForCall;
        console.log(`[Teddy] Checking for call confirmation - lastFoundDoctor:`, lastFoundDoctor);
        if (lastFoundDoctor && lastFoundDoctor.id && lastFoundDoctor.name) {
          const doctorName = lastFoundDoctor.name.replace(/^Dr\.?\s+/i, '').trim();
          console.log(`[Teddy] ✓ Call confirmation detected for Dr. ${doctorName}, initiating call...`);
          // Clear the session
          delete (req.session as any).lastFoundDoctorForCall;
          // Save session after clearing
          await new Promise<void>((resolve) => {
            req.session.save((err) => {
              if (err) console.error("Error saving session after clearing:", err);
              resolve();
            });
          });
          return res.json({ 
            answer: `Perfect! I'll initiate the call to Dr. ${doctorName} now. Please wait a moment while I connect you. You will receive a phone call shortly that will connect both you and Dr. ${doctorName} in a secure conference call.`,
            action: 'initiate_call',
            doctorId: lastFoundDoctor.id,
            doctorName: doctorName
          });
        } else {
          console.log(`[Teddy] ✗ No pending doctor in session for confirmation`);
        }
      }
      
      if (userRole === 'DOCTOR' && (isCallRequest || isConfirmation)) {
        const [availableDoctors] = await Promise.all([
          storage.getAvailableDoctors().catch(() => []),
        ]);
        const otherDoctors = availableDoctors.filter((d: any) => d.id !== userId);
        
        // Extract potential name or phone number from question
        const phoneMatch = question.match(/\b\d{10,}\b/); // 10+ digits
        const phoneNumber = phoneMatch ? phoneMatch[0] : null;
        
        // Normalize phone numbers for comparison
        const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, '');
        
        let foundDoctor: any = null;
        
        // Try to find by phone number first (more reliable)
        if (phoneNumber) {
          const normalizedQueryPhone = normalizePhone(phoneNumber);
          foundDoctor = otherDoctors.find((doctor: any) => {
            const doctorPhone = doctor.doctorProfile?.phoneNumber || doctor.phoneNumber || '';
            return normalizePhone(doctorPhone) === normalizedQueryPhone || 
                   normalizePhone(doctorPhone).endsWith(normalizedQueryPhone) ||
                   normalizedQueryPhone.endsWith(normalizePhone(doctorPhone));
          });
        }
        
        // If not found by phone, try by name
        if (!foundDoctor) {
          const namePatterns = question.toLowerCase()
            .replace(/call|phone|contact|doctor|dr\.?/gi, '')
            .trim()
            .split(/\s+/)
            .filter(word => word.length > 2);
          
          if (namePatterns.length > 0) {
            foundDoctor = otherDoctors.find((doctor: any) => {
              const doctorName = (doctor.name || '').toLowerCase();
              // Check if all name parts match (flexible matching)
              return namePatterns.every(pattern => doctorName.includes(pattern)) ||
                     namePatterns.some(pattern => {
                       const parts = doctorName.split(/\s+/);
                       return parts.some(part => part.startsWith(pattern) || pattern.startsWith(part));
                     });
            });
          }
        }
        
        // If we found a doctor, add it to the context for the AI
        if (foundDoctor) {
          const phoneNumber = foundDoctor.doctorProfile?.phoneNumber || foundDoctor.phoneNumber || 'Not available';
          const specialty = foundDoctor.doctorProfile?.specialty || 'General';
          const hasPhoneNumber = phoneNumber && phoneNumber !== 'Not available' && phoneNumber.trim().length > 0;
          // Clean up name to avoid duplicate "Dr" prefix
          let doctorName = foundDoctor.name || '';
          doctorName = doctorName.replace(/^Dr\.?\s+/i, '').trim(); // Remove leading "Dr" or "Dr."
          
          context += `\n\n=== CALL REQUEST DETECTED ===\n`;
          context += `The user asked to call someone, and I found a match in the available doctors list:\n`;
          context += `FOUND DOCTOR: ${doctorName}\n`;
          context += `Phone: ${phoneNumber}\n`;
          context += `Specialty: ${specialty}\n`;
          context += `ID: ${foundDoctor.id}\n`;
          
          if (hasPhoneNumber) {
            // Doctor has a phone number - can initiate call
            context += `\nYou MUST respond with the exact information above. Do NOT give generic UI navigation instructions.`;
            context += `\nSay: "I found Dr. ${doctorName} - Phone: ${phoneNumber}, Specialty: ${specialty}. Would you like me to initiate the call?"\n`;
            context += `\nIf the user responds with "yes", "yeah", "yep", "okay", "ok", "sure", "please", or "initiate", you should respond with:\n`;
            context += `"Perfect! I'll initiate the call to Dr. ${doctorName} now. You will receive a phone call shortly. The call will connect both you and Dr. ${doctorName} in a secure conference call."\n`;
            context += `\nIMPORTANT: When user confirms they want to call, acknowledge it and explain what will happen next.`;
            
            // Store the found doctor in session for confirmation handling
            (req.session as any).lastFoundDoctorForCall = {
              id: foundDoctor.id,
              name: doctorName
            };
            console.log(`[Teddy] Stored doctor in session for confirmation:`, (req.session as any).lastFoundDoctorForCall);
          } else {
            // Doctor does NOT have a phone number - cannot initiate call
            context += `\n⚠️ CRITICAL: This doctor's phone number is "Not available". You CANNOT initiate a call without a phone number.\n`;
            context += `\nYou MUST respond with:\n`;
            context += `"I found Dr. ${doctorName} - Phone: Not available, Specialty: ${specialty}. Unfortunately, I cannot initiate a call because Dr. ${doctorName}'s phone number is not available in the system. You may want to contact them via email (${foundDoctor.email || 'email not available'}) or through other communication channels."\n`;
            context += `\nDO NOT offer to initiate a call. DO NOT say "Would you like me to initiate the call?" DO NOT store this doctor for call initiation.`;
            
            // Clear any previous call session data
            (req.session as any).lastFoundDoctorForCall = undefined;
          }
          
          // Save session to ensure it persists
          await new Promise<void>((resolve) => {
            req.session.save((err) => {
              if (err) console.error("Error saving session:", err);
              resolve();
            });
          });
        }
      }
      
      // Get response from Groq
      const answer = await groqService.chat(enhancedQuestion, context);

      res.json({ answer });
    } catch (error: any) {
      console.error("Error with Teddy AI:", error);
      res.status(500).json({ 
        message: "Failed to get AI response", 
        error: error.message || "Internal server error" 
      });
    }
  });

  return httpServer;
}
