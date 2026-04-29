const express = require('express');
const router = express.Router();
const trunksController = require('./trunks.controller');
const auth = require('../../middleware/auth');
const rbac = require('../../middleware/rbac');

router.use(auth);
router.use(rbac('admin'));

router.get('/', trunksController.list);
router.get('/:id', trunksController.getById);
router.post('/', trunksController.create);
router.put('/:id', trunksController.update);
router.delete('/:id', trunksController.remove);
router.post('/:id/health-check', trunksController.healthCheck);

module.exports = router;
