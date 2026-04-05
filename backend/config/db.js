const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Suppress strictQuery warning for mongoose >= 7
    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aashirshiya');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
