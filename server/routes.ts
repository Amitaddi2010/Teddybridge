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
      const { name, phoneNumber, demographics, specialty, city } = req.body;
      
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

      // Use the actual REDCap survey link
      const redcapSurveyLink = process.env.REDCAP_SURVEY_LINK || "https://redcap.link/CarebridgeAI";
      
      // Create survey request
      const surveyRequest = await storage.createSurveyRequest({
        patientId,
        doctorId: req.user!.id,
        formName: formName || `${when}_survey`,
        when,
        status: "SENT",
        surveyLink: redcapSurveyLink,
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

  app.get("/api/redcap/survey/status/:id", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSurveyRequest(req.params.id);
      if (!survey) {
        return res.status(404).json({ message: "Survey not found" });
      }
      
      // Optionally check REDCap API for completion status
      // This can be implemented later if needed
      res.json(survey);
    } catch (error) {
      console.error("Error fetching survey:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Helper function to interact with REDCap API (for future use)
  async function checkRedcapSurveyStatus(recordId?: string) {
    if (!process.env.REDCAP_API_KEY || !process.env.REDCAP_API_URL) {
      return null;
    }

    try {
      const response = await fetch(process.env.REDCAP_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: process.env.REDCAP_API_KEY,
          content: 'record',
          format: 'json',
          type: 'flat',
          ...(recordId && { records: recordId }),
        }),
      });

      if (!response.ok) {
        throw new Error('REDCap API request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking REDCap status:', error);
      return null;
    }
  }

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

      const call = await storage.createDoctorCall({
        callerDoctorId: req.user!.id,
        calleeDoctorId,
        isLive: true,
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
        
        // Use inline TwiML for localhost, URL for public URLs
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial><Conference>${conferenceName}</Conference></Dial></Response>`;
        
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

        await storage.updateDoctorCall(call.id, {
          twilioCallSid: conferenceName,
        });
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
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference>${conferenceName}</Conference>
  </Dial>
</Response>`;
    
    res.type('text/xml');
    res.send(twiml);
  });

  app.post("/api/twilio/webhook/status", async (req, res) => {
    // Handle Twilio call status webhook
    console.log("Twilio status webhook:", req.body);
    res.sendStatus(200);
  });

  app.post("/api/twilio/webhook/transcription", async (req, res) => {
    // Handle Twilio transcription webhook
    console.log("Twilio transcription webhook:", req.body);
    res.sendStatus(200);
  });

  return httpServer;
}
