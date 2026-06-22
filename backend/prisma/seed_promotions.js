// backend/prisma/seed_promotions.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed promotions...');

  // 1. Clear existing templates & promotions
  console.log('🗑️  Clearing promotions, templates, and coupon codes...');
  await prisma.couponCode.deleteMany();
  await prisma.promotionProduct.deleteMany();
  await prisma.promotionCondition.deleteMany();
  await prisma.promotionReward.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.promotionTemplate.deleteMany();

  // 2. Create Templates
  console.log('➕ Creating promotion templates...');
  const templates = [
    {
      name: 'Buy 1 Get 1',
      description: 'Buy one trigger item and get another one free.',
      type: 'BUY_X_GET_Y',
      configJson: JSON.stringify({
        triggerQuantity: 1,
        rewardQuantity: 1,
        autoApply: true
      })
    },
    {
      name: 'Buy 2 Get 1',
      description: 'Buy two trigger items and get a third one free.',
      type: 'BUY_X_GET_Y',
      configJson: JSON.stringify({
        triggerQuantity: 2,
        rewardQuantity: 1,
        autoApply: true
      })
    },
    {
      name: 'Buy 2 Get 2',
      description: 'Buy two trigger items and get two free.',
      type: 'BUY_X_GET_Y',
      configJson: JSON.stringify({
        triggerQuantity: 2,
        rewardQuantity: 2,
        autoApply: true
      })
    },
    {
      name: 'Flat 10% Off',
      description: 'Get a flat 10% discount on your order.',
      type: 'ORDER_VALUE',
      configJson: JSON.stringify({
        discountType: 'PERCENTAGE',
        discountValue: 10,
        minOrderAmount: 0
      })
    },
    {
      name: 'Flat 20% Off',
      description: 'Get a flat 20% discount on your order.',
      type: 'ORDER_VALUE',
      configJson: JSON.stringify({
        discountType: 'PERCENTAGE',
        discountValue: 20,
        minOrderAmount: 0
      })
    },
    {
      name: 'Free Drink',
      description: 'Get a free drink with your meal.',
      type: 'BUY_X_GET_Y',
      configJson: JSON.stringify({
        triggerQuantity: 1,
        rewardQuantity: 1,
        autoApply: false
      })
    },
    {
      name: 'Free Dessert',
      description: 'Get a free dessert when you spend above a certain amount.',
      type: 'BUY_X_GET_Y',
      configJson: JSON.stringify({
        triggerQuantity: 2,
        rewardQuantity: 1,
        autoApply: false
      })
    },
    {
      name: 'Festival Offer',
      description: 'Flat discount on orders above a minimum threshold.',
      type: 'ORDER_VALUE',
      configJson: JSON.stringify({
        discountType: 'FIXED',
        discountValue: 100,
        minOrderAmount: 800
      })
    },
    {
      name: 'Weekend Offer',
      description: 'Special weekend coupon code discount.',
      type: 'COUPON',
      configJson: JSON.stringify({
        couponCode: 'WEEKEND50',
        discountType: 'FIXED',
        discountValue: 50,
        minOrderAmount: 300
      })
    }
  ];

  for (const t of templates) {
    await prisma.promotionTemplate.create({
      data: t
    });
    console.log(`  Created template: ${t.name}`);
  }

  // 3. Create Sample Active Promotions based on existing products in the DB
  console.log('➕ Creating live promotions...');

  // Let's find some products
  const products = await prisma.product.findMany({ take: 20 });
  if (products.length === 0) {
    console.log('⚠️  No products found to link promotions to. Please seed products first.');
    return;
  }

  // Try to find specific products
  const burger = products.find(p => p.name.toLowerCase().includes('burger')) || products[0];
  const fries = products.find(p => p.name.toLowerCase().includes('fries') || p.name.toLowerCase().includes('sandwich')) || products[Math.min(1, products.length - 1)];
  const coke = products.find(p => p.name.toLowerCase().includes('coke') || p.name.toLowerCase().includes('beverage') || p.name.toLowerCase().includes('coffee')) || products[Math.min(2, products.length - 1)];
  const dessert = products.find(p => p.name.toLowerCase().includes('cake') || p.name.toLowerCase().includes('dessert') || p.name.toLowerCase().includes('pastry')) || products[Math.min(3, products.length - 1)];

  // Promotion 1: Coupon Code 'WELCOME10'
  await prisma.promotion.create({
    data: {
      name: 'Welcome Discount',
      description: 'Get 10% off your first order!',
      type: 'COUPON',
      isActive: true,
      couponCode: {
        create: {
          code: 'WELCOME10',
          description: '10% discount on order subtotal'
        }
      },
      conditions: {
        create: {
          minOrderAmount: 200 // ₹200 min
        }
      },
      rewards: {
        create: {
          discountType: 'PERCENTAGE',
          discountValue: 10
        }
      }
    }
  });
  console.log('  Created Promotion: WELCOME10 coupon');

  // Promotion 2: Product Discount (e.g. 20% OFF on Burger)
  await prisma.promotion.create({
    data: {
      name: 'Burger Bonanza',
      description: `Get 20% OFF on ${burger.name}!`,
      type: 'PRODUCT_DISCOUNT',
      isActive: true,
      products: {
        create: {
          productId: burger.id,
          role: 'DISCOUNTED'
        }
      },
      rewards: {
        create: {
          discountType: 'PERCENTAGE',
          discountValue: 20
        }
      }
    }
  });
  console.log(`  Created Promotion: 20% OFF on ${burger.name}`);

  // Promotion 3: Buy X Get Y (Buy 2 Burger -> Get 1 Coke Free)
  await prisma.promotion.create({
    data: {
      name: 'Burger & Drink BOGO',
      description: `Buy 2 ${burger.name}s and get 1 ${coke.name} Free!`,
      type: 'BUY_X_GET_Y',
      isActive: true,
      conditions: {
        create: {
          triggerProductId: burger.id,
          triggerQuantity: 2
        }
      },
      rewards: {
        create: {
          rewardProductId: coke.id,
          rewardQuantity: 1
        }
      }
    }
  });
  console.log(`  Created Promotion: Buy 2 ${burger.name} -> Get 1 ${coke.name} Free`);

  // Promotion 4: Combo Offer (Burger + Fries + Coke = ₹399)
  // Check if we have three distinct products
  const comboProducts = [burger.id, fries.id, coke.id];
  await prisma.promotion.create({
    data: {
      name: 'Classic Burger Combo',
      description: `${burger.name} + ${fries.name} + ${coke.name} for ₹399`,
      type: 'COMBO',
      isActive: true,
      products: {
        create: [
          { productId: burger.id, role: 'COMBO_ITEM' },
          { productId: fries.id, role: 'COMBO_ITEM' },
          { productId: coke.id, role: 'COMBO_ITEM' }
        ]
      },
      rewards: {
        create: {
          comboPrice: 399
        }
      }
    }
  });
  console.log(`  Created Promotion: Combo Offer (₹399 combo)`);

  // Promotion 5: Order Value Promotion (Order above ₹500 get Flat ₹50 Off)
  await prisma.promotion.create({
    data: {
      name: 'Super Saver Order Discount',
      description: 'Spend ₹500 or more and get Flat ₹50 Off!',
      type: 'ORDER_VALUE',
      isActive: true,
      conditions: {
        create: {
          minOrderAmount: 500
        }
      },
      rewards: {
        create: {
          discountType: 'FIXED',
          discountValue: 50
        }
      }
    }
  });
  console.log('  Created Promotion: Flat ₹50 Off above ₹500');

  console.log('\n✅ Seeding promotions completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding promotions failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
