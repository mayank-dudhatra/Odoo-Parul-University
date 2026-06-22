// backend/src/controllers/promotion.controller.js
const prisma = require('../lib/prisma');
const PromotionService = require('../services/promotion.service');
const { z } = require('zod');

// Schema validations
const promotionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  type: z.enum(['COUPON', 'PRODUCT_DISCOUNT', 'BUY_X_GET_Y', 'COMBO', 'ORDER_VALUE']),
  isActive: z.boolean().default(true),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  couponCode: z.string().optional().nullable(),
  products: z.array(z.object({
    productId: z.string().uuid(),
    role: z.enum(['TRIGGER', 'REWARD', 'DISCOUNTED', 'COMBO_ITEM'])
  })).optional().default([]),
  minOrderAmount: z.preprocess((val) => val === undefined || val === null || val === "" ? null : Number(val), z.number().nullable().optional()),
  triggerProductId: z.string().uuid().optional().nullable(),
  triggerQuantity: z.preprocess((val) => val === undefined || val === null || val === "" ? null : Number(val), z.number().int().nullable().optional()),
  rewardProductId: z.string().uuid().optional().nullable(),
  rewardQuantity: z.preprocess((val) => val === undefined || val === null || val === "" ? null : Number(val), z.number().int().nullable().optional()),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional().nullable(),
  discountValue: z.preprocess((val) => val === undefined || val === null || val === "" ? null : Number(val), z.number().nullable().optional()),
  comboPrice: z.preprocess((val) => val === undefined || val === null || val === "" ? null : Number(val), z.number().nullable().optional())
});

exports.getPromotions = async (req, res) => {
  try {
    const promotions = await prisma.promotion.findMany({
      include: {
        couponCode: true,
        products: {
          include: {
            product: {
              select: { id: true, name: true, price: true }
            }
          }
        },
        conditions: true,
        rewards: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(promotions);
  } catch (error) {
    console.error('Failed to get promotions:', error);
    res.status(500).json({ error: 'Failed to fetch promotions' });
  }
};

exports.createPromotion = async (req, res) => {
  try {
    const data = promotionSchema.parse(req.body);
    
    // Check if coupon code already exists
    if (data.type === 'COUPON' && data.couponCode) {
      const codeClean = data.couponCode.toUpperCase().trim();
      const existing = await prisma.couponCode.findUnique({
        where: { code: codeClean }
      });
      if (existing) {
        return res.status(400).json({ error: 'Coupon code already exists' });
      }
    }

    const newPromo = await prisma.promotion.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        isActive: data.isActive,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        couponCode: data.type === 'COUPON' && data.couponCode ? {
          create: {
            code: data.couponCode.toUpperCase().trim(),
            description: data.description,
            isActive: data.isActive
          }
        } : undefined,
        products: data.products && data.products.length > 0 ? {
          create: data.products.map(p => ({
            productId: p.productId,
            role: p.role
          }))
        } : undefined,
        conditions: (data.minOrderAmount !== null || data.triggerProductId) ? {
          create: {
            minOrderAmount: data.minOrderAmount,
            triggerProductId: data.triggerProductId,
            triggerQuantity: data.triggerQuantity
          }
        } : undefined,
        rewards: (data.discountValue !== null || data.comboPrice !== null || data.rewardProductId) ? {
          create: {
            rewardProductId: data.rewardProductId,
            rewardQuantity: data.rewardQuantity,
            discountType: data.discountType,
            discountValue: data.discountValue,
            comboPrice: data.comboPrice
          }
        } : undefined
      }
    });

    // Clear service cache so changes reflect instantly
    PromotionService.clearCache();

    res.status(201).json(newPromo);
  } catch (error) {
    console.error('Failed to create promotion:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
};

exports.updatePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const data = promotionSchema.parse(req.body);

    const existingPromo = await prisma.promotion.findUnique({
      where: { id },
      include: { couponCode: true }
    });

    if (!existingPromo) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    // Verify coupon unique code constraints
    if (data.type === 'COUPON' && data.couponCode) {
      const codeClean = data.couponCode.toUpperCase().trim();
      const existingCode = await prisma.couponCode.findUnique({
        where: { code: codeClean }
      });
      if (existingCode && existingCode.promotionId !== id) {
        return res.status(400).json({ error: 'Coupon code already in use by another promotion' });
      }
    }

    // Run updates inside a transaction to maintain consistency
    await prisma.$transaction([
      prisma.promotionProduct.deleteMany({ where: { promotionId: id } }),
      prisma.promotionCondition.deleteMany({ where: { promotionId: id } }),
      prisma.promotionReward.deleteMany({ where: { promotionId: id } }),
      prisma.couponCode.deleteMany({ where: { promotionId: id } }),
    ]);

    const updated = await prisma.promotion.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        isActive: data.isActive,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        couponCode: data.type === 'COUPON' && data.couponCode ? {
          create: {
            code: data.couponCode.toUpperCase().trim(),
            description: data.description,
            isActive: data.isActive
          }
        } : undefined,
        products: data.products && data.products.length > 0 ? {
          create: data.products.map(p => ({
            productId: p.productId,
            role: p.role
          }))
        } : undefined,
        conditions: (data.minOrderAmount !== null || data.triggerProductId) ? {
          create: {
            minOrderAmount: data.minOrderAmount,
            triggerProductId: data.triggerProductId,
            triggerQuantity: data.triggerQuantity
          }
        } : undefined,
        rewards: (data.discountValue !== null || data.comboPrice !== null || data.rewardProductId) ? {
          create: {
            rewardProductId: data.rewardProductId,
            rewardQuantity: data.rewardQuantity,
            discountType: data.discountType,
            discountValue: data.discountValue,
            comboPrice: data.comboPrice
          }
        } : undefined
      }
    });

    PromotionService.clearCache();
    res.json(updated);
  } catch (error) {
    console.error('Failed to update promotion:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
};

exports.deletePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.promotion.delete({
      where: { id }
    });

    PromotionService.clearCache();
    res.json({ message: 'Promotion deleted successfully' });
  } catch (error) {
    console.error('Failed to delete promotion:', error);
    res.status(500).json({ error: 'Failed to delete promotion' });
  }
};

exports.togglePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const updated = await prisma.promotion.update({
      where: { id },
      data: { isActive: !!isActive }
    });

    // Update the associated coupon status if it exists
    const coupon = await prisma.couponCode.findUnique({
      where: { promotionId: id }
    });
    if (coupon) {
      await prisma.couponCode.update({
        where: { promotionId: id },
        data: { isActive: !!isActive }
      });
    }

    PromotionService.clearCache();
    res.json(updated);
  } catch (error) {
    console.error('Failed to toggle promotion:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
};

exports.getActivePromotions = async (req, res) => {
  try {
    const active = await PromotionService.getActivePromotions();
    res.json(active);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch active promotions' });
  }
};

exports.evaluateCartEndpoint = async (req, res) => {
  try {
    const { items, couponCode, customer, autoApply, appliedManualPromotions } = req.body;
    const result = await PromotionService.evaluateCart(
      items,
      couponCode,
      customer,
      autoApply,
      appliedManualPromotions
    );
    res.json(result);
  } catch (error) {
    console.error('Cart evaluation error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    // Get completed and paid orders
    const paidOrders = await prisma.order.findMany({
      where: {
        status: { in: ['COMPLETED', 'PAID'] }
      }
    });

    const totalOrders = paidOrders.length;
    let promoOrdersCount = 0;
    let totalDiscountSavings = 0;
    
    const couponUsage = {};
    const promoUsage = {};

    paidOrders.forEach(order => {
      let hasPromo = false;
      const discount = Number(order.discountAmount) || 0;
      
      if (discount > 0) {
        totalDiscountSavings += discount;
      }

      // If we stored coupon/promotions applied in Json format
      if (order.appliedPromotions) {
        let appliedList = [];
        try {
          appliedList = typeof order.appliedPromotions === 'string' 
            ? JSON.parse(order.appliedPromotions) 
            : order.appliedPromotions;
        } catch (e) {
          appliedList = [];
        }

        if (Array.isArray(appliedList) && appliedList.length > 0) {
          hasPromo = true;
          appliedList.forEach(promo => {
            const name = promo.name || 'Unknown Promo';
            promoUsage[name] = (promoUsage[name] || 0) + 1;
            
            if (promo.type === 'COUPON' && promo.code) {
              couponUsage[promo.code] = (couponUsage[promo.code] || 0) + 1;
            }
          });
        }
      } else if (order.discountCode) {
        hasPromo = true;
        couponUsage[order.discountCode] = (couponUsage[order.discountCode] || 0) + 1;
        promoUsage[order.discountCode] = (promoUsage[order.discountCode] || 0) + 1;
      }

      if (hasPromo) {
        promoOrdersCount++;
      }
    });

    // Formatting outputs
    const mostUsedCoupons = Object.entries(couponUsage)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topPromotions = Object.entries(promoUsage)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const conversionRate = totalOrders > 0 
      ? Math.round((promoOrdersCount / totalOrders) * 100) 
      : 0;

    res.json({
      totalOrders,
      promoOrdersCount,
      revenueGeneratedByPromotions: totalDiscountSavings, // total value of savings given to drive orders
      promotionConversionRate: conversionRate,
      mostUsedCoupons,
      topPromotions
    });
  } catch (error) {
    console.error('Failed to load analytics:', error);
    res.status(500).json({ error: 'Failed to compute analytics' });
  }
};
