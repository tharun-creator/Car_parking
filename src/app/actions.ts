'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getRegistrationByEmail,
  createRegistration,
  getRegistrationByToken,
  getRegistrationByBackupCode,
  markCheckedIn,
  appendScanLog,
  isStaff,
  Registration
} from '@/lib/sheets';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

// Zod schema for registration validation
const registrationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  phone_number: z
    .string()
    .min(6, 'Phone number must be at least 6 digits')
    .max(20, 'Phone number is too long')
    .regex(/^[\s()+-]*([0-9][\s()+-]*){6,20}$/, 'Invalid phone number format'),
  role: z.enum(['crew', 'volunteer', 'artist', 'vip', 'government', 'other'] as const),
  role_other_detail: z.string().max(200).optional(),
}).refine(data => {
  if (data.role === 'other') {
    return !!data.role_other_detail && data.role_other_detail.trim().length > 0;
  }
  return true;
}, {
  message: 'Please specify details for role "Other"',
  path: ['role_other_detail'],
});

// Simple in-memory rate limiting map for manual code entries (keyed by staff email)
const manualCodeRateLimits = new Map<string, { count: number; resetTime: number }>();
const MAX_MANUAL_ATTEMPTS_PER_MINUTE = 15;

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const limit = manualCodeRateLimits.get(email);

  if (!limit || now > limit.resetTime) {
    manualCodeRateLimits.set(email, { count: 1, resetTime: now + 60000 });
    return false;
  }

  if (limit.count >= MAX_MANUAL_ATTEMPTS_PER_MINUTE) {
    return true;
  }

  limit.count += 1;
  return false;
}

// 1. Action: Get current user's registration
export async function getMyRegistration() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const reg = await getRegistrationByEmail(session.user.email);
    return { success: true, registration: reg };
  } catch (error) {
    console.error('Error in getMyRegistration action:', error);
    return { success: false, error: 'Database connection failed' };
  }
}

// 2. Action: Register a user
export async function registerUser(formData: {
  name: string;
  phone_number: string;
  role: string;
  role_other_detail?: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { success: false, error: 'Not authenticated' };
  }

  // Validate form fields
  const validation = registrationSchema.safeParse(formData);
  if (!validation.success) {
    return {
      success: false,
      error: 'Validation failed',
      errors: validation.error.flatten().fieldErrors,
    };
  }

  try {
    const reg = await createRegistration({
      user_email: session.user.email,
      name: validation.data.name,
      phone_number: validation.data.phone_number,
      role: validation.data.role,
      role_other_detail: validation.data.role_other_detail || '',
    });

    return { success: true, registration: reg };
  } catch (error) {
    console.error('Error in registerUser action:', error);
    return { success: false, error: 'Failed to save registration' };
  }
}

// Zod schema for credentials-based registration (includes email & password)
const credentialsRegistrationSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  phone_number: z
    .string()
    .min(6, 'Phone number must be at least 6 digits')
    .max(20, 'Phone number is too long')
    .regex(/^[\s()+-]*([0-9][\s()+-]*){6,20}$/, 'Invalid phone number format'),
  role: z.enum(['crew', 'volunteer', 'artist', 'vip', 'government', 'other'] as const),
  role_other_detail: z.string().max(200).optional(),
}).refine(data => {
  if (data.role === 'other') {
    return !!data.role_other_detail && data.role_other_detail.trim().length > 0;
  }
  return true;
}, {
  message: 'Please specify details for role "Other"',
  path: ['role_other_detail'],
});

// 2b. Action: Register a credentials user (sign up + register vehicle)
export async function registerCredentialsUser(formData: {
  email: string;
  name: string;
  phone_number: string;
  role: string;
  role_other_detail?: string;
  password?: string;
}) {
  // Validate credentials registration
  const validation = credentialsRegistrationSchema.safeParse(formData);
  if (!validation.success) {
    return {
      success: false,
      error: 'Validation failed',
      errors: validation.error.flatten().fieldErrors,
    };
  }

  try {
    // Check if email already registered
    const existing = await getRegistrationByEmail(validation.data.email);
    if (existing) {
      return {
        success: false,
        error: 'Email already registered. Please sign in.',
      };
    }

    // Hash the password
    const hashed = bcrypt.hashSync(validation.data.password, 10);

    const reg = await createRegistration({
      user_email: validation.data.email,
      name: validation.data.name,
      phone_number: validation.data.phone_number,
      role: validation.data.role,
      role_other_detail: validation.data.role_other_detail || '',
      password_hash: hashed,
    });

    return { success: true, registration: reg };
  } catch (error) {
    console.error('Error in registerCredentialsUser action:', error);
    return { success: false, error: 'Failed to create credentials registration' };
  }
}


// 3. Action: Verifier/Scanner Lookup and Check-in
export async function verifyAndCheckIn(payload: {
  token?: string;
  code?: string;
  method: 'qr' | 'manual_code';
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { success: false, error: 'Not authenticated' };
  }

  const staffEmail = session.user.email;
  const isStaffUser = await isStaff(staffEmail);
  if (!isStaffUser) {
    return { success: false, error: 'Access denied: staff only' };
  }

  const timestamp = new Date().toISOString();
  const rawInput = payload.method === 'qr' ? (payload.token || '') : (payload.code || '');

  // If manual code verification, apply rate limit per staff user to prevent brute force
  if (payload.method === 'manual_code') {
    if (isRateLimited(staffEmail)) {
      return {
        success: false,
        error: 'Too many manual code verification attempts. Please wait 1 minute.',
      };
    }
  }

  try {
    // 1. Look up the registration
    let registration: Registration | null = null;
    if (payload.method === 'qr' && payload.token) {
      registration = await getRegistrationByToken(payload.token);
    } else if (payload.method === 'manual_code' && payload.code) {
      registration = await getRegistrationByBackupCode(payload.code);
    }

    if (!registration) {
      // Log failed search
      await appendScanLog({
        timestamp,
        input_method: payload.method,
        raw_input: rawInput,
        result: 'not_found',
        matched_email: '',
        scanned_by: staffEmail,
      });

      return {
        success: true,
        outcome: 'not_found' as const,
        message: 'Invalid credential. No registration found.',
      };
    }

    // 2. Perform check-in (handles already checked-in check with immediate re-read)
    const { outcome, registration: updatedReg } = await markCheckedIn(
      registration.row_id,
      staffEmail
    );

    // Log the audit event
    await appendScanLog({
      timestamp,
      input_method: payload.method,
      raw_input: rawInput,
      result: outcome,
      matched_email: updatedReg.user_email,
      scanned_by: staffEmail,
    });

    return {
      success: true,
      outcome,
      name: updatedReg.name,
      role: updatedReg.role,
      role_other_detail: updatedReg.role_other_detail,
      user_email: updatedReg.user_email,
      checked_in_at: updatedReg.checked_in_at,
      checked_in_by: updatedReg.checked_in_by,
    };
  } catch (error) {
    console.error('Error during verify and check-in:', error);
    return { success: false, error: 'Internal database error during check-in' };
  }
}
