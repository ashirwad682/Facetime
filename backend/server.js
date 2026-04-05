const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const Pusher = require('pusher');
const connectDB = require('./config/db');

dotenv.config();

// Startup Diagnostic logic remains, but connectDB() is now called per-request
if (!process.env.MONGO_URI) {
  console.warn("WARNING: MONGO_URI is missing in environment variables. Falling back to localhost.");
} else {
  console.log("MONGO_URI detected. Ready for first request.");
}

const app = express();
app.set('trust proxy', 1);

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "2137148",
  key: process.env.PUSHER_KEY || "c0389c21418ea0212407",
  secret: process.env.PUSHER_SECRET || "c10ca19b442e01c88e55",
  cluster: process.env.PUSHER_CLUSTER || "ap2",
  useTLS: true
});

// Middleware: BLOCK every request until DB is connected
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(503).json({ message: "Database connection failed. Please check your IP whitelist (0.0.0.0/0)." });
  }
});

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = [
      'http://localhost:5173',
      'http://localhost:5001'
    ];
    if (allowed.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Explicit OPTIONS handler for Pusher Auth Pre-flight
app.options('/api/pusher/auth', cors());

// Pusher Auth Route for Presence Channels (Online Status)
app.post('/api/pusher/auth', (req, res) => {
  const socketId = req.body.socket_id;
  const channel = req.body.channel_name;
  
  try {
    const userDataStr = req.body.user_data;
    const user = typeof userDataStr === 'string' ? JSON.parse(userDataStr) : userDataStr;
    
    if (!user || !user._id) {
      throw new Error("Invalid user data for Pusher auth");
    }

    console.log(`Pusher Auth Handshake for user: ${user.name} (${user._id}) on channel: ${channel}`);
    
    const auth = pusher.authenticate(socketId, channel, {
      user_id: user._id,
      user_info: { name: user.name, email: user.email }
    });
    res.send(auth);
  } catch (err) {
    console.error("PUSHER AUTH ERROR:", err.message);
    res.status(403).send("Authentication failed");
  }
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

app.get('/', (req, res) => {
  res.send('API is running...');
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ['https://facetime-7.vercel.app', 'http://localhost:5173', 'http://localhost:5001'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  allowEIO3: true,
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.post('/api/pusher/trigger', (req, res) => {
  const { channel, event, data } = req.body;
  pusher.trigger(channel, event, data);
  res.json({ success: true });
});

const PORT = process.env.PORT || 5001;

// Only listen if not running in Vercel's serverless environment
if (process.env.NODE_ENV !== 'production') {
  const server = http.createServer(app);
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

// Export for Vercel
module.exports = app;
