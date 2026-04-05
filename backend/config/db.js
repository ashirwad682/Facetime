const mongoose = require('mongoose');

let cachedConnection = null;

const connectDB = async () => {
  if (cachedConnection) {
    return cachedConnection;
  }

  try {
    mongoose.set('strictQuery', false);
    
    cachedConnection = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aashirshiya', {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
    
    console.log(`MongoDB Connected: ${cachedConnection.connection.host}`);
    return cachedConnection;
  } catch (error) {
    console.error(`DATABASE CONNECTION ERROR: ${error.message}`);
    // Do not exit in serverless environment to allow for cold starts
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
    throw error;
  }
};

module.exports = connectDB;
