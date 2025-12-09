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
  type User 
} from "@shared/schema";
import { z } from "zod";
import sgMail from "@sendgrid/mail";
import twilio from "twilio";
import { redcapService } from "./services/redcap";
import { assemblyAIService } from "./services/assemblyai";
import { groqService } from "./services/groq";
import { pdfGenerator } from "./services/pdf-generator";

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

  // Initialize Twilio
  let twilioClient = null;
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
    console.log("✗ Twilio client NOT initialized:");
    if (!accountSid || accountSid === 'your-twilio-account-sid') {
      console.log(`  TWILIO_ACCOUNT_SID: NOT SET or using placeholder`);
    } else if (!accountSid.startsWith('AC')) {
      console.log(`  TWILIO_ACCOUNT_SID: Invalid format (must start with 'AC')`);
    } else {
      console.log(`  TWILIO_ACCOUNT_SID: SET`);
    }
    if (!authToken || authToken === 'your-twilio-auth-token') {
      console.log(`  TWILIO_AUTH_TOKEN: NOT SET or using placeholder`);
    } else {
      console.log(`  TWILIO_AUTH_TOKEN: SET`);
    }
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
      const { name, phoneNumber, demographics, specialty, city, education, experience, institution, languages, shortBio, linkedinUrl } = req.body;
      
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

  app.get("/api/patient/connections", requireRole("PATIENT"), async (req, res) => {
    try {
      const connections = await storage.getConnectionsForPatient(req.user!.id);
      res.json(connections);
    } catch (error) {
      console.error("Error fetching connections:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/patient/surveys", requireRole("PATIENT"), async (req, res) => {
    try {
      const surveys = await storage.getSurveysForPatient(req.user!.id);
      res.json(surveys);
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
            
            // Get survey link for this record
            const surveyLinkResponse = await redcapService.exportSurveyLink(
              recordId,
              formName || `${when}_survey`,
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
        return res.status(503).json({ message: "REDCap API not configured" });
      }

      const surveys = await storage.getSurveysForDoctor(req.user!.id);
      const pendingSurveys = surveys.filter(s => 
        s.status === "SENT" || s.status === "PENDING"
      );

      const updated = [];
      const errors = [];

      for (const survey of pendingSurveys) {
        try {
          // If survey has redcapRecordId, check directly
          if (survey.redcapRecordId) {
            const completionStatus = await redcapService.checkSurveyCompletion(
              survey.redcapRecordId,
              survey.formName || "survey",
              survey.redcapEvent || undefined
            );

            if (completionStatus.completed) {
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
                  
                  // Try to find a matching record
                  // Look for records with patient email, patient_id, or created around the same time
                  const matchingRecord = records.find((record: any) => {
                    // Match by patient email if available (case-insensitive)
                    if (patient.email) {
                      const recordEmail = record.patient_email || record.email || record.patient_email_address || record.email_address;
                      if (recordEmail && recordEmail.toLowerCase().trim() === patient.email.toLowerCase().trim()) {
                        console.log(`[Poll] Found match by email: ${recordEmail} for survey ${survey.id}`);
                        return true;
                      }
                    }
                    // Match by patient ID if available
                    if (record.patient_id === survey.patientId || record.patient_identifier === survey.patientId) {
                      console.log(`[Poll] Found match by patient ID for survey ${survey.id}`);
                      return true;
                    }
                    // Match by survey type and approximate time
                    if (record.survey_type === survey.when || record.when === survey.when) {
                      // Try to extract timestamp from record_id if it's in the format we created
                      if (record.record_id && record.record_id.includes('-')) {
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

                if (matchingRecord) {
                  const recordId = matchingRecord.record_id || matchingRecord.recordId;
                  
                  console.log(`[Poll] Updating survey ${survey.id} with REDCap record ID: ${recordId}`);
                  
                  // Update survey with record ID
                  await storage.updateSurveyRequest(survey.id, {
                    redcapRecordId: recordId,
                  });

                  // Check completion status
                  const completionStatus = await redcapService.checkSurveyCompletion(
                    recordId,
                    survey.formName || "survey",
                    survey.redcapEvent || undefined
                  );

                  console.log(`[Poll] Survey ${survey.id} completion status:`, completionStatus);

                  if (completionStatus.completed) {
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
                  }
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

      res.json({
        checked: pendingSurveys.length,
        updated: updated.length,
        errors: errors.length,
        details: { updated, errors },
      });
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
          
          if (survey.redcapRecordId && redcapService.isConfigured()) {
            const response = await redcapService.getSurveyResponse(
              survey.redcapRecordId,
              survey.formName || "survey",
              survey.redcapEvent
            );
            
            if (response.success && response.data) {
              responseData = Array.isArray(response.data) ? response.data[0] : response.data;
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
      
      // Clean up stale calls for caller - be more aggressive
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
      const callerAllCalls = await storage.getCallsForDoctor(req.user!.id);
      for (const call of callerAllCalls) {
        if (!call.endedAt && call.startedAt) {
          const startedAt = new Date(call.startedAt);
          // Clean up: calls older than 2 hours OR non-live calls older than 30 minutes OR 
          // live calls older than 30 minutes (likely stale - real calls don't last that long without ending)
          if (startedAt < twoHoursAgo || 
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
          // Clean up: calls older than 2 hours OR non-live calls older than 30 minutes OR 
          // live calls older than 30 minutes (likely stale - real calls don't last that long without ending)
          if (startedAt < twoHoursAgo || 
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
      
      // More strict: only consider calls active if they're live AND started within 5 minutes, or any call started within 2 minutes (connecting)
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);
      // Use 4 minutes 30 seconds to be more aggressive (calls older than 4.5 min are considered stale)
      const fourAndHalfMinutesAgo = new Date(now.getTime() - 4.5 * 60 * 1000);
      
      const callerInCall = await (async () => {
        for (const c of callerActiveCalls) {
          if (c.endedAt) continue;
          if (!c.startedAt) continue;
          const startedAt = new Date(c.startedAt);
          // Only consider truly active: live calls started within 4.5 min, or any call started within 2 min (connecting)
          const isActive = (c.isLive && startedAt > fourAndHalfMinutesAgo) || (startedAt > twoMinutesAgo);
          
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
          // Only consider truly active: live calls started within 4.5 min, or any call started within 2 min (connecting)
          const isActive = (c.isLive && startedAt > fourAndHalfMinutesAgo) || (startedAt > twoMinutesAgo);
          
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
      
      // Fetch doctor information for each call
      const callsWithDoctors = await Promise.all(
        paginatedCalls.map(async (call) => {
          const caller = await storage.getUser(call.callerDoctorId);
          const callee = await storage.getUser(call.calleeDoctorId);
          return {
            ...call,
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
      
      let clearedCount = 0;
      for (const call of calls) {
        if (!call.endedAt && call.startedAt) {
          const startedAt = new Date(call.startedAt);
          const ageMinutes = Math.round((now.getTime() - startedAt.getTime()) / 1000 / 60);
          
          // Clear calls that are:
          // 1. Older than 2 hours (any status)
          // 2. Not live and older than 30 minutes
          // 3. Live and 5 minutes or older (likely disconnected but not properly ended)
          // Use <= to catch calls that are exactly 5 minutes old
          const shouldClear = 
            startedAt <= twoHoursAgo || 
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

      // Get caller and callee names
      const caller = await storage.getUser(call.callerDoctorId);
      const callee = await storage.getUser(call.calleeDoctorId);

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

      // Get recording URL from Twilio if recordingSid is provided
      let actualRecordingUrl = recordingUrl;
      if (!actualRecordingUrl && recordingSid && twilioClient) {
        try {
          const recording = await twilioClient.recordings(recordingSid).fetch();
          // Get MP3 URL for Assembly AI
          actualRecordingUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
          console.log(`Fetched recording URL from Twilio: ${actualRecordingUrl}`);
        } catch (error: any) {
          return res.status(400).json({ 
            message: "Failed to fetch recording from Twilio", 
            error: error.message 
          });
        }
      }

      if (!actualRecordingUrl) {
        return res.status(400).json({ message: "Recording URL or RecordingSid is required" });
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

  return httpServer;
}
