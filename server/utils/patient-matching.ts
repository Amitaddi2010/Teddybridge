import type { PatientProfile } from "@shared/schema";

interface PatientMatchData {
  demographics?: {
    age?: number;
    gender?: string;
    procedure?: string;
  } | null;
}

/**
 * Calculate match percentage between two patients
 * Returns 0-100 percentage based on:
 * - Same procedure type (required, 50% weight)
 * - Age similarity (30% weight, -2% per year difference)
 * - Gender match (20% weight, optional)
 */
export function calculateMatchPercentage(
  patient1: PatientMatchData,
  patient2: PatientMatchData
): number {
  let score = 0;
  
  const proc1 = patient1.demographics?.procedure;
  const proc2 = patient2.demographics?.procedure;
  const age1 = patient1.demographics?.age;
  const age2 = patient2.demographics?.age;
  const gender1 = patient1.demographics?.gender;
  const gender2 = patient2.demographics?.gender;
  
  // Same procedure is required (50% weight)
  if (!proc1 || !proc2) {
    return 0; // Can't match without procedure info
  }
  
  if (proc1 === proc2) {
    score += 50;
  } else {
    return 0; // No match if different procedures
  }
  
  // Age similarity (30% weight)
  // -2% per year difference, max 30 points
  if (age1 && age2) {
    const ageDiff = Math.abs(age1 - age2);
    const ageScore = Math.max(0, 30 - (ageDiff * 2));
    score += ageScore;
  }
  
  // Gender match (20% weight, optional)
  // Only add points if both have gender specified and they match
  if (gender1 && gender2 && gender1 === gender2) {
    score += 20;
  }
  
  return Math.min(100, Math.round(score));
}

