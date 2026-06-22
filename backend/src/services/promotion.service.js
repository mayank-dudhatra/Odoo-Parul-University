// backend/src/services/promotion.service.js
const prisma = require('../lib/prisma');

let activePromotionsCache = [];
let cacheLoaded = false;

// Load promotions and keep them in cache
async function loadPromotionsToCache() {
  try {
    const promotions = await prisma.promotion.findMany({
      where: { isActive: true },
      include: {
        couponCode: true,
        products: {
          include: {
            product: true
          }
        },
        conditions: true,
        rewards: true
      }
    });

    const now = new Date();
    // Filter active promotions by date range
    activePromotionsCache = promotions.filter(promo => {
      if (promo.startDate && new Date(promo.startDate) > now) {
        return false;
      }
      if (promo.endDate && new Date(promo.endDate) < now) {
        return false;
      }
      return true;
    });

    cacheLoaded = true;
    console.log(`✨ Promotion Cache Loaded: ${activePromotionsCache.length} active promotions.`);
  } catch (error) {
    console.error('❌ Failed to load promotions into cache:', error);
  }
}

async function getActivePromotions() {
  if (!cacheLoaded) {
    await loadPromotionsToCache();
  }
  return activePromotionsCache;
}

function clearCache() {
  cacheLoaded = false;
  activePromotionsCache = [];
}

/**
 * Evaluates cart items against active promotions
 * @param {Array} rawItems - [{ productId, quantity, variantId, notes }]
 * @param {String} couponCode - Coupon code to validate
 * @param {Object} customer - Customer info
 * @param {Boolean} autoApply - Automatically apply rewards/free items
 * @param {Array} appliedManualPromotions - Promotion IDs manually accepted
 */
async function evaluateCart(rawItems, couponCode, customer, autoApply = true, appliedManualPromotions = []) {
  const activePromotions = await getActivePromotions();
  
  if (!rawItems || rawItems.length === 0) {
    return {
      items: [],
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
      appliedPromotions: [],
      availableOffers: []
    };
  }

  // Fetch all product details for items in rawItems and potential rewards
  const productIds = new Set(rawItems.map(item => item.productId));
  
  // Find potential BOGO reward products to pre-fetch details
  activePromotions.forEach(promo => {
    if (promo.type === 'BUY_X_GET_Y') {
      promo.rewards.forEach(r => {
        if (r.rewardProductId) productIds.add(r.rewardProductId);
      });
    }
  });

  const dbProducts = await prisma.product.findMany({
    where: { id: { in: Array.from(productIds) } },
    include: { category: true, variants: true }
  });

  const productMap = new Map(dbProducts.map(p => [p.id, p]));

  // Map raw items to evaluation model
  let items = rawItems.map(item => {
    const product = productMap.get(item.productId);
    if (!product) return null;

    let basePrice = Number(product.price);
    let variantName = null;
    if (item.variantId) {
      const variant = product.variants.find(v => v.id === item.variantId);
      if (variant) {
        basePrice += Number(variant.extraPrice);
        variantName = variant.name;
      }
    }

    return {
      productId: item.productId,
      productName: product.name,
      categoryName: product.category?.name || "Uncategorized",
      imageUrl: product.imageUrl,
      originalPrice: basePrice,
      price: basePrice,
      quantity: item.quantity,
      variantId: item.variantId || null,
      variantName: variantName,
      notes: item.notes || null,
      isFree: false,
      discountAmount: 0,
      appliedPromotionId: null,
      appliedPromotionName: null,
      taxRate: Number(product.tax) || 0
    };
  }).filter(Boolean);

  let appliedPromotionsList = [];
  let availableOffers = [];

  // 1. PRODUCT DISCOUNT PROMOTIONS
  const productDiscounts = activePromotions.filter(p => p.type === 'PRODUCT_DISCOUNT');
  productDiscounts.forEach(promo => {
    const promoProdIds = promo.products
      .filter(pp => pp.role === 'DISCOUNTED')
      .map(pp => pp.productId);
    
    const reward = promo.rewards[0];
    if (!reward) return;

    items.forEach(item => {
      if (promoProdIds.includes(item.productId) && !item.appliedPromotionId) {
        let discountVal = Number(reward.discountValue);
        let itemDiscount = 0;
        
        if (reward.discountType === 'PERCENTAGE') {
          itemDiscount = item.originalPrice * (discountVal / 100);
        } else {
          itemDiscount = discountVal;
        }

        item.price = Math.max(0, item.originalPrice - itemDiscount);
        item.discountAmount = (item.originalPrice - item.price) * item.quantity;
        item.appliedPromotionId = promo.id;
        item.appliedPromotionName = promo.name;

        appliedPromotionsList.push({
          promotionId: promo.id,
          name: promo.name,
          type: 'PRODUCT_DISCOUNT',
          discountAmount: item.discountAmount
        });
      }
    });
  });

  // 2. COMBO OFFERS
  const comboPromos = activePromotions.filter(p => p.type === 'COMBO');
  comboPromos.forEach(promo => {
    const comboProdIds = promo.products
      .filter(pp => pp.role === 'COMBO_ITEM')
      .map(pp => pp.productId);
    
    const reward = promo.rewards[0];
    if (!reward || !reward.comboPrice || comboProdIds.length === 0) return;

    // Check if all combo items are in the cart
    const itemsInCombo = items.filter(item => comboProdIds.includes(item.productId) && !item.appliedPromotionId);
    
    // Check if we have all required products
    const uniqueProductIdsInCart = new Set(itemsInCombo.map(item => item.productId));
    if (uniqueProductIdsInCart.size === comboProdIds.length) {
      // Find max combo units we can form
      const maxComboUnits = Math.min(
        ...comboProdIds.map(pid => {
          const matched = itemsInCombo.filter(item => item.productId === pid);
          return matched.reduce((sum, item) => sum + item.quantity, 0);
        })
      );

      if (maxComboUnits > 0) {
        // We can apply combo to maxComboUnits sets!
        const comboPriceTarget = Number(reward.comboPrice);
        
        // Let's calculate total original price for one set of combo
        let oneSetOriginalPrice = 0;
        comboProdIds.forEach(pid => {
          const matchedItem = itemsInCombo.find(item => item.productId === pid);
          if (matchedItem) {
            oneSetOriginalPrice += matchedItem.originalPrice;
          }
        });

        const discountPerSet = oneSetOriginalPrice - comboPriceTarget;

        if (discountPerSet > 0) {
          let totalComboDiscount = discountPerSet * maxComboUnits;

          // Apply discount proportionally to items in the combo for correct pricing/tax calculation
          comboProdIds.forEach(pid => {
            const matchedItems = items.filter(item => item.productId === pid && !item.appliedPromotionId);
            let remainingUnitsToDiscount = maxComboUnits;
            
            matchedItems.forEach(item => {
              const qtyToDiscount = Math.min(item.quantity, remainingUnitsToDiscount);
              if (qtyToDiscount > 0) {
                const proportion = item.originalPrice / oneSetOriginalPrice;
                const itemDiscountPerUnit = discountPerSet * proportion;
                
                // If we discount less than the full quantity, we split the cart item
                if (qtyToDiscount < item.quantity) {
                  // Split item
                  const discountedItem = {
                    ...item,
                    quantity: qtyToDiscount,
                    price: Math.max(0, item.originalPrice - itemDiscountPerUnit),
                    discountAmount: itemDiscountPerUnit * qtyToDiscount,
                    appliedPromotionId: promo.id,
                    appliedPromotionName: promo.name
                  };
                  item.quantity -= qtyToDiscount;
                  items.push(discountedItem);
                } else {
                  // Discount the whole item
                  item.price = Math.max(0, item.originalPrice - itemDiscountPerUnit),
                  item.discountAmount = itemDiscountPerUnit * qtyToDiscount;
                  item.appliedPromotionId = promo.id;
                  item.appliedPromotionName = promo.name;
                }
                remainingUnitsToDiscount -= qtyToDiscount;
              }
            });
          });

          appliedPromotionsList.push({
            promotionId: promo.id,
            name: promo.name,
            type: 'COMBO',
            discountAmount: totalComboDiscount
          });
        }
      }
    }
  });

  // 3. BUY X GET Y (BOGO) PROMOTIONS
  const bogoPromos = activePromotions.filter(p => p.type === 'BUY_X_GET_Y');
  for (const promo of bogoPromos) {
    const condition = promo.conditions[0];
    const reward = promo.rewards[0];
    if (!condition || !reward || !condition.triggerProductId || !reward.rewardProductId) continue;

    const triggerProductId = condition.triggerProductId;
    const triggerQty = condition.triggerQuantity || 1;
    const rewardProductId = reward.rewardProductId;
    const rewardQty = reward.rewardQuantity || 1;

    // Find trigger items in cart (exclude free items or already promo-applied items)
    const triggerItems = items.filter(item => item.productId === triggerProductId && !item.isFree);
    const totalTriggerCount = triggerItems.reduce((sum, item) => sum + item.quantity, 0);

    const triggerMultiplier = Math.floor(totalTriggerCount / triggerQty);
    if (triggerMultiplier > 0) {
      const earnedRewardQty = triggerMultiplier * rewardQty;
      const isManualApplied = appliedManualPromotions.includes(promo.id);

      if (autoApply || isManualApplied) {
        // Apply offer: Make the reward items free
        const rewardProduct = productMap.get(rewardProductId);
        if (rewardProduct) {
          // Check if reward product is already in the cart as a normal item.
          // If so, we convert up to earnedRewardQty to free!
          const normalRewardItems = items.filter(item => item.productId === rewardProductId && !item.isFree);
          let remainingRewardToMakeFree = earnedRewardQty;

          for (const item of normalRewardItems) {
            const qtyToMakeFree = Math.min(item.quantity, remainingRewardToMakeFree);
            if (qtyToMakeFree > 0) {
              if (qtyToMakeFree < item.quantity) {
                // Split the item
                const freeItem = {
                  ...item,
                  quantity: qtyToMakeFree,
                  price: 0,
                  isFree: true,
                  discountAmount: item.originalPrice * qtyToMakeFree,
                  appliedPromotionId: promo.id,
                  appliedPromotionName: promo.name
                };
                item.quantity -= qtyToMakeFree;
                items.push(freeItem);
              } else {
                // Entire item becomes free
                item.price = 0;
                item.isFree = true;
                item.discountAmount = item.originalPrice * qtyToMakeFree;
                item.appliedPromotionId = promo.id;
                item.appliedPromotionName = promo.name;
              }
              remainingRewardToMakeFree -= qtyToMakeFree;
            }
          }

          // If we still have free items to add (e.g. they weren't in the cart already)
          if (remainingRewardToMakeFree > 0) {
            items.push({
              productId: rewardProductId,
              productName: rewardProduct.name,
              categoryName: rewardProduct.category?.name || "Uncategorized",
              imageUrl: rewardProduct.imageUrl,
              originalPrice: Number(rewardProduct.price),
              price: 0,
              quantity: remainingRewardToMakeFree,
              variantId: null,
              variantName: null,
              notes: "Free Product Reward",
              isFree: true,
              discountAmount: Number(rewardProduct.price) * remainingRewardToMakeFree,
              appliedPromotionId: promo.id,
              appliedPromotionName: promo.name,
              taxRate: Number(rewardProduct.tax) || 0
            });
          }

          appliedPromotionsList.push({
            promotionId: promo.id,
            name: promo.name,
            type: 'BUY_X_GET_Y',
            discountAmount: Number(rewardProduct.price) * earnedRewardQty
          });
        }
      } else {
        // Suggest this offer to the cashier
        const triggerProduct = productMap.get(triggerProductId);
        const rewardProduct = productMap.get(rewardProductId);
        
        availableOffers.push({
          promotionId: promo.id,
          name: promo.name,
          type: 'BUY_X_GET_Y',
          message: `Buy ${triggerQty} ${triggerProduct?.name || 'Trigger'} → Get ${rewardQty} ${rewardProduct?.name || 'Reward'} Free`,
          triggerProductId,
          rewardProductId,
          rewardQuantity: earnedRewardQty
        });
      }
    }
  }

  // Calculate Subtotal and Tax
  let subtotal = 0;
  let taxAmount = 0;
  let totalProductDiscount = 0;

  items.forEach(item => {
    // subtotal is based on original prices
    subtotal += item.originalPrice * item.quantity;
    totalProductDiscount += item.discountAmount;

    // Tax is calculated on the discounted price
    const itemSubtotal = item.price * item.quantity;
    taxAmount += itemSubtotal * (item.taxRate / 100);
  });

  // Calculate intermediate total before order-level discounts
  let intermediateTotal = subtotal - totalProductDiscount;

  // 4. ORDER VALUE PROMOTIONS
  let orderValueDiscountAmount = 0;
  const orderValuePromos = activePromotions.filter(p => p.type === 'ORDER_VALUE');
  
  orderValuePromos.forEach(promo => {
    const condition = promo.conditions[0];
    const reward = promo.rewards[0];
    if (!condition || !reward || !condition.minOrderAmount) return;

    const minAmount = Number(condition.minOrderAmount);
    if (intermediateTotal >= minAmount) {
      let discountVal = Number(reward.discountValue);
      let promoDiscount = 0;

      if (reward.discountType === 'PERCENTAGE') {
        promoDiscount = intermediateTotal * (discountVal / 100);
      } else {
        promoDiscount = discountVal;
      }

      // Cap at intermediateTotal
      if (promoDiscount > intermediateTotal) {
        promoDiscount = intermediateTotal;
      }

      orderValueDiscountAmount = Math.max(orderValueDiscountAmount, promoDiscount);
      
      // Track which one was used
      if (orderValueDiscountAmount === promoDiscount) {
        // Clear previous order level promotion from list if we found a better one
        appliedPromotionsList = appliedPromotionsList.filter(ap => ap.type !== 'ORDER_VALUE');
        appliedPromotionsList.push({
          promotionId: promo.id,
          name: promo.name,
          type: 'ORDER_VALUE',
          discountAmount: promoDiscount
        });
      }
    }
  });

  intermediateTotal -= orderValueDiscountAmount;

  // 5. COUPON CODE PROMOTIONS
  let couponDiscountAmount = 0;
  let couponPromoApplied = null;

  if (couponCode) {
    const cleanCode = couponCode.toUpperCase().trim();
    const couponPromo = activePromotions.find(p => p.type === 'COUPON' && p.couponCode && p.couponCode.code === cleanCode);

    if (couponPromo && couponPromo.couponCode.isActive) {
      const condition = couponPromo.conditions[0];
      const reward = couponPromo.rewards[0];
      let minAmount = condition ? Number(condition.minOrderAmount) || 0 : 0;

      if (intermediateTotal >= minAmount) {
        let discountVal = Number(reward.discountValue);
        if (reward.discountType === 'PERCENTAGE') {
          couponDiscountAmount = intermediateTotal * (discountVal / 100);
        } else {
          couponDiscountAmount = discountVal;
        }

        // Cap at intermediate total
        if (couponDiscountAmount > intermediateTotal) {
          couponDiscountAmount = intermediateTotal;
        }

        couponPromoApplied = {
          promotionId: couponPromo.id,
          name: couponPromo.name,
          type: 'COUPON',
          code: cleanCode,
          discountAmount: couponDiscountAmount
        };
      }
    }
  }

  if (couponPromoApplied) {
    appliedPromotionsList.push(couponPromoApplied);
    intermediateTotal -= couponDiscountAmount;
  }

  // Calculate final totals
  const totalDiscount = totalProductDiscount + orderValueDiscountAmount + couponDiscountAmount;
  const finalTotal = Math.max(0, subtotal + taxAmount - totalDiscount);

  return {
    items,
    subtotal,
    discountAmount: totalDiscount,
    taxAmount,
    totalAmount: finalTotal,
    appliedPromotions: appliedPromotionsList,
    availableOffers
  };
}

module.exports = {
  loadPromotionsToCache,
  getActivePromotions,
  clearCache,
  evaluateCart
};
