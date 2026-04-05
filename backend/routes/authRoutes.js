const express = require('express');
const { registerUser, loginUser, googleAuth } = require('../controllers/authController');
const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleAuth);
router.post('/test-login', async (req, res) => {
  const { name } = req.body;
  const User = require('../models/User');
  const jwt = require('jsonwebtoken');
  const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretjwtkey_aashirshiya2026', { expiresIn: '30d' });
  
  let user = await User.findOne({ name });
  if (!user) {
    user = await User.create({ name, email: `${name.toLowerCase()}@test.com`, password: 'testpassword' });
  }
  res.json({ _id: user._id, name: user.name, email: user.email, token: generateToken(user._id) });
});

module.exports = router;
