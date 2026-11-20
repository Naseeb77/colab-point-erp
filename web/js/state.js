import { db } from './api.js';

export const state = { profile: null, email: '', settings: null, cache: {} };

const role = () => state.profile?.role;
export const can = {
  staff: () => !!role() && role() !== 'member',
  finance: () => ['owner', 'admin', 'manager', 'accountant', 'receptionist'].includes(role()),
  editFinance: () => ['owner', 'admin', 'manager', 'accountant'].includes(role()),
  admin: () => ['owner', 'admin'].includes(role()),
  hr: () => ['owner', 'admin', 'manager', 'accountant'].includes(role()),
};

export async function cached(key, loader, ttl = 60000) {
  const c = state.cache[key];
  if (c && Date.now() - c.t < ttl) return c.v;
  const v = await loader();
  state.cache[key] = { v, t: Date.now() };
  return v;
}
export const bust = (...keys) => keys.forEach((k) => delete state.cache[k]);

export const plans = () => cached('plans', () => db.select('plans', { select: '*', order: 'sort_order.asc' }));
export const seats = () => cached('seats', () => db.select('seats', { select: '*', order: 'code.asc' }));
export const lockers = () => cached('lockers', () => db.select('lockers', { select: '*', order: 'code.asc' }));
export const employeesList = () => cached('employees', () => db.select('employees', { select: 'id,full_name,designation,phone,status', status: 'neq.left', order: 'full_name.asc' }));
export const staffProfiles = () => cached('staffProfiles', () => db.select('profiles', { select: 'id,full_name,role', role: 'neq.member', active: 'eq.true', order: 'full_name.asc' }));
export const vendorsList = () => cached('vendors', () => db.select('vendors', { select: 'id,name,service,phone', active: 'eq.true', order: 'name.asc' }));
export const shifts = () => cached('shifts', () => db.select('shifts', { select: '*', order: 'start_time.asc' }));
export const templates = () => cached('templates', () => db.select('message_templates', { select: '*', active: 'eq.true' }), 300000);
