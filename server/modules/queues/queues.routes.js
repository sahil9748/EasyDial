const express = require('express');
const router = express.Router();
const ctrl = require('./queues.controller');
const auth = require('../../middleware/auth');
const rbac = require('../../middleware/rbac');

router.use(auth);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.get('/:id/agents', ctrl.listAgents);
router.post('/', rbac('admin'), ctrl.create);
router.put('/:id', rbac('admin'), ctrl.update);
router.delete('/:id', rbac('admin'), ctrl.remove);
router.post('/:id/agents', rbac('admin', 'supervisor'), ctrl.addAgent);
router.delete('/:id/agents/:agentId', rbac('admin', 'supervisor'), ctrl.removeAgent);

module.exports = router;
