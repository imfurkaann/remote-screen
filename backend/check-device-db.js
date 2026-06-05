import mongoose from 'mongoose';

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/remote_screen');
  const Device = mongoose.model('Device', new mongoose.Schema({}, { strict: false }));
  const devices = await Device.find({});
  console.log(JSON.stringify(devices, null, 2));
  await mongoose.disconnect();
}

check().catch(console.error);
