const express = require('express');
const router = express.Router();
const agentsController = require('./agents.controller');
const auth = require('../../middleware/auth');
const rbac = require('../../middleware/rbac');

router.use(auth);

router.get('/', rbac('admin', 'supervisor'), agentsController.list);
router.get('/status', agentsController.listStatuses);
router.get('/sip-status', agentsController.sipStatus);
router.get('/:id', agentsController.getById);
router.post('/', rbac('admin'), agentsController.create);
router.put('/:id', rbac('admin'), agentsController.update);
router.delete('/:id', rbac('admin'), agentsController.remove);
router.post('/:id/status', agentsController.setStatus);
router.post('/:id/login', agentsController.agentLogin);
router.post('/:id/logout', agentsController.agentLogout);

module.exports = router;
