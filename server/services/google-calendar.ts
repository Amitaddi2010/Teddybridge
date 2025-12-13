/**
 * Google Calendar API Service for creating Google Meet links
 * Uses OAuth2 to create persistent, shareable Google Meet links via Calendar API
 */

import { google } from 'googleapis';

export class GoogleCalendarService {
  private get apiKey(): string {
    return process.env.GOOGLE_API_KEY || '';
  }

  private get clientId(): string {
    return process.env.GOOGLE_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.GOOGLE_CLIENT_SECRET || '';
  }

  private get redirectUri(): string {
    // Use environment variable or default to localhost for development
    // In production, this should be set to your actual domain
    const baseUrl = process.env.GOOGLE_REDIRECT_URI || process.env.BASE_URL || 'http://localhost:5000';
    return `${baseUrl}/api/google/oauth/callback`;
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Create OAuth2 client
   */
  private getOAuth2Client() {
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
  }

  /**
   * Get authorization URL for OAuth2 flow
   */
  getAuthUrl(state?: string): string {
    const oauth2Client = this.getOAuth2Client();
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: state || 'default',
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async getTokens(code: string): Promise<{ access_token: string; refresh_token?: string }> {
    const oauth2Client = this.getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens as { access_token: string; refresh_token?: string };
  }

  /**
   * Create OAuth2 client with access token
   */
  private getAuthenticatedClient(accessToken: string) {
    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: accessToken,
    });
    return oauth2Client;
  }

  /**
   * Generate a Google Meet instant meeting link
   * Uses meet.google.com/new to create a new instant meeting
   * Note: User must be signed into Google for this to work
   */
  generateInstantMeetingLink(): string {
    // meet.google.com/new creates a new instant meeting
    // This requires the user to be signed into a Google account
    return 'https://meet.google.com/new';
  }

  /**
   * Create a Google Calendar event with Google Meet link
   * 
   * @param accessToken - OAuth2 access token
   * @param meetingTitle - Title for the meeting
   * @param startTime - Meeting start time (optional, defaults to now)
   * @param durationMinutes - Meeting duration (default: 60)
   * @param attendeeEmails - Optional attendee emails
   * @returns Google Meet link
   */
  async createMeetingWithMeetLink(
    accessToken: string,
    meetingTitle: string,
    startTime?: Date,
    durationMinutes: number = 60,
    attendeeEmails?: string[]
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth2 not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    }

    try {
      const auth = this.getAuthenticatedClient(accessToken);
      const calendar = google.calendar({ version: 'v3', auth });

      const now = new Date();
      const start = startTime || now;
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

      // Create calendar event with Google Meet
      const event = {
        summary: meetingTitle,
        description: 'Patient-to-patient peer support meeting via TeddyBridge',
        start: {
          dateTime: start.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        },
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
        attendees: attendeeEmails?.map(email => ({ email })) || [],
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: event,
      });

      // Extract Meet link from response
      const meetLink = response.data.conferenceData?.entryPoints?.[0]?.uri;
      if (!meetLink) {
        throw new Error('Failed to get Google Meet link from calendar event');
      }

      return meetLink;
    } catch (error: any) {
      console.error('Error creating Google Calendar event:', error);
      throw new Error(`Failed to create Google Meet link: ${error.message}`);
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();

