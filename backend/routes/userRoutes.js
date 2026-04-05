const express = require('express');
const { getUsers, getUserProfile } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const router = express.Router();

router.route('/').get(protect, getUsers);
router.route('/profile').get(protect, getUserProfile);

module.exports = router;
