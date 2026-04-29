const express = require('express');
const router = express.Router();
const ctrl = require('./campaigns.controller');
const auth = require('../../middleware/auth');
const rbac = require('../../middleware/rbac');
const multer = require('multer');

const upload = multer({ dest: '/tmp/uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

router.use(auth);
router.use(rbac('admin', 'supervisor'));

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.get('/:id/contacts', ctrl.listContacts);
router.get('/:id/stats', ctrl.getStats);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/contacts/upload', upload.single('file'), ctrl.uploadContacts);
router.post('/:id/start', ctrl.start);
router.post('/:id/pause', ctrl.pause);
router.post('/:id/stop', ctrl.stop);

module.exports = router;
