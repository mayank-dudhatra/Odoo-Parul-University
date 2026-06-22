// backend/src/routes/promotion.routes.js
const express = require('express');
const router = express.Router();
const promotionController = require('../controllers/promotion.controller');
const { authenticateToken, requireRole } = require('../middlewares/auth.middleware');

// All promotions require login
router.use(authenticateToken);

// Public POS/terminal endpoints
router.get('/active', promotionController.getActivePromotions);
router.post('/evaluate', promotionController.evaluateCartEndpoint);

// Admin only endpoints
router.get('/', requireRole(['ADMIN']), promotionController.getPromotions);
router.post('/', requireRole(['ADMIN']), promotionController.createPromotion);
router.put('/:id', requireRole(['ADMIN']), promotionController.updatePromotion);
router.put('/:id/toggle', requireRole(['ADMIN']), promotionController.togglePromotion);
router.delete('/:id', requireRole(['ADMIN']), promotionController.deletePromotion);
router.get('/analytics', requireRole(['ADMIN']), promotionController.getAnalytics);

module.exports = router;
