const express = require('express');
const { getUsers, getUserProfile, updateHeartbeat } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

router.route('/').get(protect, getUsers);
router.route('/profile').get(protect, getUserProfile);
router.route('/heartbeat').put(protect, updateHeartbeat);

module.exports = router;
