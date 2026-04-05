const User = require('../models/User');

const getUsers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }).select('-password');
    
    // Calculate isOnline dynamically based on last 60 seconds
    const threshold = new Date(Date.now() - 60000); 
    const usersWithStatus = users.map(user => ({
      ...user.toObject(),
      isOnline: user.lastSeen && user.lastSeen > threshold
    }));

    res.json(usersWithStatus);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const updateHeartbeat = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { lastSeen: Date.now() });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const getUserProfile = async (req, res) => {
  res.json(req.user);
};

module.exports = { getUsers, getUserProfile, updateHeartbeat };
