import { supabase } from './supabase';
import fs from 'fs';
import path from 'path';

// Interface definitions
export interface Registration {
  row_id: string;
  user_email: string;
  name: string;
  phone_number: string;
  role: string;
  role_other_detail: string;
  qr_token: string;
  backup_code: string;
  status: 'registered' | 'checked_in';
  checked_in_at: string;
  checked_in_by: string;
  created_at: string;
  password_hash: string;
}

export interface ScanLogEntry {
  timestamp: string;
  input_method: 'qr' | 'manual_code';
  raw_input: string;
  result: 'verified' | 'already_checked_in' | 'not_found';
  matched_email: string;
  scanned_by: string;
}

const MOCK_FILE_PATH = path.join(process.cwd(), 'mock_db.json');

// Helper to determine if Supabase is not configured yet
function isFallbackMode() {
  return !supabase;
}

function readMockData() {
  if (fs.existsSync(MOCK_FILE_PATH)) {
    try {
      const fileContent = fs.readFileSync(MOCK_FILE_PATH, 'utf-8');
      const data = JSON.parse(fileContent);
      return {
        registrations: (data.registrations || []) as Registration[],
        staff: (data.staff || ['staff@example.com', 'mohan@gmail.com', 'tharunriot@gmail.com']) as string[],
        scanLogs: (data.scanLogs || []) as ScanLogEntry[]
      };
    } catch (e) {
      console.error('Error reading mock DB file, resetting:', e);
    }
  }
  
  const defaultData = {
    registrations: [
      {
        row_id: '2',
        user_email: 'test@example.com',
        name: 'Test User',
        phone_number: '1234567890',
        role: 'Participant',
        role_other_detail: '',
        qr_token: 'mock-qr-token-12345',
        backup_code: 'ABCD',
        status: 'registered' as const,
        checked_in_at: '',
        checked_in_by: '',
        created_at: new Date().toISOString(),
        password_hash: '',
      },
      {
        row_id: '3',
        user_email: 'staff@example.com',
        name: 'Staff Member',
        phone_number: '0987654321',
        role: 'Staff',
        role_other_detail: '',
        qr_token: 'mock-qr-token-staff',
        backup_code: 'EFGH',
        status: 'registered' as const,
        checked_in_at: '',
        checked_in_by: '',
        created_at: new Date().toISOString(),
        password_hash: '',
      }
    ],
    staff: ['staff@example.com', 'mohan@gmail.com', 'tharunriot@gmail.com'],
    scanLogs: [] as ScanLogEntry[]
  };
  
  writeMockData(defaultData.registrations, defaultData.staff, defaultData.scanLogs);
  return defaultData;
}

function writeMockData(registrations: Registration[], staff: string[], scanLogs: ScanLogEntry[]) {
  try {
    fs.writeFileSync(MOCK_FILE_PATH, JSON.stringify({ registrations, staff, scanLogs }, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing to mock DB file:', e);
  }
}

// 1. Get registration by email
export async function getRegistrationByEmail(email: string): Promise<Registration | null> {
  if (isFallbackMode()) {
    const mockData = readMockData();
    return mockData.registrations.find(r => r.user_email.toLowerCase() === email.trim().toLowerCase()) || null;
  }

  const { data, error } = await supabase!
    .from('registrations')
    .select('*')
    .eq('user_email', email.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) return null;
  return {
    ...data,
    row_id: String(data.row_id),
  };
}

// 2. Create registration
export async function createRegistration(data: {
  user_email: string;
  name: string;
  phone_number: string;
  role: string;
  role_other_detail: string;
  password_hash?: string;
}): Promise<Registration> {
  const qr_token = crypto.randomUUID();
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let backup_code = '';

  if (isFallbackMode()) {
    const mockData = readMockData();
    const existingCodes = new Set(mockData.registrations.map(r => r.backup_code));
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (!existingCodes.has(code)) {
        backup_code = code;
        break;
      }
    }
    const createdReg: Registration = {
      row_id: String(mockData.registrations.length + 2),
      user_email: data.user_email,
      name: data.name,
      phone_number: data.phone_number,
      role: data.role,
      role_other_detail: data.role_other_detail,
      qr_token,
      backup_code,
      status: 'registered',
      checked_in_at: '',
      checked_in_by: '',
      created_at: new Date().toISOString(),
      password_hash: data.password_hash || '',
    };
    mockData.registrations.push(createdReg);
    writeMockData(mockData.registrations, mockData.staff, mockData.scanLogs);
    return createdReg;
  }

  // Supabase Database mode
  const { data: existingRegs } = await supabase!
    .from('registrations')
    .select('backup_code');
  const existingCodes = new Set((existingRegs || []).map(r => r.backup_code));

  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!existingCodes.has(code)) {
      backup_code = code;
      break;
    }
  }

  const { data: newReg, error } = await supabase!
    .from('registrations')
    .insert({
      user_email: data.user_email,
      name: data.name,
      phone_number: data.phone_number,
      role: data.role,
      role_other_detail: data.role_other_detail,
      qr_token,
      backup_code,
      status: 'registered',
      password_hash: data.password_hash || '',
    })
    .select()
    .single();

  if (error || !newReg) {
    throw new Error(error?.message || 'Failed to insert registration into Supabase');
  }

  return {
    ...newReg,
    row_id: String(newReg.row_id),
  };
}

// 3. Get registration by token
export async function getRegistrationByToken(token: string): Promise<Registration | null> {
  if (isFallbackMode()) {
    const mockData = readMockData();
    return mockData.registrations.find(r => r.qr_token === token) || null;
  }

  const { data, error } = await supabase!
    .from('registrations')
    .select('*')
    .eq('qr_token', token)
    .maybeSingle();

  if (error || !data) return null;
  return { ...data, row_id: String(data.row_id) };
}

// 4. Get registration by backup code
export async function getRegistrationByBackupCode(code: string): Promise<Registration | null> {
  if (isFallbackMode()) {
    const mockData = readMockData();
    return mockData.registrations.find(r => r.backup_code === code.trim().toUpperCase()) || null;
  }

  const { data, error } = await supabase!
    .from('registrations')
    .select('*')
    .eq('backup_code', code.trim().toUpperCase())
    .maybeSingle();

  if (error || !data) return null;
  return { ...data, row_id: String(data.row_id) };
}

// 5. Mark Checked In (with atomic verification)
export async function markCheckedIn(
  rowId: string,
  staffEmail: string
): Promise<{ outcome: 'verified' | 'already_checked_in'; registration: Registration }> {
  if (isFallbackMode()) {
    const mockData = readMockData();
    const currentReg = mockData.registrations.find(r => r.row_id === rowId);
    if (!currentReg) {
      throw new Error(`Registration not found in mock cache at row ${rowId}`);
    }
    if (currentReg.status === 'checked_in') {
      return { outcome: 'already_checked_in', registration: currentReg };
    }
    const updatedReg: Registration = {
      ...currentReg,
      status: 'checked_in',
      checked_in_at: new Date().toISOString(),
      checked_in_by: staffEmail,
    };
    const idx = mockData.registrations.findIndex(r => r.row_id === rowId);
    if (idx !== -1) mockData.registrations[idx] = updatedReg;
    writeMockData(mockData.registrations, mockData.staff, mockData.scanLogs);
    return { outcome: 'verified', registration: updatedReg };
  }

  const id = parseInt(rowId, 10);
  if (isNaN(id)) {
    throw new Error('Invalid row ID format');
  }

  const checked_in_at = new Date().toISOString();
  // Atomically update ONLY if status is still 'registered' to prevent race conditions
  const { data: updatedReg, error: updateError } = await supabase!
    .from('registrations')
    .update({
      status: 'checked_in',
      checked_in_at,
      checked_in_by: staffEmail,
    })
    .eq('row_id', id)
    .eq('status', 'registered')
    .select()
    .maybeSingle();

  if (updateError) {
    throw new Error(updateError.message || 'Failed to update check-in status in Supabase');
  }

  // If no row was updated, it means it was already checked_in by another user or scan
  if (!updatedReg) {
    const { data: currentReg, error: fetchError } = await supabase!
      .from('registrations')
      .select('*')
      .eq('row_id', id)
      .maybeSingle();

    if (fetchError || !currentReg) {
      throw new Error(fetchError?.message || `Registration not found in Supabase with id ${id}`);
    }

    return {
      outcome: 'already_checked_in',
      registration: { ...currentReg, row_id: String(currentReg.row_id) },
    };
  }

  return {
    outcome: 'verified',
    registration: { ...updatedReg, row_id: String(updatedReg.row_id) },
  };
}

// 6. Check if email is in the Staff list
export async function isStaff(email: string): Promise<boolean> {
  if (isFallbackMode()) {
    const mockData = readMockData();
    const searchEmail = email.trim().toLowerCase();
    const isEmailInStaffList = (mockData.staff || []).map(s => s.toLowerCase()).includes(searchEmail);
    if (isEmailInStaffList) return true;

    const registration = mockData.registrations.find(r => r.user_email.toLowerCase() === searchEmail);
    return registration?.role === 'super_admin';
  }

  const searchEmail = email.trim().toLowerCase();

  const { data: staffData } = await supabase!
    .from('staff')
    .select('email')
    .eq('email', searchEmail)
    .maybeSingle();

  if (staffData) return true;

  const { data: regData } = await supabase!
    .from('registrations')
    .select('role')
    .eq('user_email', searchEmail)
    .maybeSingle();

  return regData?.role === 'super_admin';
}

// 7. Append log to ScanLog table
export async function appendScanLog(entry: ScanLogEntry): Promise<void> {
  if (isFallbackMode()) {
    const mockData = readMockData();
    mockData.scanLogs.push(entry);
    writeMockData(mockData.registrations, mockData.staff, mockData.scanLogs);
    console.log('Mock Scan Log appended:', entry);
    return;
  }

  await supabase!
    .from('scan_log')
    .insert({
      timestamp: entry.timestamp,
      input_method: entry.input_method,
      raw_input: entry.raw_input,
      result: entry.result,
      matched_email: entry.matched_email,
      scanned_by: entry.scanned_by,
    });
}

// 7b. Get recent scans (with registration details) - paginated
export async function getRecentScans(page: number = 1, limit: number = 10): Promise<{ logs: ScanLogEntry[]; total: number }> {
  const skip = (page - 1) * limit;

  if (isFallbackMode()) {
    const mockData = readMockData();
    const sortedLogs = [...mockData.scanLogs].reverse();
    const paginatedLogs = sortedLogs.slice(skip, skip + limit);
    return {
      logs: paginatedLogs,
      total: sortedLogs.length
    };
  }

  // Fetch total count
  const { count, error: countError } = await supabase!
    .from('scan_log')
    .select('*', { count: 'exact', head: true });

  const total = count || 0;

  const { data, error } = await supabase!
    .from('scan_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .range(skip, skip + limit - 1);

  if (error || !data) return { logs: [], total };
  return { logs: data as ScanLogEntry[], total };
}

// 8. Bulk create registrations
export async function createBulkRegistrations(data: {
  role: string;
  role_other_detail: string;
  count: number;
  prefix?: string;
}): Promise<Registration[]> {
  const { role, role_other_detail, count, prefix = 'Bulk' } = data;
  const registrations: Registration[] = [];
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

  if (isFallbackMode()) {
    const mockData = readMockData();
    const existingCodes = new Set(mockData.registrations.map(r => r.backup_code));

    for (let i = 0; i < count; i++) {
      const qr_token = crypto.randomUUID();
      let backup_code = '';
      for (let attempt = 0; attempt < 50; attempt++) {
        let code = '';
        for (let j = 0; j < 4; j++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (!existingCodes.has(code)) {
          backup_code = code;
          existingCodes.add(code);
          break;
        }
      }

      const newId = String(mockData.registrations.length + registrations.length + 2);
      const user_email = `bulk-${role.toLowerCase()}-${qr_token.substring(0, 8)}@event.com`;
      const name = `${prefix} #${i + 1}`;

      const createdReg: Registration = {
        row_id: newId,
        user_email,
        name,
        phone_number: '+910000000000',
        role,
        role_other_detail: role_other_detail,
        qr_token,
        backup_code,
        status: 'registered',
        checked_in_at: '',
        checked_in_by: '',
        created_at: new Date().toISOString(),
        password_hash: '',
      };
      registrations.push(createdReg);
    }

    mockData.registrations.push(...registrations);
    writeMockData(mockData.registrations, mockData.staff, mockData.scanLogs);
    return registrations;
  }

  // Supabase Database mode
  const { data: existingRegs } = await supabase!
    .from('registrations')
    .select('backup_code');
  const existingCodes = new Set((existingRegs || []).map(r => r.backup_code));

  const insertData = [];
  for (let i = 0; i < count; i++) {
    const qr_token = crypto.randomUUID();
    let backup_code = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let j = 0; j < 4; j++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (!existingCodes.has(code)) {
        backup_code = code;
        existingCodes.add(code);
        break;
      }
    }
    const user_email = `bulk-${role.toLowerCase()}-${qr_token.substring(0, 8)}@event.com`;
    const name = `${prefix} #${i + 1}`;

    insertData.push({
      user_email,
      name,
      phone_number: '+910000000000',
      role,
      role_other_detail: role_other_detail,
      qr_token,
      backup_code,
      status: 'registered',
      password_hash: '',
    });
  }

  const { data: newRegs, error } = await supabase!
    .from('registrations')
    .insert(insertData)
    .select();

  if (error || !newRegs) {
    throw new Error(error?.message || 'Failed to insert bulk registrations into Supabase');
  }

  return newRegs.map((reg: any) => ({
    ...reg,
    row_id: String(reg.row_id),
  }));
}

