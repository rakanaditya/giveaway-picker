const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable inside Vercel.');
}

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
    }).then((mongoose) => mongoose);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }
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

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Participant = mongoose.models.Participant || mongoose.model('Participant', participantSchema);
const Config = mongoose.models.Config || mongoose.model('Config', configSchema);
const Log = mongoose.models.Log || mongoose.model('Log', logSchema);

module.exports = { connectDB, User, Participant, Config, Log };
