import mongoose from 'mongoose';
import { getEnv } from './src/config/env.js';

async function check() {
  const env = getEnv();
  await mongoose.connect(env.mongoUri);
  const Tenant = mongoose.model('Tenant', new mongoose.Schema({}, { strict: false }));
  const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  
  const tenants = await Tenant.find({});
  const users = await User.find({});
  
  console.log("=== TENANTS ===");
  console.log(JSON.stringify(tenants, null, 2));
  console.log("=== USERS ===");
  console.log(JSON.stringify(users.map(u => ({ email: u.email, tenantId: u.tenantId, role: u.role })), null, 2));
  
  await mongoose.disconnect();
}

check().catch(console.error);
