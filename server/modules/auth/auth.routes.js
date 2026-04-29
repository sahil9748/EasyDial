const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authLimiter } = require('../../middleware/rateLimiter');

router.post('/login', authLimiter, authController.login);
router.post('/register', authController.register);
router.get('/me', authController.me);

module.exports = router;
