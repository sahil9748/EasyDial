const express = require('express');
const router = express.Router();
const usersController = require('./users.controller');
const auth = require('../../middleware/auth');
const rbac = require('../../middleware/rbac');

router.use(auth);

router.get('/', rbac('admin', 'supervisor'), usersController.list);
router.get('/:id', rbac('admin', 'supervisor'), usersController.getById);
router.post('/', rbac('admin'), usersController.create);
router.put('/:id', rbac('admin'), usersController.update);
router.delete('/:id', rbac('admin'), usersController.remove);

module.exports = router;
