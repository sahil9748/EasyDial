const express = require('express');
const router = express.Router();
const ctrl = require('./calls.controller');
const auth = require('../../middleware/auth');

router.use(auth);

router.get('/', ctrl.list);
router.get('/active', ctrl.listActive);
router.get('/:id', ctrl.getById);
router.get('/:id/recording', ctrl.getRecording);
router.post('/:id/disposition', ctrl.setDisposition);

module.exports = router;
