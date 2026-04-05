const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));

app.get('/', (req, res) => {
  res.send('API is running...');
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const userSocketMap = {};

io.on('connection', (socket) => {
  console.log(`User connected via socket: ${socket.id}`);

  socket.on('register-user', (userId) => {
    userSocketMap[userId] = socket.id;
    io.emit('online-users', Object.keys(userSocketMap));
  });

  socket.on('call-user', ({ to, offer, from, callerName }) => {
    const receiverSocketId = userSocketMap[to];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('incoming-call', {
        from,
        callerName,
        offer,
      });
    }
  });

  socket.on('silent-reconnect', ({ to, offer, from, callerName }) => {
    const receiverSocketId = userSocketMap[to];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('silent-reconnect-request', {
        from,
        callerName,
        offer,
      });
    }
  });

  socket.on('make-answer', ({ to, answer }) => {
    const callerSocketId = userSocketMap[to];
    if (callerSocketId) {
      io.to(callerSocketId).emit('call-answered', { answer });
    }
  });

  socket.on('renegotiate-offer', ({ to, offer, from }) => {
    const receiverSocketId = userSocketMap[to];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('renegotiate-offer', { offer, from });
    }
  });

  socket.on('renegotiate-answer', ({ to, answer }) => {
    const callerSocketId = userSocketMap[to];
    if (callerSocketId) {
      io.to(callerSocketId).emit('renegotiate-answer', { answer });
    }
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    const receiverSocketId = userSocketMap[to];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('ice-candidate', { candidate });
    }
  });

  socket.on('end-call', ({ to }) => {
    const receiverSocketId = userSocketMap[to];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('call-ended');
    }
  });

  socket.on('call-chat', ({ to, message, senderName }) => {
    const receiverSocketId = userSocketMap[to];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('call-chat', { message, senderName });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected via socket: ${socket.id}`);
    const userId = Object.keys(userSocketMap).find(key => userSocketMap[key] === socket.id);
    if (userId) {
      delete userSocketMap[userId];
      io.emit('online-users', Object.keys(userSocketMap));
    }
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
