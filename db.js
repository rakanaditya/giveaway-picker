import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error('Variabel MONGODB_URI belum diatur di Vercel Environment Variables.');
  }
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    }).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
});

const participantSchema = new mongoose.Schema({
  time: { type: Date, default: Date.now },
  username: { type: String, required: true, lowercase: true, trim: true },
  number: { type: Number, required: true }
});

const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  startTime: { type: Date },
  endTime: { type: Date },
  winnerUsername: { type: String, default: null },
  winnerNumber: { type: Number, default: null }
});

const logSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  action: String,
  username: String,
  details: String
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Participant = mongoose.models.Participant || mongoose.model('Participant', participantSchema);
export const Config = mongoose.models.Config || mongoose.model('Config', configSchema);
export const Log = mongoose.models.Log || mongoose.model('Log', logSchema);
