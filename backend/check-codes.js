import mongoose from 'mongoose';

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/remote_screen');
  const PairingCode = mongoose.model('PairingCode', new mongoose.Schema({}, { strict: false, collection: 'pairingcodes' }));
  const codes = await PairingCode.find({ consumedAt: null }).sort({ createdAt: -1 });
  console.log("Active Pairing Codes:");
  console.log(JSON.stringify(codes, null, 2));
  await mongoose.disconnect();
}

check().catch(console.error);
