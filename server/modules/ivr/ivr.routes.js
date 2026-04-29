const express = require('express');
const router = express.Router();
const ctrl = require('./ivr.controller');
const auth = require('../../middleware/auth');
const rbac = require('../../middleware/rbac');

router.use(auth);
router.use(rbac('admin', 'supervisor'));

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
