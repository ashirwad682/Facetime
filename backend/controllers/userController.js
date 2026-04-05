const User = require('../models/User');

const getUsers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } }).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

const getUserProfile = async (req, res) => {
  res.json(req.user);
};

module.exports = { getUsers, getUserProfile };
